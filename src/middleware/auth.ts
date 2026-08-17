import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import db from '../lib/db';
import { JWT_SECRET } from '../lib/config';

export interface AuthRequest extends Request {
  user?: any;
}

export const authenticate = (req: AuthRequest, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] }) as any;
    req.user = decoded;
    next();
  } catch (err) {
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
