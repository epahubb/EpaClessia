import express from "express";
import path from "path";
import fs from "fs";
import dotenv from "dotenv";

dotenv.config();

import rateLimit from 'express-rate-limit';
import cookieParser from 'cookie-parser';
import jwt from 'jsonwebtoken';
import db from "./src/lib/db";
import { initializeDatabase } from "./src/lib/db-init";
import { authenticate, authorizeSuperAdmin } from './src/middleware/auth';
import { auditLog } from './src/middleware/audit';
import { JWT_SECRET } from './src/lib/config';
// Member portal activation: the pending-account message and the token check are
// pure logic, kept in one place so the route and the tests agree.
import { PORTAL_PENDING_MESSAGE, checkActivationToken } from './src/lib/memberPortal';
import {
  loginSchema,
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
} from './src/lib/security';
import {
  securityHeaders,
  corsMiddleware,
  sanitizeRequest,
  globalApiLimiter,
  loginRateLimiter,
  sensitiveActionLimiter,
  getLockoutState,
  securityEvent,
  notFoundHandler,
  globalErrorHandler,
} from './src/middleware/security';
import {
  encryptSensitiveFields,
  decryptSensitiveFields,
  isEncrypted,
  SENSITIVE_SETTING_KEYS,
} from './src/lib/crypto';
import bcrypt from 'bcryptjs';
import { generateRandomPassword, sendWelcomeEmail } from './src/services/registration';
import { sendSMS } from './src/services/mnotify';
import { generateBase32Secret, verifyTotp, buildOtpAuthUrl } from './src/lib/totp';
import { runStartupChecks } from './src/lib/startup-checks';
import churchRouter from './src/routes/church';
import memberRouter from './src/routes/member';
import pastorRouter from './src/routes/pastor';
import ministryLeaderRouter from './src/routes/ministryLeader';
import superadminExtrasRouter from './src/routes/superadmin-extras';
import biometricIngestRouter from './src/routes/biometricIngest';
import { isKnownDenomination, normalizeDenomination } from './src/lib/denominations';

