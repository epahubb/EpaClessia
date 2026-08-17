import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import db from './db';
import {
  JWT_SECRET,
  JWT_REFRESH_SECRET,
  ACCESS_TOKEN_EXPIRES_IN,
  REFRESH_TOKEN_EXPIRES_IN,
} from './config';

// JWT_SECRET is now resolved in one place (src/lib/config.ts) so signing and
// verification always use the same secret across the app.
const JWT_EXPIRES_IN = ACCESS_TOKEN_EXPIRES_IN;

export type UserRole =
  | 'SUPER_ADMIN'
  | 'CHURCH_ADMIN'
  | 'PASTOR'
  | 'MINISTRY_LEADER'
  | 'MEMBER';

export interface AuthUser {
  id: string;
  email: string;
  role: UserRole;
  tenantId?: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

// Password Hashing
export const hashPassword = async (password: string): Promise<string> => {
  const salt = await bcrypt.genSalt(12);
  return bcrypt.hash(password, salt);
};

export const comparePassword = async (password: string, hashed: string): Promise<boolean> => {
  return bcrypt.compare(password, hashed);
};

// JWT Tokens
export const generateToken = (user: AuthUser): string => {
  return jwt.sign(user, JWT_SECRET, {
    algorithm: 'HS256',
    expiresIn: JWT_EXPIRES_IN,
  });
};

export const verifyToken = (token: string): AuthUser | null => {
  try {
    return jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] }) as AuthUser;
  } catch (err) {
    return null;
  }
};

/**
 * Sign a short-lived access token from an arbitrary claims payload.
 * The login / refresh routes use { uid, email, role, tenantId }.
 */
export const signAccessToken = (payload: Record<string, unknown>): string => {
  return jwt.sign(payload, JWT_SECRET, {
    algorithm: 'HS256',
    expiresIn: ACCESS_TOKEN_EXPIRES_IN,
  });
};

/**
 * Sign a long-lived refresh token. Signed with a dedicated secret and tagged
 * type:'refresh' so it can never be accepted as an access token.
 */
export const signRefreshToken = (payload: Record<string, unknown>): string => {
  return jwt.sign({ ...payload, type: 'refresh' }, JWT_REFRESH_SECRET, {
    algorithm: 'HS256',
    expiresIn: REFRESH_TOKEN_EXPIRES_IN,
  });
};

/**
 * Verify a refresh token and return its decoded claims. Throws if the token is
 * missing / invalid / expired, or is not a refresh token.
 */
export const verifyRefreshToken = (token: string): any => {
  const decoded = jwt.verify(token, JWT_REFRESH_SECRET, {
    algorithms: ['HS256'],
  }) as any;
  if (!decoded || decoded.type !== 'refresh') {
    throw new Error('Not a refresh token');
  }
  return decoded;
};

// Middleware: Authentication
export const authenticate = (req: Request, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : req.cookies?.token;

  if (!token) {
    return res.status(401).json({ message: 'Authentication required' });
  }

  const user = verifyToken(token);
  if (!user) {
    return res.status(401).json({ message: 'Invalid or expired token' });
  }

  req.user = user;
  next();
};

// Middleware: Authorization (RBAC)
export const authorize = (roles: string[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ message: 'Insufficient permissions' });
    }

    next();
  };
};

/**
 * Middleware: Ownership / tenant-isolation check (IDOR prevention).
 *
 * This performs a REAL database lookup: the requested resource is loaded from
 * its table and its tenantId is compared against the caller's tenant. The
 * previous implementation trusted a client-supplied `req.body.tenantId`, which
 * an attacker could simply omit or forge; that trust has been removed.
 *
 * Usage:
 *   router.put('/members/:id', authenticate, checkOwnership('members'), handler)
 *
 * @param table            The table that owns the resource.
 * @param resourceIdParam  The route param holding the resource id (default 'id').
 * @param idColumn         The primary-key column in that table (default 'id').
 * @param tenantColumn     The tenant column in that table (default 'tenantId').
 */
