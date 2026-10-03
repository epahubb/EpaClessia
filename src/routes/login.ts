import type { RequestHandler } from 'express';
import bcrypt from 'bcryptjs';
import db from '../lib/db';
import { loginSchema, signAccessToken, signRefreshToken } from '../lib/security';
import { getLockoutState, securityEvent } from '../middleware/security';
import { PORTAL_PENDING_MESSAGE } from '../lib/memberPortal';
import { churchBlocksAccess, CHURCH_UNAVAILABLE_MESSAGE } from '../lib/accountAccess';
import { verifyTotp } from '../lib/totp';

/** Shared by the production route and database-backed HTTP credential tests. */
export const loginHandler: RequestHandler = async (req, res) => {

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
          .insert({ userId: user.uid, userName: user.name, email, ipAddress: req.ip || '', success: false, createdAt: new Date() })
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

      if (user.role !== 'SUPER_ADMIN' && user.tenantId) {
        const tenant = await db('tenants').where({ id: user.tenantId }).select('status').first();
        if (churchBlocksAccess(tenant)) return res.status(403).json({ error: CHURCH_UNAVAILABLE_MESSAGE });
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
        .insert({ userId: user.uid, userName: user.name, email, ipAddress: req.ip || '', success: true, createdAt: new Date() })
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
  
};