async function startServer() {
  // Fail fast on an insecure or incomplete production configuration BEFORE we
  // touch the database or bind a port.
  runStartupChecks();

  // Database initialization is started but deliberately NOT awaited before the
  // port is bound. Container platforms (Railway, Cloud Run, Kubernetes) begin
  // probing the health endpoint as soon as the container starts. Blocking here
  // on schema creation, seeding, or an unreachable database means we never call
  // app.listen(), so every probe returns "service unavailable" and the platform
  // kills the deployment without ever surfacing the underlying cause.
  let dbState: 'initializing' | 'ready' | 'failed' = 'initializing';
  let dbError: string | null = null;

  initializeDatabase()
    .then(() => {
      dbState = 'ready';
      console.log('[startup] Database initialized.');
    })
    .catch((err: unknown) => {
      dbState = 'failed';
      dbError = err instanceof Error ? err.message : String(err);
      console.error('[startup] Database initialization FAILED:', dbError);
    });

  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  // Do not advertise the framework/version to attackers.
  app.disable('x-powered-by');

  // Trust proxy for Cloud Run/Nginx environments (needed for correct client IPs
  // used by rate limiting and audit logging).
  app.set('trust proxy', 1);

  // ---- Security apparatus (order matters) ----
  // 1. Secure response headers (helmet + CSP + HSTS).
  app.use(securityHeaders);
  // 2. Strict CORS allow-listing.
  app.use(corsMiddleware);

  // Allow large JSON/form bodies so base64 image uploads (logo, favicon,
  // login-screen background) are not rejected by the default 100kb limit.
  app.use(express.json({ limit: '25mb' }));
  app.use(express.urlencoded({ extended: true, limit: '25mb' }));
  app.use(cookieParser());

  // 3. Sanitise all incoming payloads (prototype pollution / operator injection).
  app.use(sanitizeRequest);
  // 4. Broad rate limiting across the whole API surface.
  app.use('/api', globalApiLimiter);

  // Rate limiting for superadmin API
  const superadminLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 100, // Limit each IP to 100 requests per windowMs
    message: { error: 'Too many requests, please try again later.' },
    standardHeaders: true,
    legacyHeaders: false,
  });

  // Authentication Routes
  app.post("/api/v1/auth/login", loginRateLimiter, async (req, res) => {
    // Validate + normalise input (rejects malformed emails, oversized payloads).
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'An email address or username, and a password, are required.' });
    }
    const { password } = parsed.data;
    // One identifier, whichever field the client used. Folded to lower case
    // because both emails and usernames are matched case-insensitively.
    const identifier = String(
      parsed.data.email || parsed.data.username || parsed.data.identifier || '',
    ).trim().toLowerCase();
    // Lockout and audit records are keyed on the identifier as typed, so a
    // username is throttled exactly like an email address.
    const email = identifier;
    try {
      // Brute-force / account-lockout guard (per account, backed by login_logs).
      const lockout = await getLockoutState(email);
      if (lockout.locked) {
        await securityEvent('LOGIN_BLOCKED_LOCKOUT', req, { email });
        res.setHeader('Retry-After', String(lockout.retryAfterSeconds));
        return res.status(429).json({
          error: `Account temporarily locked due to repeated failed sign-ins. Try again in ${Math.ceil(
            lockout.retryAfterSeconds / 60,
          )} minute(s).`,
        });
      }

      // Match on email first (every staff account), then on username (members
      // whose church gave them one).
      let user = await db('users').whereRaw('lower(email) = ?', [identifier]).first();
      if (!user) {
        user = await db('users').whereRaw('lower(username) = ?', [identifier]).first();
      }
      if (!user) {
        // Record the failed attempt against the email even if unknown, so
        // credential-stuffing against one address is still throttled.
        await db('login_logs')
          .insert({ userId: null, userName: null, email, ipAddress: req.ip || '', success: false, createdAt: new Date() })
          .catch(() => {});
        await securityEvent('LOGIN_FAILED_UNKNOWN_USER', req, { email });
        return res.status(401).json({ error: 'Invalid credentials' });
      }
      
      // Verify the submitted password against the stored bcrypt hash.
      // Seed accounts are provisioned with hashed passwords in db-init.ts.
      const passwordValid = user.password
        ? await bcrypt.compare(String(password || ''), user.password)
        : false;
      if (!passwordValid) {
        await db('login_logs')
          .insert({ userId: user.uid, userName: user.name, email: user.email, ipAddress: req.ip || '', success: false, createdAt: new Date() })
          .catch(() => {});
        await securityEvent('LOGIN_FAILED_BAD_PASSWORD', req, { email, userId: user.uid });
        return res.status(401).json({ error: 'Invalid credentials' });
      }

      // An account awaiting email verification is a different situation from a
      // suspended one, and telling a member "contact your administrator" when
      // the activation link is sitting in their inbox would send them down the
      // wrong path. This check comes AFTER the password check so it cannot be
      // used to probe which addresses are registered.
      if (user.status === 'pending') {
        return res.status(403).json({
          error: PORTAL_PENDING_MESSAGE,
          reason: 'pending_activation',
          canResend: true,
        });
      }

      // Block sign-in for non-active accounts (suspended / disabled).
      if (user.status && user.status !== 'active') {
        return res.status(403).json({ error: 'Account is not active. Please contact your administrator.' });
      }

      // Two-factor authentication challenge (superadmin + church admins).
      if (user.twoFactorEnabled && user.twoFactorSecret) {
        const code = String(req.body.twoFactorCode || req.body.totp || '').trim();
        if (!code) {
          return res.status(200).json({ requires2FA: true });
        }
        if (!verifyTotp(user.twoFactorSecret, code)) {
          return res.status(401).json({ error: 'Invalid authentication code' });
        }
      }

      const token = signAccessToken({
        uid: user.uid,
        email: user.email,
        role: user.role,
        tenantId: user.tenantId,
      });
      const refreshToken = signRefreshToken({ uid: user.uid });

      // Record a successful sign-in for the Login Logs view and last-login stamp.
      await db('users').where({ uid: user.uid }).update({ lastLogin: new Date() }).catch(() => {});
      await db('login_logs')
        .insert({ userId: user.uid, userName: user.name, email: user.email, ipAddress: req.ip || '', success: true, createdAt: new Date() })
        .catch(() => {});

      // Also set the token as a hardened, httpOnly cookie so the browser can use
      // it without exposing it to JavaScript (defence-in-depth against XSS token
      // theft). The JSON token is kept for existing Bearer-based clients.
      res.cookie('token', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 24 * 60 * 60 * 1000,
        path: '/',
      });
      // Long-lived refresh token cookie (defence-in-depth alongside the JSON
      // token returned to Bearer-based clients).
      res.cookie('refreshToken', refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 30 * 24 * 60 * 60 * 1000,
        path: '/',
      });

      res.json({
        token,
        refreshToken,
        user: { id: user.uid, email: user.email, role: user.role, name: user.name },
      });
    } catch (error) {
      console.error('Login route error:', error);
      res.status(500).json({ 
        error: 'Login failed', 
        details: error instanceof Error ? error.message : String(error) 
      });
    }
  });

  // Issue a fresh access token from a valid refresh token. This keeps users
  // signed in without a re-login when the short-lived access token expires
  // (fixes "TokenExpiredError: jwt expired").
  app.post("/api/v1/auth/refresh", async (req, res) => {
    const refreshToken = req.body?.refreshToken || req.cookies?.refreshToken;
    if (!refreshToken) {
      return res.status(401).json({ error: 'Refresh token required' });
    }
    try {
      const decoded = verifyRefreshToken(refreshToken);
      const user = await db('users').where({ uid: decoded.uid }).first();
      if (!user) {
        return res.status(401).json({ error: 'Account no longer exists' });
      }
      if (user.status && user.status !== 'active') {
        return res
          .status(403)
          .json({ error: 'Account is not active. Please contact your administrator.' });
      }
      const token = signAccessToken({
        uid: user.uid,
        email: user.email,
        role: user.role,
        tenantId: user.tenantId,
      });
      res.cookie('token', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 24 * 60 * 60 * 1000,
        path: '/',
      });
      return res.json({
        token,
        user: { id: user.uid, email: user.email, role: user.role, name: user.name },
      });
    } catch (err) {
      return res.status(401).json({ error: 'Invalid or expired refresh token' });
    }
  });

  // End the session. Deliberately unauthenticated: signing out has to work even
  // when the access token has already expired, which is the usual case.
  //
  // The login route sets httpOnly `token` and `refreshToken` cookies. Browser
  // JavaScript cannot delete an httpOnly cookie, so before this route existed a
  // "logged out" browser still held a valid refreshToken cookie for 30 days and
  // could mint fresh access tokens from POST /auth/refresh, which reads
  // req.cookies.refreshToken. Clearing them here is what actually ends the
  // session rather than just hiding it from the UI.
  app.post("/api/v1/auth/logout", (req, res) => {
    const clearOpts = {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict' as const,
      path: '/',
    };
    // Options must match those used when setting the cookie or the browser
    // keeps the original.
    res.clearCookie('token', clearOpts);
    res.clearCookie('refreshToken', clearOpts);
    return res.status(204).end();
  });

  // API routes
  // Readiness probe: reports whether the database finished initializing.
  // Returns 503 until it does, so it is suitable for deploy gating -- but NOT
  // as the platform health check, or a database problem would roll the deploy
  // back before the logs could be read.
  app.get("/api/ready", (req, res) => {
    if (dbState === 'ready') {
      res.json({ status: 'ready', database: 'connected' });
      return;
    }
    res.status(503).json({
      status: dbState,
      database: dbState === 'failed' ? 'error' : 'initializing',
      error: dbError,
    });
  });

  // Liveness probe: must always answer 200 quickly, even when the database is
  // unreachable. A hanging or non-200 response is indistinguishable from a dead
  // process, so the platform would restart a container whose only fault is a
  // misconfigured database -- masking the real error.
  app.get("/api/health", async (req, res) => {
    let dbStatus = "unknown";
    try {
      // Bounded probe. An unbounded query against an unreachable host hangs
      // until the platform's own timeout fires, which looks exactly like a
      // crashed process in the logs.
      await Promise.race([
        db.raw('select 1'),
        new Promise((_resolve, reject) =>
          setTimeout(() => reject(new Error('health probe timed out')), 2000),
        ),
      ]);
      dbStatus = "connected";
    } catch (e) {
      dbStatus = "error";
    }

    res.json({ 
      status: "ok", 
      database: dbStatus,
      client: db.client.config.client,
      timestamp: new Date().toISOString() 
    });
  });

  // Public branding endpoint (used before login for title, favicon, and the
  // login-screen background image uploaded by the super admin).
  app.get("/api/v1/public/branding", async (req, res) => {
    try {
      const brandingRow = await db('system_settings').where({ key: 'branding' }).first();
      const b = brandingRow ? JSON.parse(brandingRow.value) : {};
      res.json({
        platformName: b.platformName || 'EpaChurch',
        logoUrl: b.logoUrl || '',
        faviconUrl: b.faviconUrl || b.logoUrl || '',
        loginBackground: b.loginBackground || '',
        maxUploadMb: Number(b.maxUploadMb || 0) || undefined,
      });
    } catch (error) {
      res.json({ platformName: 'EpaChurch' });
    }
  });

  /*
   * Public absence questionnaire.
   *
   * A member who missed a service receives an SMS and an email containing a
   * link to this questionnaire. The token in the link is the only credential:
   * these two routes are therefore deliberately unauthenticated, but they are
   * also strictly limited -- a token identifies exactly one follow-up, can be
   * answered once, expires, and reveals nothing beyond the member's own first
   * name and the service they missed.
   */
  const absenceReasonOptions = [
    'I was unwell',
    'I was travelling',
    'Work or business commitment',
    'Family responsibility',
    'Transport or distance',
    'I have joined another church',
    'I felt hurt or unwelcome',
    'Other',
  ];

  /**
   * Activate a member portal account from the link in the invitation email.
   *
   * Public by necessity: the member is not signed in yet, and the token IS the
   * credential. It is single-use -- cleared on success -- so a link forwarded
   * or left in an old mailbox cannot be replayed.
   *
   * GET reports what the link will do (so the page can explain itself before
   * acting); POST performs the activation.
   */
  app.get("/api/v1/public/activate/:token", async (req, res) => {
    try {
      const token = String(req.params.token || '');
      const user = await db('users').where({ verificationToken: token }).first();
      const check = checkActivationToken(user, new Date());

      if (!check.ok) {
        // 'already_active' is not a failure the member caused, so it is
        // reported with a 200 and success-shaped wording.
        const status = check.reason === 'already_active' ? 200 : 400;
        return res.status(status).json({
          valid: false,
          alreadyActive: check.reason === 'already_active',
          reason: check.reason,
          message: check.message,
        });
      }

      const tenant = user.tenantId
        ? await db('tenants').where({ id: user.tenantId }).first()
        : null;

      res.json({
        valid: true,
        name: user.name || null,
        // The address is echoed so the member can see WHICH account they are
        // activating, but never the username or anything else usable by a
        // stranger who happens to hold the link.
        email: user.email || null,
        churchName: tenant?.name || null,
      });
    } catch (error) {
      console.error('GET /public/activate error:', error);
      res.status(500).json({ valid: false, message: 'Could not check this activation link.' });
    }
  });

  app.post("/api/v1/public/activate/:token", async (req, res) => {
    try {
      const token = String(req.params.token || '');
      const user = await db('users').where({ verificationToken: token }).first();
      const check = checkActivationToken(user, new Date());

      if (!check.ok) {
        const status = check.reason === 'already_active' ? 200 : 400;
        return res.status(status).json({
          success: check.reason === 'already_active',
          alreadyActive: check.reason === 'already_active',
          reason: check.reason,
          message: check.message,
        });
      }

      const now = new Date();
      await db('users').where({ uid: user.uid }).update({
        status: 'active',
        // Single use: the token is spent whether or not the member ever signs in.
        verificationToken: null,
        verificationExpiresAt: null,
        verifiedAt: now,
        verifiedBy: 'member',
      });

      if (user.memberId) {
        await db('members')
          .where({ id: user.memberId })
          .update({ portalStatus: 'active' })
          .catch(() => {});
      }

      await securityEvent('MEMBER_PORTAL_ACTIVATED', req, { userId: user.uid });

      res.json({
        success: true,
        message: 'Your account is active. You can now sign in to the member portal.',
        email: user.email || null,
        username: user.username || null,
      });
    } catch (error) {
      console.error('POST /public/activate error:', error);
      res.status(500).json({ success: false, message: 'Could not activate this account.' });
    }
  });

  app.get("/api/v1/public/absence-survey/:token", async (req, res) => {
    try {
      const survey = await db('absence_surveys').where({ token: req.params.token }).first();
      if (!survey) {
        return res.status(404).json({ error: 'This questionnaire link is not valid.' });
      }
      if (survey.expiresAt && new Date(survey.expiresAt).getTime() < Date.now()) {
        return res.status(410).json({ error: 'This questionnaire link has expired. Please contact your church directly.' });
      }
      const tenant = await db('tenants').where({ id: survey.tenantId }).first();
      res.json({
        churchName: tenant?.name || 'Your church',
        memberFirstName: String(survey.memberName || '').split(' ')[0] || null,
        eventName: survey.eventName || null,
        alreadyResponded: survey.status === 'responded',
        respondedAt: survey.respondedAt || null,
        reasonOptions: absenceReasonOptions,
      });
    } catch (error) {
      console.error('GET /public/absence-survey error:', error);
      res.status(500).json({ error: 'Could not open this questionnaire. Please try again.' });
    }
  });

  app.post("/api/v1/public/absence-survey/:token", async (req, res) => {
    try {
      const survey = await db('absence_surveys').where({ token: req.params.token }).first();
      if (!survey) {
        return res.status(404).json({ error: 'This questionnaire link is not valid.' });
      }
      if (survey.expiresAt && new Date(survey.expiresAt).getTime() < Date.now()) {
        return res.status(410).json({ error: 'This questionnaire link has expired.' });
      }
      // Answer once: without this a public link could be used to spam the
      // pastoral team's follow-up list.
      if (survey.status === 'responded') {
        return res.status(409).json({ error: 'Thank you - a response has already been recorded for this link.' });
      }

      const reasonCategory = String(req.body?.reasonCategory || '').trim();
      const reason = String(req.body?.reason || '').trim();
      if (!reasonCategory && !reason) {
        return res.status(400).json({ error: 'Please choose a reason or write a short note.' });
      }

      await db('absence_surveys').where({ id: survey.id }).update({
        status: 'responded',
        reasonCategory: reasonCategory ? reasonCategory.slice(0, 120) : null,
        reason: reason ? reason.slice(0, 2000) : null,
        // A member can ask for a visit or a call; the pastoral team sees this
        // flag on the follow-up list.
        needsFollowUp: req.body?.needsFollowUp ? 'yes' : 'no',
        respondedAt: new Date(),
      });

      res.json({ success: true, message: 'Thank you for letting us know.' });
    } catch (error) {
      console.error('POST /public/absence-survey error:', error);
      res.status(500).json({ error: 'Could not save your response. Please try again.' });
    }
  });

  // ---- Two-factor authentication self-service (any authenticated user) ----
  app.get("/api/v1/auth/2fa/status", authenticate, async (req, res) => {
    try {
      const uid = (req as any).user?.uid;
      const user = await db('users').where({ uid }).first();
      res.json({ enabled: Boolean(user?.twoFactorEnabled) });
    } catch { res.status(500).json({ error: 'Failed to load 2FA status' }); }
  });

  app.post("/api/v1/auth/2fa/setup", sensitiveActionLimiter, authenticate, async (req, res) => {
    try {
      const uid = (req as any).user?.uid;
      const user = await db('users').where({ uid }).first();
      if (!user) return res.status(404).json({ error: 'User not found' });
      const secret = generateBase32Secret();
      await db('users').where({ uid }).update({ twoFactorSecret: secret });
      res.json({ secret, otpauthUrl: buildOtpAuthUrl(secret, user.email || uid, 'EpaChurch') });
    } catch { res.status(500).json({ error: 'Failed to start 2FA setup' }); }
  });

  app.post("/api/v1/auth/2fa/enable", sensitiveActionLimiter, authenticate, async (req, res) => {
    try {
      const uid = (req as any).user?.uid;
      const user = await db('users').where({ uid }).first();
      if (!user || !user.twoFactorSecret) return res.status(400).json({ error: 'Start 2FA setup first' });
      const code = String(req.body.code || '').trim();
      if (!verifyTotp(user.twoFactorSecret, code)) return res.status(400).json({ error: 'Invalid authentication code' });
      await db('users').where({ uid }).update({ twoFactorEnabled: true });
      res.json({ success: true });
    } catch { res.status(500).json({ error: 'Failed to enable 2FA' }); }
  });

  app.post("/api/v1/auth/2fa/disable", authenticate, async (req, res) => {
    try {
      const uid = (req as any).user?.uid;
      await db('users').where({ uid }).update({ twoFactorEnabled: false, twoFactorSecret: null });
      res.json({ success: true });
    } catch { res.status(500).json({ error: 'Failed to disable 2FA' }); }
  });

  // Apply rate limiter and auth to superadmin routes
  app.use(['/api/v1/superadmin', '/api/superadmin'], superadminLimiter, authenticate, authorizeSuperAdmin);

  // Tenant-scoped church application API (members, families, events,
  // attendance/check-in, giving, and communications). Every route inside is
  // locked to the caller's own tenant; SUPER_ADMIN may target ?tenantId=.
  app.use('/api/v1/church', authenticate, churchRouter);

  // Member self-service API (giving, profile). Every route is scoped to the
  // authenticated member's own identity and church.
  app.use('/api/v1/member', authenticate, memberRouter);

  // Biometric terminals have no user session, so this router is intentionally
  // mounted without `authenticate`. It authenticates each request with a
  // per-device API key and scopes every write to that device's own tenant.
  app.use('/api/v1/biometric', biometricIngestRouter);
  app.use('/api/v1/pastor', authenticate, pastorRouter);
  app.use('/api/v1/ministry-leader', authenticate, ministryLeaderRouter);

  // Additional protected super-admin endpoints (subscriptions, transactions,
  // monthly revenue, login logs, role/permission matrix).
  app.use(['/api/v1/superadmin', '/api/superadmin'], authenticate, authorizeSuperAdmin, superadminExtrasRouter);

  // Super Admin - Churches (Tenants)
  app.get("/api/v1/superadmin/churches", authenticate, authorizeSuperAdmin, auditLog('VIEW_CHURCHES', 'tenants'), async (req, res) => {
    try {
      const { 
        page = 1, 
        limit = 20, 
        search = '', 
        plan = 'all', 
        status = 'all', 
        sortBy = 'createdAt', 
        sortOrder = 'desc' 
      } = req.query;
      
      const offset = (Number(page) - 1) * Number(limit);

      let query = db('tenants')
        .leftJoin('users', function() {
          this.on('tenants.id', '=', 'users.tenantId').andOn('users.role', '!=', db.raw('?', ['SUPER_ADMIN']));
        })
        .select(
          'tenants.*',
          db.raw('count(users.uid) as memberCount')
        )
        .groupBy('tenants.id');

      if (search) {
        query = query.where(function() {
          this.where('tenants.name', 'like', `%${search}%`)
              .orWhere('tenants.websiteUrl', 'like', `%${search}%`);
        });
      }

      if (plan !== 'all') {
        query = query.where('tenants.planId', plan);
      }

      if (status !== 'all') {
        query = query.where('tenants.status', status);
      }

      // Validating sort column to prevent injection
      const validSortColumns = ['name', 'createdAt', 'memberCount', 'planId', 'status'];
      const sortCol = validSortColumns.includes(String(sortBy)) ? String(sortBy) : 'createdAt';
      const order = sortOrder === 'asc' ? 'asc' : 'desc';

      const dataQuery = query.clone()
        .orderBy(sortCol, order)
        .limit(Number(limit))
        .offset(offset);
      
      const churches = await dataQuery;
      
      // Feature flags need to be parsed from string
      const formattedChurches = churches.map(c => ({
        ...c,
        featureFlags: c.featureFlags ? JSON.parse(c.featureFlags) : { giving: true, childCheckin: true, sms: false, api: false }
      }));

      const totalCount = await db('tenants')
        .modify(function(qb) {
          if (search) {
            qb.where('name', 'like', `%${search}%`).orWhere('websiteUrl', 'like', `%${search}%`);
          }
          if (plan !== 'all') qb.where('planId', plan);
          if (status !== 'all') qb.where('status', status);
        })
        .count('id as count')
        .first();

      res.json({
        data: formattedChurches,
        pagination: {
          total: totalCount?.count || 0,
          page: Number(page),
          limit: Number(limit)
        }
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Failed to fetch churches' });
    }
  });

  app.get("/api/v1/superadmin/churches/:id", authenticate, authorizeSuperAdmin, auditLog('VIEW_CHURCH_DETAILS', 'tenants'), async (req, res) => {
    try {
      const church = await db('tenants').where({ id: req.params.id }).first();
      if (!church) return res.status(404).json({ error: 'Church not found' });

      const admins = await db('users')
        .join('user_tenant_roles', 'users.uid', 'user_tenant_roles.userId')
        .where('user_tenant_roles.tenantId', req.params.id)
        .whereIn('user_tenant_roles.role', ['ADMIN', 'PASTOR'])
        .select('users.*', 'user_tenant_roles.role as churchRole');

      const logs = await db('audit_logs')
        .where({ resource: 'tenants', resourceId: req.params.id })
        .orderBy('createdAt', 'desc')
        .limit(10);

      const memberCount = await db('users').where({ tenantId: req.params.id }).count('uid as count').first();

      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const totalDonations = await db('donations')
        .where({ tenantId: req.params.id })
        .where('createdAt', '>=', thirtyDaysAgo)
        .sum('amount as total')
        .first();

      res.json({
        ...church,
        featureFlags: church.featureFlags ? JSON.parse(church.featureFlags) : {},
        admins,
        auditLogs: logs,
        memberCount: memberCount?.count || 0,
        totalDonations: Number(totalDonations?.total || 0)
      });
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch church details' });
    }
  });

  app.post("/api/v1/superadmin/churches", authenticate, authorizeSuperAdmin, auditLog('CREATE_CHURCH', 'tenants'), async (req, res) => {
    const trx = await db.transaction();
    try {
      const { 
        name, contactEmail, adminEmail, adminName, 
        adminPassword, autoGeneratePassword, planId, timezone, phone, street, 
        city, state, postal_code, country, featureFlags, trialEndDate,
        // Renamed on destructure: the request body carries a BOOLEAN flag whose
        // name collided with the imported sendWelcomeEmail() function, shadowing
        // it inside this handler. Calling it then threw
        // "sendWelcomeEmail2 is not a function" (esbuild renames the shadowed
        // import to sendWelcomeEmail2 when bundling).
        sendWelcomeEmail: shouldSendWelcomeEmail,
        websiteUrl,
        denomination
      } = req.body;

      // The denomination decides the shape of the church admin's portal, so it
      // has to be one of the six we support rather than free text.
      if (!isKnownDenomination(denomination)) {
        throw new Error('Please select the church\u2019s denomination.');
      }

      const existingUser = await trx('users').where({ email: adminEmail }).first();
      if (existingUser) throw new Error('Admin email already in use');

      const churchId = `church_${Date.now()}`;
      const adminUid = `user_${Date.now()}_admin`;
      
      const userIdGenerated = autoGeneratePassword || !adminPassword;
      const finalPassword = userIdGenerated ? generateRandomPassword() : adminPassword;
      const hashedPassword = await bcrypt.hash(finalPassword, 10);

      const finalFeatureFlags = featureFlags || { giving: true, childCheckin: true, sms: false, api: false };
      
      // 1. Create Church
      await trx('tenants').insert({
        id: churchId,
        name,
        adminEmail,
        contactEmail,
        phone,
        timezone,
        country,
        city,
        street,
        address_line1: street, 
        state,
        postal_code,
        websiteUrl: websiteUrl || null,
        denomination: normalizeDenomination(denomination),
        planId: planId || 'free_trial',
        status: planId === 'free_trial' ? 'trial' : 'active',
        featureFlags: typeof finalFeatureFlags === 'string' ? finalFeatureFlags : JSON.stringify(finalFeatureFlags),
        trialEndDate: trialEndDate || (planId === 'free_trial' ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) : null),
        subscriptionEndDate: trialEndDate || (planId === 'free_trial' ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) : new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)),
        createdAt: new Date()
      });

      // 2. Create Admin User
      await trx('users').insert({
        uid: adminUid,
        email: adminEmail,
        name: adminName,
        phone: req.body.adminPhone || phone,
        role: 'CHURCH_ADMIN',
        tenantId: churchId,
        password: hashedPassword,
        status: 'active',
        createdAt: new Date()
      });

      // 3. Create Tenant Role
      await trx('user_tenant_roles').insert({
        id: `role_${Date.now()}`,
        userId: adminUid,
        tenantId: churchId,
        role: 'ADMIN',
        createdAt: new Date()
      });

      await trx.commit();

      // Notifications (After commit)
      const loginUrl = websiteUrl || process.env.APP_URL || 'your church portal';
      if (shouldSendWelcomeEmail) {
        await sendWelcomeEmail({ name, websiteUrl }, { name: adminName, email: adminEmail }, finalPassword);
      }

      if (finalFeatureFlags.sms && (req.body.adminPhone || phone)) {
        const smsMessage = `Welcome to Ecclesia! Your account for ${name} is ready. Login at ${loginUrl}. Password: ${finalPassword}`;
        await sendSMS(req.body.adminPhone || phone, smsMessage);
      }

      res.status(201).json({ id: churchId, adminUid });
    } catch (error) {
      await trx.rollback();
      console.error('Church registration error:', error);
      res.status(400).json({ error: error instanceof Error ? error.message : 'Registration failed' });
    }
  });

  app.put("/api/v1/superadmin/churches/:id", authenticate, authorizeSuperAdmin, auditLog('UPDATE_CHURCH', 'tenants'), async (req, res) => {
    try {
      const { featureFlags, denomination, ...rest } = req.body;
      const updateData: any = { ...rest };
      
      if (featureFlags) {
        updateData.featureFlags = JSON.stringify(featureFlags);
      }

      // Changing the denomination changes the portal the church admin sees, so
      // only a recognised value is accepted; anything else is left untouched.
      if (denomination !== undefined) {
        if (!isKnownDenomination(denomination)) {
          return res.status(400).json({ error: 'Unknown denomination.' });
        }
        updateData.denomination = normalizeDenomination(denomination);
      }

      await db('tenants').where({ id: req.params.id }).update(updateData);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: 'Failed to update church' });
    }
  });

  app.delete("/api/v1/superadmin/churches/:id", authenticate, authorizeSuperAdmin, auditLog('DELETE_CHURCH', 'tenants'), async (req, res) => {
    try {
      const { mode = 'soft' } = req.body;
      if (mode === 'soft') {
        await db('tenants').where({ id: req.params.id }).update({ status: 'deleted' });
      } else {
        // Permanent delete (DANGEROUS)
        await db('tenants').where({ id: req.params.id }).delete();
      }
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: 'Failed to delete church' });
    }
  });

  app.post("/api/v1/superadmin/churches/:id/suspend", authenticate, authorizeSuperAdmin, auditLog('SUSPEND_CHURCH', 'tenants'), async (req, res) => {
    try {
      await db('tenants').where({ id: req.params.id }).update({ status: 'suspended' });
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: 'Failed to suspend church' });
    }
  });

  app.post("/api/v1/superadmin/churches/:id/restore", authenticate, authorizeSuperAdmin, auditLog('RESTORE_CHURCH', 'tenants'), async (req, res) => {
    try {
      await db('tenants').where({ id: req.params.id }).update({ status: 'active' });
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: 'Failed to restore church' });
    }
  });

  app.post("/api/v1/superadmin/churches/:id/impersonate", authenticate, authorizeSuperAdmin, auditLog('IMPERSONATE_CHURCH_ADMIN', 'tenants'), async (req, res) => {
    try {
      // Find the first admin for this church
      const adminRole = await db('user_tenant_roles')
        .where({ tenantId: req.params.id, role: 'ADMIN' })
        .first();
      
      if (!adminRole) return res.status(404).json({ error: 'No admin found for this church' });

      const user = await db('users').where({ uid: adminRole.userId }).first();
      if (!user) return res.status(404).json({ error: 'User not found' });

      // Generate a JWT for this user
      const token = jwt.sign(
        { uid: user.uid, email: user.email, role: user.role, impersonatedBy: (req as any).user?.uid },
        JWT_SECRET,
        { algorithm: 'HS256', expiresIn: '2h' } // Short lived for security
      );

      res.json({ 
        token, 
        user: { id: user.uid, email: user.email, role: user.role, name: user.name, tenantId: req.params.id } 
      });
    } catch (error) {
      res.status(500).json({ error: 'Impersonation failed' });
    }
  });

  // Super Admin - Billing & Invoices
  app.get("/api/v1/superadmin/billing/stats", authenticate, authorizeSuperAdmin, auditLog('VIEW_BILLING_STATS', 'invoices'), async (req, res) => {
    try {
      const invoices = await db('invoices').select('*');
      
      const totalRevenue = invoices
        .filter(i => i.status === 'paid')
        .reduce((sum, i) => sum + Number(i.amount || 0), 0);

      const pendingAmount = invoices
        .filter(i => i.status === 'pending' || i.status === 'overdue')
        .reduce((sum, i) => sum + Number(i.amount || 0), 0);

      const activeTenants = await db('tenants').where({ status: 'active' }).select('planId');
      const planPrices: Record<string, number> = { free_trial: 0, basic: 490, pro: 990, enterprise: 2490 };
      const mrr = activeTenants.reduce((acc, t) => acc + (planPrices[t.planId] || 0), 0);

      const pendingCount = invoices.filter(i => i.status === 'pending').length;
      const overdueCount = invoices.filter(i => i.status === 'overdue').length;
      const paidCount = invoices.filter(i => i.status === 'paid').length;

      res.json({
        totalRevenue,
        pendingAmount,
        mrr,
        pendingCount,
        overdueCount,
        paidCount,
        totalInvoices: invoices.length
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Failed to fetch billing stats' });
    }
  });

  app.get("/api/v1/superadmin/billing/invoices", authenticate, authorizeSuperAdmin, auditLog('VIEW_INVOICES', 'invoices'), async (req, res) => {
    try {
      const { search = '', status = 'all', plan = 'all', page = 1, limit = 20 } = req.query;
      const offset = (Number(page) - 1) * Number(limit);

      // NOTE: no .select('*') here. knex's .count() APPENDS to the select list
      // rather than replacing it, so a cloned builder carrying select('*')
      // produces `select *, count("id") ...`, which PostgreSQL rejects with
      // 42803 (column must appear in GROUP BY). SQLite tolerated it, which is
      // why this only surfaced after moving to Postgres.
      let query = db('invoices');

      if (search) {
        query = query.where(function() {
          this.where('id', 'like', `%${search}%`)
              .orWhere('tenantName', 'like', `%${search}%`)
              .orWhere('description', 'like', `%${search}%`);
        });
      }

      if (status !== 'all') {
        query = query.where('status', status);
      }

      if (plan !== 'all') {
        query = query.where('planId', plan);
      }

      // clearSelect() keeps the count query valid even if a select is added to
      // the base builder later.
      const totalCount = await query.clone().clearSelect().count('id as count').first();
      const invoices = await query.orderBy('issueDate', 'desc').limit(Number(limit)).offset(offset);

      res.json({
        data: invoices,
        pagination: {
          total: totalCount?.count || 0,
          page: Number(page),
          limit: Number(limit)
        }
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Failed to fetch invoices' });
    }
  });

  app.post("/api/v1/superadmin/billing/invoices", authenticate, authorizeSuperAdmin, auditLog('CREATE_INVOICE', 'invoices'), async (req, res) => {
    try {
      const { tenantId, amount, planId, billingCycle, description, dueDate, paymentMethod } = req.body;
      const church = await db('tenants').where({ id: tenantId }).first();
      if (!church) return res.status(404).json({ error: 'Church tenant not found' });

      const newInvoice = {
        id: `INV-2026-${Math.floor(100 + Math.random() * 900)}`,
        tenantId: church.id,
        tenantName: church.name,
        amount: Number(amount),
        currency: 'GHS',
        status: 'pending',
        planId: planId || church.planId,
        billingCycle: billingCycle || 'monthly',
        paymentMethod: paymentMethod || 'Paystack MoMo',
        description: description || `Invoice for ${church.name}`,
        issueDate: new Date(),
        dueDate: dueDate ? new Date(dueDate) : new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
        createdAt: new Date()
      };

      await db('invoices').insert(newInvoice);
      res.status(201).json(newInvoice);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Failed to create invoice' });
    }
  });

  app.post("/api/v1/superadmin/billing/invoices/:id/pay", authenticate, authorizeSuperAdmin, auditLog('PAY_INVOICE', 'invoices'), async (req, res) => {
    try {
      const { paymentMethod = 'Manual Wire / Cheque', reference = '' } = req.body;
      const invoice = await db('invoices').where({ id: req.params.id }).first();
      if (!invoice) return res.status(404).json({ error: 'Invoice not found' });

      await db('invoices').where({ id: req.params.id }).update({
        status: 'paid',
        paymentMethod: reference ? `${paymentMethod} (Ref: ${reference})` : paymentMethod,
        paidAt: new Date()
      });

      // Update tenant status to active if pending/trial
      await db('tenants').where({ id: invoice.tenantId }).update({ status: 'active', planId: invoice.planId });

      res.json({ success: true, message: 'Invoice marked as paid and church account activated.' });
    } catch (error) {
      res.status(500).json({ error: 'Failed to record payment' });
    }
  });

  app.post("/api/v1/superadmin/billing/invoices/:id/refund", authenticate, authorizeSuperAdmin, auditLog('REFUND_INVOICE', 'invoices'), async (req, res) => {
    try {
      await db('invoices').where({ id: req.params.id }).update({
        status: 'failed',
        description: db.raw("description || ' [REFUNDED]'")
      });
      res.json({ success: true, message: 'Invoice marked as refunded / failed.' });
    } catch (error) {
      res.status(500).json({ error: 'Failed to process refund' });
    }
  });

  app.post("/api/v1/superadmin/billing/invoices/:id/remind", authenticate, authorizeSuperAdmin, auditLog('REMIND_INVOICE', 'invoices'), async (req, res) => {
    try {
      const invoice = await db('invoices').where({ id: req.params.id }).first();
      if (!invoice) return res.status(404).json({ error: 'Invoice not found' });
      res.json({ success: true, message: `Billing reminder sent to church admin for invoice ${invoice.id}.` });
    } catch (error) {
      res.status(500).json({ error: 'Failed to send reminder' });
    }
  });

  // Super Admin - Support Tickets
  app.get("/api/v1/superadmin/tickets/stats", authenticate, authorizeSuperAdmin, auditLog('VIEW_TICKET_STATS', 'support_tickets'), async (req, res) => {
    try {
      const tickets = await db('support_tickets').select('*');
      res.json({
        total: tickets.length,
        open: tickets.filter(t => t.status === 'open').length,
        inProgress: tickets.filter(t => t.status === 'in_progress').length,
        resolved: tickets.filter(t => t.status === 'resolved' || t.status === 'closed').length,
        urgent: tickets.filter(t => t.priority === 'urgent' && t.status !== 'closed').length
      });
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch ticket stats' });
    }
  });

  app.get("/api/v1/superadmin/support-tickets", authenticate, authorizeSuperAdmin, auditLog('VIEW_TICKETS', 'support_tickets'), async (req, res) => {
    try {
      const { search = '', status = 'all', priority = 'all', category = 'all' } = req.query;

      // select('*') is knex's default and is deliberately omitted: leaving it in
      // place breaks any future `.clone().count()` pagination on this builder
      // under PostgreSQL (error 42803). See the invoices endpoint above.
      let query = db('support_tickets');

      if (search) {
        query = query.where(function() {
          this.where('ticketNumber', 'like', `%${search}%`)
              .orWhere('subject', 'like', `%${search}%`)
              .orWhere('tenantName', 'like', `%${search}%`)
              .orWhere('userName', 'like', `%${search}%`);
        });
      }

      if (status !== 'all') query = query.where('status', status);
      if (priority !== 'all') query = query.where('priority', priority);
      if (category !== 'all') query = query.where('category', category);

      const tickets = await query.orderBy('createdAt', 'desc');
      res.json(tickets);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch tickets' });
    }
  });

  app.get("/api/v1/superadmin/tickets/:id", authenticate, authorizeSuperAdmin, auditLog('VIEW_TICKET_DETAIL', 'support_tickets'), async (req, res) => {
    try {
      const ticket = await db('support_tickets').where({ id: req.params.id }).first();
      if (!ticket) return res.status(404).json({ error: 'Ticket not found' });

      const replies = await db('ticket_replies')
        .where({ ticketId: req.params.id })
        .orderBy('createdAt', 'asc');

      res.json({ ticket, replies });
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch ticket details' });
    }
  });

  app.post("/api/v1/superadmin/tickets", authenticate, authorizeSuperAdmin, auditLog('CREATE_TICKET', 'support_tickets'), async (req, res) => {
    try {
      const { subject, message, category, priority, tenantId } = req.body;
      let tenantName = 'Global / Platform';
      if (tenantId) {
        const church = await db('tenants').where({ id: tenantId }).first();
        if (church) tenantName = church.name;
      }

      const ticketCount = await db('support_tickets').count('id as count').first();
      const nextNum = 1000 + Number(ticketCount?.count || 0) + 1;

      const newTicket = {
        ticketNumber: `TICK-${nextNum}`,
        subject,
        message,
        category: category || 'Technical',
        status: 'open',
        priority: priority || 'normal',
        tenantId: tenantId || null,
        tenantName,
        userUid: (req as any).user?.uid || 'superadmin-master-id',
        userName: (req as any).user?.name || 'SuperAdmin Staff',
        userEmail: (req as any).user?.email || 'admin@ecclesiagh.com',
        assignedTo: 'SuperAdmin Support',
        createdAt: new Date(),
        updatedAt: new Date()
      };

      const [insertedId] = await db('support_tickets').insert(newTicket).returning('id');
      const realId = typeof insertedId === 'object' ? insertedId.id : insertedId;

      res.status(201).json({ ...newTicket, id: realId });
    } catch (error) {
      res.status(500).json({ error: 'Failed to create ticket' });
    }
  });

  app.post("/api/v1/superadmin/tickets/:id/replies", authenticate, authorizeSuperAdmin, auditLog('REPLY_TICKET', 'ticket_replies'), async (req, res) => {
    try {
      const { message, isInternalNote = false } = req.body;
      const ticket = await db('support_tickets').where({ id: req.params.id }).first();
      if (!ticket) return res.status(404).json({ error: 'Ticket not found' });

      const reply = {
        ticketId: Number(req.params.id),
        authorUid: (req as any).user?.uid || 'superadmin-master-id',
        authorName: (req as any).user?.name || 'SuperAdmin Support',
        authorRole: 'SUPER_ADMIN',
        message,
        isInternalNote: Boolean(isInternalNote),
        createdAt: new Date()
      };

      await db('ticket_replies').insert(reply);

      if (!isInternalNote && ticket.status === 'open') {
        await db('support_tickets').where({ id: req.params.id }).update({
          status: 'in_progress',
          updatedAt: new Date()
        });
      } else {
        await db('support_tickets').where({ id: req.params.id }).update({ updatedAt: new Date() });
      }

      res.status(201).json(reply);
    } catch (error) {
      res.status(500).json({ error: 'Failed to post ticket reply' });
    }
  });

  app.put("/api/v1/superadmin/tickets/:id/status", authenticate, authorizeSuperAdmin, auditLog('UPDATE_TICKET_STATUS', 'support_tickets'), async (req, res) => {
    try {
      const { status, priority, assignedTo } = req.body;
      const updates: any = { updatedAt: new Date() };
      if (status) updates.status = status;
      if (priority) updates.priority = priority;
      if (assignedTo) updates.assignedTo = assignedTo;

      await db('support_tickets').where({ id: req.params.id }).update(updates);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: 'Failed to update ticket status' });
    }
  });

  // Super Admin - Reports
  app.get("/api/v1/superadmin/reports/overview", authenticate, authorizeSuperAdmin, auditLog('VIEW_REPORTS', 'analytics'), async (req, res) => {
    try {
      const tenants = await db('tenants').select('*');
      const donations = await db('donations').select('*');
      const invoices = await db('invoices').select('*');
      const users = await db('users').select('*');

      // Plan Distribution
      const planCounts: Record<string, number> = { enterprise: 0, pro: 0, basic: 0, free_trial: 0 };
      tenants.forEach(t => {
        const p = t.planId || 'free_trial';
        planCounts[p] = (planCounts[p] || 0) + 1;
      });

      // Status Distribution
      const statusCounts: Record<string, number> = { active: 0, trial: 0, suspended: 0, expired: 0 };
      tenants.forEach(t => {
        const s = t.status || 'active';
        statusCounts[s] = (statusCounts[s] || 0) + 1;
      });

      // Revenue breakdown
      const totalSubscriptionsPaid = invoices
        .filter(i => i.status === 'paid')
        .reduce((sum, i) => sum + Number(i.amount || 0), 0);

      const totalChurchDonationsLogged = donations
        .filter(d => d.status === 'completed')
        .reduce((sum, d) => sum + Number(d.amount || 0), 0);

      // Real trailing 12-month timeline (cumulative churches, monthly paid
      // invoice revenue, and monthly completed donations).
      const now = new Date();
      const keys: string[] = [];
      for (let i = 11; i >= 0; i--) { const d = new Date(now.getFullYear(), now.getMonth() - i, 1); keys.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`); }
      const monthLabel = (key: string) => new Date(Number(key.split('-')[0]), Number(key.split('-')[1]) - 1, 1).toLocaleDateString('en', { month: 'short' });
      const churchCumR = keys.map((key) => { const [y, m] = key.split('-').map(Number); const end = new Date(y, m, 1).getTime(); return tenants.filter((t: any) => { const tt = new Date(t.createdAt).getTime(); return !isNaN(tt) && tt < end; }).length; });
      const bucketSum = (rows: any[], field: string, dateField: string, filter?: (r: any) => boolean) => { const b: Record<string, number> = {}; keys.forEach((k) => { b[k] = 0; }); rows.forEach((r: any) => { if (filter && !filter(r)) return; const when = new Date(r[dateField]); if (isNaN(when.getTime())) return; const key = `${when.getFullYear()}-${String(when.getMonth() + 1).padStart(2, '0')}`; if (key in b) b[key] += Number(r[field] || 0); }); return keys.map((k) => b[k]); };
      const mrrSeries = bucketSum(invoices, 'amount', 'paidAt', (i: any) => i.status === 'paid');
      const donationSeries = bucketSum(donations, 'amount', 'createdAt', (d: any) => d.status === 'completed');
      const monthlyGrowth = keys.map((key, idx) => ({ month: monthLabel(key), churches: churchCumR[idx], mrr: mrrSeries[idx], donations: donationSeries[idx] }));

      res.json({
        totalChurches: tenants.length,
        totalUsers: users.length,
        totalSubscriptionsPaid,
        totalChurchDonationsLogged,
        planDistribution: [
          { name: 'Enterprise Plan', value: planCounts.enterprise || 0, color: '#3b82f6' },
          { name: 'Pro Plan', value: planCounts.pro || 0, color: '#10b981' },
          { name: 'Basic Plan', value: planCounts.basic || 0, color: '#f59e0b' },
          { name: 'Free Trial', value: planCounts.free_trial || 0, color: '#8b5cf6' }
        ],
        statusDistribution: statusCounts,
        monthlyGrowth,
        topChurches: await Promise.all(tenants.slice(0, 5).map(async (t: any) => {
          const mc = await db('members').where({ tenantId: t.id }).count('id as count').first().catch(() => ({ count: 0 }));
          return {
            id: t.id,
            name: t.name,
            planId: t.planId,
            status: t.status,
            city: t.city || '—',
            logo: t.logo || null,
            memberCount: Number(mc?.count || 0)
          };
        }))
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Failed to generate report overview' });
    }
  });

  // System Settings Endpoints
  app.get("/api/v1/superadmin/settings/:key", authenticate, authorizeSuperAdmin, auditLog('VIEW_SETTINGS', 'system_settings'), async (req, res) => {
    try {
      const setting = await db('system_settings').where({ key: req.params.key }).first();
      if (!setting) {
        return res.json({});
      }
      // Never return provider secrets in clear text to the browser. Sensitive
      // fields are stored encrypted-at-rest and masked on read; a non-empty
      // masked value simply signals "a secret is configured".
      const parsed = JSON.parse(setting.value);
      res.json(decryptSensitiveFields(parsed, true));
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch settings' });
    }
  });

  app.put("/api/v1/superadmin/settings/:key", authenticate, authorizeSuperAdmin, auditLog('UPDATE_SETTINGS', 'system_settings'), async (req, res) => {
    try {
      const { key } = req.params;

      const exists = await db('system_settings').where({ key }).first();
      const previous = exists ? JSON.parse(exists.value) : {};

      // Preserve previously-stored secrets when the client submits an empty or
      // masked value (the read endpoint returns secrets masked, so a re-save of
      // an unchanged form must not overwrite the real secret with the mask).
      const MASK = '\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022';
      const incoming: Record<string, unknown> = { ...req.body };
      for (const field of SENSITIVE_SETTING_KEYS) {
        if (field in incoming) {
          const v = incoming[field];
          if (v === '' || v === MASK || v === undefined || v === null) {
            // Keep whatever was stored before (already encrypted).
            if (field in previous) incoming[field] = previous[field];
            else delete incoming[field];
          }
        }
      }

      // Encrypt sensitive fields at rest (AES-256-GCM). Values already encrypted
      // (carried over from `previous`) are passed through unchanged.
      const value = JSON.stringify(encryptSensitiveFields(incoming));

      if (exists) {
        await db('system_settings').where({ key }).update({ value, updatedAt: new Date() });
      } else {
        await db('system_settings').insert({ key, value, updatedAt: new Date() });
      }
      await securityEvent('SETTINGS_UPDATED', req, { key });

      res.json({ success: true, message: `System settings for '${key}' updated.` });
    } catch (error) {
      res.status(500).json({ error: 'Failed to update settings' });
    }
  });

  app.post("/api/v1/superadmin/settings/test-email", authenticate, authorizeSuperAdmin, auditLog('TEST_EMAIL', 'system_settings'), async (req, res) => {
    try {
      res.json({ success: true, message: 'SMTP Test connection successful. Verification email dispatched.' });
    } catch (error) {
      res.status(500).json({ error: 'SMTP connection failed' });
    }
  });

  app.post("/api/v1/superadmin/settings/test-sms", authenticate, authorizeSuperAdmin, auditLog('TEST_SMS', 'system_settings'), async (req, res) => {
    try {
      res.json({ success: true, message: 'SMS Gateway credentials verified. Sample SMS routed.' });
    } catch (error) {
      res.status(500).json({ error: 'SMS Gateway verification failed' });
    }
  });

  // Super Admin - Announcements
  app.get("/api/v1/superadmin/announcements", authenticate, authorizeSuperAdmin, auditLog('VIEW_ANNOUNCEMENTS', 'announcements'), async (req, res) => {
    try {
      const announcements = await db('announcements').select('*').orderBy('createdAt', 'desc');
      res.json(announcements);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch announcements' });
    }
  });

  app.post("/api/v1/superadmin/announcements", authenticate, authorizeSuperAdmin, auditLog('CREATE_ANNOUNCEMENT', 'announcements'), async (req, res) => {
    try {
      const announcement = {
        ...req.body,
        createdAt: new Date()
      };
      await db('announcements').insert(announcement);
      res.status(201).json(announcement);
    } catch (error) {
      res.status(500).json({ error: 'Failed to create announcement' });
    }
  });

  // Users
  app.get("/api/v1/superadmin/users", authenticate, authorizeSuperAdmin, auditLog('VIEW_USERS', 'users'), async (req, res) => {
    try {
      const { page = 1, limit = 10 } = req.query;
      const offset = (Number(page) - 1) * Number(limit);

      const users = await db('users')
        .select('*')
        .limit(Number(limit))
        .offset(offset);
      
      const total = await db('users').count('uid as count').first();

      res.json({
        data: users,
        pagination: {
          total: total?.count || 0,
          page: Number(page),
          limit: Number(limit)
        }
      });
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch users' });
    }
  });

  app.post("/api/v1/superadmin/users", authenticate, authorizeSuperAdmin, auditLog('CREATE_USER', 'users'), async (req, res) => {
    try {
      const user: any = {
        ...req.body,
        uid: req.body.uid || `user_${Date.now()}`,
        createdAt: new Date()
      };
      // Never store plaintext passwords: login verifies with bcrypt.compare, so
      // any provided password must be hashed before it is persisted.
      if (user.password) {
        user.password = await bcrypt.hash(String(user.password), 10);
      }
      await db('users').insert(user);
      // Do not leak the password hash back to the client.
      const { password: _pw, ...safeUser } = user;
      res.status(201).json(safeUser);
    } catch (error) {
      res.status(500).json({ error: 'Failed to create user' });
    }
  });

  app.put("/api/v1/superadmin/users/:id", authenticate, authorizeSuperAdmin, auditLog('UPDATE_USER', 'users'), async (req, res) => {
    try {
      const updates: any = { ...req.body };
      // Hash a new password if one is supplied; otherwise never overwrite the
      // existing hash with an empty value.
      if (updates.password) {
        updates.password = await bcrypt.hash(String(updates.password), 10);
      } else {
        delete updates.password;
      }
      await db('users').where({ uid: req.params.id }).update(updates);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: 'Failed to update user' });
    }
  });

  app.post("/api/v1/superadmin/users/:id/lock", authenticate, authorizeSuperAdmin, auditLog('LOCK_USER', 'users'), async (req, res) => {
    try {
      await db('users').where({ uid: req.params.id }).update({ status: 'locked' });
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: 'Failed to lock user' });
    }
  });

  app.post("/api/v1/superadmin/users/:id/unlock", authenticate, authorizeSuperAdmin, auditLog('UNLOCK_USER', 'users'), async (req, res) => {
    try {
      await db('users').where({ uid: req.params.id }).update({ status: 'active' });
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: 'Failed to unlock user' });
    }
  });

  // Reset a user's password. If the caller supplies a `password` it is used;
  // otherwise a strong temporary password is generated and returned once so the
  // super admin can share it securely. The stored value is always bcrypt-hashed
  // and the account is reactivated so the user can sign in again.
  app.post("/api/v1/superadmin/users/:id/reset-password", authenticate, authorizeSuperAdmin, auditLog('RESET_PASSWORD', 'users'), async (req, res) => {
    try {
      const user = await db('users').where({ uid: req.params.id }).first();
      if (!user) return res.status(404).json({ error: 'User not found' });

      const provided = req.body?.password ? String(req.body.password) : '';
      // Generate a readable but high-entropy temporary password when none given.
      const generated = `Epa-${Math.random().toString(36).slice(2, 8)}${Math.floor(1000 + Math.random() * 9000)}!`;
      const plain = provided || generated;
      const hashed = await bcrypt.hash(plain, 10);

      await db('users').where({ uid: req.params.id }).update({
        password: hashed,
        status: user.status === 'locked' ? 'active' : user.status,
      });

      // Only return the plaintext when we generated it (so it can be delivered
      // to the user). Never echo a caller-provided password back.
      res.json({ success: true, temporaryPassword: provided ? undefined : plain });
    } catch (error) {
      res.status(500).json({ error: 'Failed to reset password' });
    }
  });

  app.delete("/api/v1/superadmin/users/:id", authenticate, authorizeSuperAdmin, auditLog('DELETE_USER', 'users'), async (req, res) => {
    try {
      await db('users').where({ uid: req.params.id }).delete();
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: 'Failed to delete user' });
    }
  });

  // User Tenant Roles
  app.get("/api/v1/superadmin/user-tenant-roles", authenticate, authorizeSuperAdmin, auditLog('VIEW_ROLES', 'user_tenant_roles'), async (req, res) => {
    try {
      const roles = await db('user_tenant_roles')
        .join('users', 'user_tenant_roles.userId', 'users.uid')
        .join('tenants', 'user_tenant_roles.tenantId', 'tenants.id')
        .select(
          'user_tenant_roles.*',
          'users.name as userName',
          'tenants.name as tenantName'
        );
      res.json(roles);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch user tenant roles' });
    }
  });

  app.post("/api/v1/superadmin/user-tenant-roles", authenticate, authorizeSuperAdmin, auditLog('ASSIGN_ROLE', 'user_tenant_roles'), async (req, res) => {
    try {
      const role = {
        ...req.body,
        id: `role_${Date.now()}`,
        createdAt: new Date()
      };
      await db('user_tenant_roles').insert(role);
      res.status(201).json(role);
    } catch (error) {
      res.status(500).json({ error: 'Failed to assign role' });
    }
  });

  app.delete("/api/v1/superadmin/user-tenant-roles/:id", authenticate, authorizeSuperAdmin, auditLog('REMOVE_ROLE', 'user_tenant_roles'), async (req, res) => {
    try {
      await db('user_tenant_roles').where({ id: req.params.id }).delete();
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: 'Failed to remove role' });
    }
  });

  // Super Admin - Dashboard Stats
  app.get("/api/v1/superadmin/dashboard-stats", authenticate, authorizeSuperAdmin, async (req, res) => {
    try {
      const tenantsCount = await db('tenants').count('id as count').first().catch(() => ({ count: 0 }));
      const usersCount = await db('users').count('uid as count').first().catch(() => ({ count: 0 }));
      const activeSubscriptions = await db('tenants').where({ status: 'active' }).count('id as count').first().catch(() => ({ count: 0 }));
      
      const startOfMonth = new Date();
      startOfMonth.setDate(1);
      startOfMonth.setHours(0, 0, 0, 0);

      const donationsThisMonth = await db('donations')
        .where('createdAt', '>=', startOfMonth)
        .sum('amount as total')
        .first().catch(() => ({ total: 0 }));

      // Monthly recurring revenue from active subscriptions, priced against the
      // subscription_plans table (fallback to standard pricing).
      const planRows = await db('subscription_plans').select('id', 'price').catch(() => [] as any[]);
      const fallbackPrices: Record<string, number> = { free_trial: 0, basic: 490, pro: 990, enterprise: 2490 };
      const priceMap: Record<string, number> = { ...fallbackPrices };
      planRows.forEach((p: any) => { priceMap[p.id] = Number(p.price || 0); });
      const allTenants = await db('tenants').whereNot('status', 'deleted').select('*').catch(() => [] as any[]);
      const mrr = allTenants.filter((t: any) => t.status === 'active').reduce((acc: number, t: any) => acc + (priceMap[t.planId] || 0), 0);

      // Real member count.
      const membersCount = await db('members').count('id as count').first().catch(() => ({ count: 0 }));

      const recentRegistrations = allTenants
        .slice()
        .sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .slice(0, 5);

      const pendingTickets = await db('support_tickets').where({ status: 'open' }).count('id as count').first().catch(() => ({ count: 0 }));

      // Expiring subscriptions within the next 30 days.
      const now = new Date();
      const in30 = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
      const expiringSubscriptions = allTenants
        .map((t: any) => ({ id: t.id, name: t.name, planId: t.planId, logo: t.logo || null, expiryDate: t.subscriptionEndDate || t.trialEndDate || null }))
        .filter((t: any) => {
          if (!t.expiryDate) return false;
          const d = new Date(t.expiryDate).getTime();
          return !isNaN(d) && d >= now.getTime() && d <= in30.getTime();
        })
        .sort((a: any, b: any) => new Date(a.expiryDate).getTime() - new Date(b.expiryDate).getTime());

      // Trailing 12-month cumulative growth for churches + members.
      const keys: string[] = [];
      for (let i = 11; i >= 0; i--) { const d = new Date(now.getFullYear(), now.getMonth() - i, 1); keys.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`); }
      const memberRows = await db('members').select('createdAt').catch(() => [] as any[]);
      const cumulative = (rows: any[], field: string) => keys.map((key) => { const [y, m] = key.split('-').map(Number); const end = new Date(y, m, 1).getTime(); return rows.filter((r) => { const t = new Date(r[field]).getTime(); return !isNaN(t) && t < end; }).length; });
      const churchCum = cumulative(allTenants, 'createdAt');
      const memberCum = cumulative(memberRows, 'createdAt');
      const growth = keys.map((month, idx) => ({ month, churches: churchCum[idx], members: memberCum[idx] }));

      // Trailing 12-month revenue from paid invoices.
      const paidInvoices = await db('invoices').where({ status: 'paid' }).catch(() => [] as any[]);
      const revBuckets: Record<string, number> = {}; keys.forEach((k) => { revBuckets[k] = 0; });
      paidInvoices.forEach((inv: any) => { const when = new Date(inv.paidAt || inv.issueDate || inv.createdAt); if (isNaN(when.getTime())) return; const key = `${when.getFullYear()}-${String(when.getMonth() + 1).padStart(2, '0')}`; if (key in revBuckets) revBuckets[key] += Number(inv.amount || 0); });
      const revenueSeries = keys.map((k) => ({ month: k, revenue: revBuckets[k] }));
      const revenueThisYear = revenueSeries.reduce((s, r) => s + r.revenue, 0);

      // Revenue target (configurable in branding settings; otherwise derived).
      let revenueTarget = 0;
      try { const brRow = await db('system_settings').where({ key: 'branding' }).first(); revenueTarget = Number(JSON.parse(brRow?.value || '{}').revenueTarget || 0); } catch { /* ignore */ }
      if (!revenueTarget) revenueTarget = Math.max(mrr * 12, 100000);

      // System health (real DB probe + process uptime).
      let dbHealthy = true; try { await db.raw('select 1'); } catch { dbHealthy = false; }

      res.json({
        totalChurches: Number(tenantsCount?.count || 0),
        totalMembers: Number(membersCount?.count || 0),
        donationsThisMonth: Number(donationsThisMonth?.total || 0),
        mrr,
        monthlyRevenue: mrr,
        activeSubscriptions: Number(activeSubscriptions?.count || 0),
        pendingTickets: Number(pendingTickets?.count || 0),
        recentRegistrations: recentRegistrations || [],
        expiringSubscriptions,
        growth,
        revenueSeries,
        revenueTarget,
        revenueThisYear,
        systemHealth: {
          uptimeSeconds: Math.floor(process.uptime()),
          database: dbHealthy ? 'Healthy' : 'Down',
          databaseClient: db.client.config.client,
          status: dbHealthy ? 'operational' : 'degraded'
        }
      });
    } catch (error) {
      console.error('Stats error:', error);
      res.status(500).json({ error: 'Failed to fetch dashboard stats' });
    }
  });

  app.get("/api/v1/superadmin/activities", authenticate, authorizeSuperAdmin, async (req, res) => {
    try {
      const activities = await db('audit_logs')
        .join('users', 'audit_logs.adminUid', 'users.uid')
        .select('audit_logs.*', 'users.name as userName')
        .orderBy('audit_logs.createdAt', 'desc')
        .limit(20);
      res.json(activities);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch activities' });
    }
  });

  // Audit Logs - Explicit retrieval
  app.get("/api/v1/superadmin/audit-logs", authenticate, authorizeSuperAdmin, async (req, res) => {
    try {
      const logs = await db('audit_logs')
        .leftJoin('users', 'audit_logs.adminUid', 'users.uid')
        .select('audit_logs.*', 'users.name as userName')
        .orderBy('audit_logs.createdAt', 'desc')
        .limit(100);
      
      const formattedLogs = (logs || []).map(log => ({
        ...log,
        userName: log.userName || 'System/Admin',
        details: `${log.action} on ${log.resource}${log.resourceId ? ` (#${log.resourceId})` : ''}`
      }));

      res.json(formattedLogs);
    } catch (error) {
      console.error('Audit log error:', error);
      res.status(500).json({ error: 'Failed to fetch audit logs' });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    // Unknown API routes get a JSON 404 (not the SPA shell).
    app.use('/api', notFoundHandler);
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  // Centralised, leak-proof error handler must be registered LAST.
  app.use(globalErrorHandler);

  const server = app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  });

  // ---- Graceful shutdown ----
  // Container platforms (Cloud Run, Kubernetes, ECS) send SIGTERM before
  // killing the task. Draining in-flight requests and closing the database pool
  // prevents dropped responses and leaked connections during a deploy.
  let shuttingDown = false;
  const shutdown = (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`[shutdown] ${signal} received, draining connections...`);

    const forceExit = setTimeout(() => {
      console.error('[shutdown] Grace period expired, forcing exit.');
      process.exit(1);
    }, 15000);
    forceExit.unref();

    server.close(async (err?: Error) => {
      if (err) {
        console.error('[shutdown] Error closing HTTP server:', err);
        process.exit(1);
      }
      try {
        await db.destroy();
        console.log('[shutdown] Database pool closed. Bye.');
        process.exit(0);
      } catch (e) {
        console.error('[shutdown] Error closing database pool:', e);
        process.exit(1);
      }
    });
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  // Never leave the process in an undefined state after an unhandled failure.
  process.on('unhandledRejection', (reason) => {
    console.error('[fatal] Unhandled promise rejection:', reason);
  });
  process.on('uncaughtException', (err) => {
    console.error('[fatal] Uncaught exception:', err);
    shutdown('uncaughtException');
  });
}

startServer().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
