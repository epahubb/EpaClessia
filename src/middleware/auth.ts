import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { sessionIsCurrent } from '../lib/sessionSecurity';
import db from '../lib/db';
import { JWT_SECRET } from '../lib/config';
import { churchBlocksAccess, CHURCH_UNAVAILABLE_MESSAGE } from '../lib/accountAccess';

export interface AuthRequest extends Request {
  user?: any;
}

export const authenticate = async (req: AuthRequest, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] }) as any;
    // Persisted state revokes existing access tokens after a church is deleted
    // or a member is suspended. A signed JWT alone is not current permission.
    const account = await db('users').where({ uid: decoded.uid }).first();
    if (decoded.type === 'refresh') return res.status(401).json({ error: 'Invalid access token' });
    if (account && !sessionIsCurrent(decoded, account)) return res.status(401).json({ error: 'Session revoked. Please sign in again.', code: 'SESSION_REVOKED' });
    if (!account) return res.status(401).json({ error: 'Account no longer exists' });
    if (account.status && account.status !== 'active') {
      return res.status(403).json({ error: 'Account is not active. Please contact your administrator.' });
    }
    if (account.role !== 'SUPER_ADMIN' && account.tenantId) {
      const tenant = await db('tenants').where({ id: account.tenantId }).select('status').first();
      if (churchBlocksAccess(tenant)) return res.status(403).json({ error: CHURCH_UNAVAILABLE_MESSAGE });
    }
    req.user = { ...decoded, role: account.role, tenantId: account.tenantId };
    next();
  } catch (err) {
    if (!(err instanceof jwt.JsonWebTokenError)) {
      console.error('Authentication state check failed:', err);
      return res.status(503).json({ error: 'Unable to verify account access. Please try again.' });
    }
    const isExpired = err instanceof jwt.TokenExpiredError;
    if (err instanceof Error) {
      console.warn('JWT verify failed:', err.name, err.message);
    } else {
      console.warn('JWT verify failed:', err);
    }
    // Respond 401 (not 403) so the client's silent-refresh / re-login flow
    // triggers. A 403 is treated as a permission error and would leave an
    // expired session stuck instead of transparently refreshing.
    return res.status(401).json({
      error: isExpired ? 'Token expired' : 'Invalid token',
      code: isExpired ? 'TOKEN_EXPIRED' : 'TOKEN_INVALID',
    });
  }
};

export const authorizeSuperAdmin = async (req: AuthRequest, res: Response, next: NextFunction) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  try {
    const user = await db('users').where({ uid: req.user.uid }).first();

    // Authorize strictly on the persisted role, never on an unverified JWT claim.
    // A forged/edited token cannot escalate to super admin, and we no longer
    // silently auto-provision super-admin accounts from a token (that was a
    // privilege-escalation risk).
    if (user && user.role === 'SUPER_ADMIN' && (!user.status || user.status === 'active')) {
      return next();
    }

    return res.status(403).json({ error: 'Access denied. Superadmin only.' });
  } catch (error) {
    console.error('AuthorizeSuperAdmin Error:', error);
    res.status(500).json({ error: 'Authorization error' });
  }
};
