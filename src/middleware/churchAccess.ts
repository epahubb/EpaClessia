import type { Response, NextFunction } from 'express';
import type { AuthRequest } from './auth';
const FINANCE_PATHS = /^\/(?:finance(?:\/|$)|giving(?:\/|$)|expenses(?:\/|$)|budgets(?:\/|$)|pledges(?:\/|$)|inventory(?:\/|$)|inventory-categories(?:\/|$)|finance-purposes(?:\/|$)|dues-payments(?:\/|$)|dues(?:\/|$)|billing(?:\/|$)|service-charges(?:\/|$))/;
export function churchAccess(req: AuthRequest, res: Response, next: NextFunction) {
  const role = (req as any).dbUser?.role || req.user?.role;
  if (['SUPER_ADMIN', 'CHURCH_ADMIN', 'PASTOR', 'MINISTRY_LEADER', 'SECRETARY'].includes(role)) return next();
  // Group leaders have their own portal, but minutes are written through the
  // shared church endpoint so all minutes live in one table. They may reach
  // ONLY the minutes routes; every other church-administration path stays
  // closed to them.
  if (role === 'GROUP_LEADER' && /^\/minutes(?:\/|$)/.test(req.path)) return next();
  if (role === 'FINANCE' && FINANCE_PATHS.test(req.path)) return next();
  return res.status(403).json({ error: 'This account cannot access the church administration API. Use your assigned portal.' });
}
