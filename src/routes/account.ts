import type { Response } from 'express';
import type { AuthRequest } from '../middleware/auth';
import db from '../lib/db';
import { sessionUser } from '../lib/sessionUser';
export async function currentAccount(req: AuthRequest, res: Response) {
  try {
    const account = await db('users').where({ uid: req.user?.uid }).first();
    if (!account) return res.status(401).json({ error: 'Account no longer exists' });
    return res.json({ user: await sessionUser(account) });
  } catch { return res.status(503).json({ error: 'Unable to refresh account details. Please try again.' }); }
}
