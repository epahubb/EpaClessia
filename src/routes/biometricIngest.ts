import { Router, Request, Response, NextFunction } from 'express';
import db from '../lib/db';
import {
  hashDeviceApiKey,
  resolvePunchEvent,
  isDuplicatePunch,
} from '../lib/attendance';

/**
 * Biometric attendance ingest for ZKTeco terminals.
 *
 * This router is mounted WITHOUT `authenticate`, because an attendance terminal
 * has no user to log in as. It authenticates with a per-device API key instead,
 * and every write is scoped to the tenant that registered the device, so a key
 * can only ever affect its own church.
 */
const router = Router();

type DeviceRequest = Request & { device?: any };

/** How many punches a device may submit in one batch. */
const MAX_PUNCHES_PER_REQUEST = 500;
/** How far around the submitted punches to look for candidate events. */
const EVENT_LOOKUP_PADDING_HOURS = 6;

async function authenticateDevice(req: Request, res: Response, next: NextFunction) {
  try {
    const presented = String(req.header('x-device-key') || (req.body as any)?.deviceKey || '');
    if (!presented) {
      return res.status(401).json({ error: 'Missing device key' });
    }

    // Look the device up by hash. The raw key is never stored, so a stolen
    // database backup cannot be replayed against this endpoint.
    const device = await db('biometric_devices')
      .where({ apiKeyHash: hashDeviceApiKey(presented) })
      .first();

    if (!device) return res.status(401).json({ error: 'Unrecognised device key' });
    if (!device.active) {
      return res.status(403).json({ error: 'This device has been deactivated' });
    }

    (req as DeviceRequest).device = device;
    next();
  } catch (error) {
    console.error('Device authentication error:', error);
    res.status(500).json({ error: 'Failed to authenticate the device' });
  }
}

/**
 * Connectivity check for installers: confirms the key works and reports the
 * server clock, which is the usual cause of punches landing on no event.
 */
router.get('/ping', authenticateDevice, async (req: Request, res: Response) => {
  const device = (req as DeviceRequest).device;
  try {
    await db('biometric_devices').where({ id: device.id }).update({ lastSeenAt: new Date() });
  } catch {
    // A failed heartbeat must not fail the ping itself.
  }
  res.json({
    ok: true,
    device: { id: device.id, name: device.name },
    serverTime: new Date().toISOString(),
  });
});

/**
 * Accept one or more punches.
 *
 * Every punch is stored even when it cannot be matched to a member or an event,
 * so nothing is silently lost and an operator can reconcile later. Only matched
 * punches produce an attendance record.
 */
router.post('/punches', authenticateDevice, async (req: Request, res: Response) => {
  const device = (req as DeviceRequest).device;
  const tenantId = device.tenantId;

  try {
    const body: any = req.body || {};
    // Accept a batch, or a single punch posted at the top level.
    const incoming: any[] = Array.isArray(body.punches)
      ? body.punches
      : body.biometricId
        ? [body]
        : [];

    if (incoming.length === 0) {
      return res.status(400).json({ error: 'Provide a punches array, or a single punch with a biometricId' });
    }
    if (incoming.length > MAX_PUNCHES_PER_REQUEST) {
      return res.status(413).json({
        error: `Too many punches in one request. The maximum is ${MAX_PUNCHES_PER_REQUEST}.`,
      });
    }

    const now = new Date();
    const parsed = incoming.map((p: any) => {
      const at = p?.punchedAt ? new Date(p.punchedAt) : now;
      return {
        biometricId: p?.biometricId ? String(p.biometricId).trim() : '',
        // A device with a wrong clock sends unparseable timestamps; fall back to
        // arrival time rather than dropping the punch.
        punchedAt: Number.isNaN(at.getTime()) ? now : at,
        eventId: p?.eventId ? String(p.eventId) : null,
      };
    });

    // Load only the events that could plausibly contain these punches.
    const stamps = parsed.map((p) => p.punchedAt.getTime());
    const padding = EVENT_LOOKUP_PADDING_HOURS * 3600 * 1000;
    const events = await db('events')
      .where({ tenantId })
      .where('startTime', '>=', new Date(Math.min(...stamps) - padding))
      .where('startTime', '<=', new Date(Math.max(...stamps) + padding))
      .select('id', 'startTime', 'endTime');

    const results: any[] = [];
    let matched = 0;
    let unmatched = 0;
    let duplicates = 0;

    for (const punch of parsed) {
      if (!punch.biometricId) {
        unmatched += 1;
        await db('biometric_punches').insert({
          tenantId,
          deviceId: device.id,
          biometricId: null,
          punchedAt: punch.punchedAt,
          status: 'unmatched',
          note: 'Punch arrived with no biometric id',
          createdAt: now,
        });
        results.push({ biometricId: null, status: 'unmatched', reason: 'missing_biometric_id' });
        continue;
      }

      const member = await db('members')
        .where({ tenantId, biometricId: punch.biometricId })
        .first();

      // An explicit eventId from the device is honoured only if it is ours.
      let eventId: string | null = null;
      if (punch.eventId) {
        const owned = events.find((e: any) => String(e.id) === punch.eventId);
        eventId = owned ? String(owned.id) : null;
      }
      if (!eventId) {
        eventId = resolvePunchEvent(punch.punchedAt, events as any[]);
      }

      const previous = await db('biometric_punches')
        .where({ tenantId, biometricId: punch.biometricId })
        .orderBy('punchedAt', 'desc')
        .first();
      const duplicate = isDuplicatePunch(previous?.punchedAt, punch.punchedAt);

      let status: string;
      let note: string | null = null;
      if (duplicate) {
        status = 'duplicate';
        note = 'Repeat punch inside the de-duplication window';
      } else if (member && eventId) {
        status = 'matched';
      } else {
        status = 'unmatched';
        note = !member
          ? 'No member is linked to this biometric id'
          : 'No event was in progress at this time';
      }

      await db('biometric_punches').insert({
        tenantId,
        deviceId: device.id,
        biometricId: punch.biometricId,
        memberId: member?.id || null,
        eventId,
        punchedAt: punch.punchedAt,
        status,
        note,
        createdAt: now,
      });

      if (status === 'matched' && member && eventId) {
        const existing = await db('event_attendance')
          .where({ tenantId, eventId, memberId: member.id })
          .first();

        const values = {
          present: true,
          method: 'biometric',
          status: 'checked_in',
          deviceId: device.id,
          checkInAt: punch.punchedAt,
        };

        if (existing) {
          await db('event_attendance').where({ id: existing.id }).update(values);
        } else {
          await db('event_attendance').insert({
            tenantId,
            eventId,
            memberId: member.id,
            createdAt: now,
            ...values,
          });
        }
        matched += 1;
      } else if (duplicate) {
        duplicates += 1;
      } else {
        unmatched += 1;
      }

      results.push({
        biometricId: punch.biometricId,
        memberId: member?.id || null,
        eventId,
        status,
        reason: note,
      });
    }

    await db('biometric_devices').where({ id: device.id }).update({ lastSeenAt: now });

    res.json({
      received: parsed.length,
      matched,
      unmatched,
      duplicates,
      results,
    });
  } catch (error) {
    console.error('POST /biometric/punches error:', error);
    res.status(500).json({ error: 'Failed to record the punches' });
  }
});

export default router;
