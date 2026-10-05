import type { Response, NextFunction } from 'express';
import type { AuthRequest } from './auth';
const FINANCE_PATHS = /^\/(?:finance(?:\/|$)|giving(?:\/|$)|expenses(?:\/|$)|budgets(?:\/|$)|pledges(?:\/|$)|inventory(?:\/|$)|inventory-categories(?:\/|$)|finance-purposes(?:\/|$)|dues(?:\/|$)|billing(?:\/|$)|service-charges(?:\/|$))/;
export function churchAccess(req: AuthRequest, res: Response, next: NextFunction) {
  const role = (req as any).dbUser?.role || req.user?.role;
  if (['SUPER_ADMIN', 'CHURCH_ADMIN', 'PASTOR', 'MINISTRY_LEADER', 'SECRETARY'].includes(role)) return next();
  if (role === 'FINANCE' && FINANCE_PATHS.test(req.path)) return next();
  return res.status(403).json({ error: 'This account cannot access the church administration API. Use your assigned portal.' });
}