export const checkOwnership = (
  table: string,
  resourceIdParam: string = 'id',
  idColumn: string = 'id',
  tenantColumn: string = 'tenantId',
) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) return res.status(401).json({ message: 'Authentication required' });

    // Super admins bypass tenant scoping intentionally.
    if (req.user.role === 'SUPER_ADMIN') return next();

    const callerTenant = req.user.tenantId;
    if (!callerTenant) {
      securityLog('OWNERSHIP_NO_TENANT', { userId: req.user.id }, req);
      return res.status(403).json({ message: 'Access denied: no tenant context' });
    }

    const resourceId = req.params[resourceIdParam];
    if (!resourceId) return res.status(400).json({ message: 'Missing resource identifier' });

    try {
      const row = await db(table).where({ [idColumn]: resourceId }).first();
      if (!row) return res.status(404).json({ message: 'Resource not found' });

      if (String(row[tenantColumn]) !== String(callerTenant)) {
        securityLog(
          'IDOR_ATTEMPT',
          { userId: req.user.id, table, resourceId, ownerTenant: row[tenantColumn], callerTenant },
          req,
        );
        return res.status(403).json({ message: 'Access denied: resource belongs to another tenant' });
      }

      return next();
    } catch (err) {
      securityLog('OWNERSHIP_CHECK_ERROR', { userId: req.user.id, table, error: String(err) }, req);
      // Fail closed on error.
      return res.status(500).json({ message: 'Authorization check failed' });
    }
  };
};

// Input Validation Schemas
export const loginSchema = z.object({
  email: z.string().email().toLowerCase().trim(),
  password: z.string().min(1).max(200),
  twoFactorCode: z.string().trim().optional(),
  totp: z.string().trim().optional(),
});

/**
 * Strong-password policy used when creating or resetting credentials:
 * at least 12 characters with upper, lower, number and symbol.
 */
export const strongPasswordSchema = z
  .string()
  .min(12, 'Password must be at least 12 characters')
  .max(200)
  .refine((v) => /[a-z]/.test(v), 'Password must include a lowercase letter')
  .refine((v) => /[A-Z]/.test(v), 'Password must include an uppercase letter')
  .refine((v) => /[0-9]/.test(v), 'Password must include a number')
  .refine((v) => /[^A-Za-z0-9]/.test(v), 'Password must include a symbol');

/**
 * Reusable request-body validator. Returns 400 with field errors on failure and
 * replaces req.body with the parsed/normalised value on success.
 */
export const validateBody =
  (schema: z.ZodTypeAny) => (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({
        error: 'Validation failed',
        details: result.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      });
    }
    req.body = result.data;
    next();
  };

export const tenantSchema = z.object({
  name: z.string().min(2).max(100).trim(),
  websiteUrl: z.string().url().optional().or(z.literal('')),
  adminEmail: z.string().email().toLowerCase().trim(),
  planId: z.enum(['basic', 'premium', 'enterprise']),
});

export const userSchema = z.object({
  name: z.string().min(2).max(100).trim(),
  email: z.string().email().toLowerCase().trim(),
  role: z.enum(['SUPER_ADMIN', 'CHURCH_ADMIN', 'PASTOR', 'MINISTRY_LEADER', 'MEMBER']),
  tenantId: z.string().optional(),
});

export const settingSchema = z.object({
  host: z.string().optional(),
  port: z.number().optional(),
  user: z.string().optional(),
  encryption: z.string().optional(),
  provider: z.string().optional(),
  clientId: z.string().optional(),
  clientSecret: z.string().optional(),
  fromName: z.string().optional(),
  gateway: z.string().optional(),
  publicKey: z.string().optional(),
  secretKey: z.string().optional(),
  mode: z.string().optional(),
  path: z.string().optional(),
});

// Security Logger
export const securityLog = (action: string, details: any, req?: Request) => {
  const log = {
    timestamp: new Date().toISOString(),
    action,
    details,
    ip: req?.ip,
    userAgent: req?.headers['user-agent'],
    userId: req?.user?.id,
  };
  console.log(`[SECURITY] ${JSON.stringify(log)}`);
};
