import { Response, NextFunction } from 'express';
import { AuthRequest } from './auth';
import db from '../lib/db';

export const auditLog = (action: string, resource: string) => {
  return async (req: AuthRequest, res: Response, next: NextFunction) => {
    const originalSend = res.send;
    
    // We only log if the request is successful (status < 400)
    res.send = function (body) {
      if (res.statusCode < 400 && req.user) {
        // `req.body` is undefined on GET/DELETE requests, so it must be read
        // defensively or audit logging would throw inside res.send.
        const resourceId = req.params?.id || (req.body as any)?.id || null;
        
        db('audit_logs').insert({
          adminUid: req.user.uid,
          action,
          resource,
          resourceId: resourceId ? String(resourceId) : null,
          ipAddress: req.ip,
          userAgent: req.headers['user-agent'],
          createdAt: new Date()
        }).catch(err => console.error('Failed to log audit:', err));
      }
      return originalSend.apply(res, arguments as any);
    };

    next();
  };
};
