import axios from 'axios';
import { getPlatformSettings } from '../lib/platformSettings';

/**
 * Outbound email.
 *
 * The platform's email credentials are owned by the super admin (see the
 * 'email' section of the super-admin settings) and shared by every church, so
 * a church never has to supply SMTP details of its own.
 *
 * Two transports are supported:
 *  - `apiUrl` + `apiKey`  : an HTTP email API (SendGrid, Resend, Mailgun,
 *                           Brevo, or any endpoint that accepts a JSON body).
 *                           This is the transport used in production because
 *                           it needs no extra native dependency.
 *  - none configured      : the message is not dropped silently -- it is
 *                           reported back as `skipped` so callers can record
 *                           the attempt and surface it to an admin.
 */

export type EmailConfig = {
  provider?: string;
  apiUrl?: string;
  apiKey?: string;
  host?: string;
  port?: string | number;
  username?: string;
  password?: string;
  fromName?: string;
  fromEmail?: string;
  secure?: boolean;
};

export type SendEmailResult = {
  success: boolean;
  skipped?: boolean;
  error?: string;
  provider?: string;
};

/** Reads the platform email configuration, decrypted and ready to use. */
export async function getEmailConfig(): Promise<EmailConfig> {
  const cfg = (await getPlatformSettings('email')) as EmailConfig;
  return {
    ...cfg,
    apiUrl: cfg.apiUrl || process.env.EMAIL_API_URL,
    apiKey: cfg.apiKey || process.env.EMAIL_API_KEY,
    fromEmail: cfg.fromEmail || process.env.EMAIL_FROM || 'no-reply@ecclesia.app',
    fromName: cfg.fromName || process.env.EMAIL_FROM_NAME || 'Ecclesia',
  };
}

export function isEmailConfigured(cfg: EmailConfig): boolean {
  return Boolean(cfg.apiUrl && cfg.apiKey);
}

/**
 * Sends one email.
 *
 * Never throws: email is always a side channel (receipts, follow-ups) and must
 * not fail the request that triggered it. Failures come back on the result so
 * the caller can log them to `communications_log`.
 */
export async function sendEmail(args: {
  to: string;
  subject: string;
  html: string;
  text?: string;
  config?: EmailConfig;
}): Promise<SendEmailResult> {
  const { to, subject, html } = args;
  if (!to || !/.+@.+\..+/.test(to)) {
    return { success: false, error: 'A valid recipient email address is required.' };
  }

  const cfg = args.config || (await getEmailConfig());
  const text = args.text || html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

  if (!isEmailConfigured(cfg)) {
    console.warn('[email] No email API configured; message not sent:', { to, subject });
    return {
      success: false,
      skipped: true,
      error:
        'Email is not configured. Ask the platform administrator to set the email API URL and key in super-admin settings.',
      provider: cfg.provider,
    };
  }

  try {
    await axios.post(
      cfg.apiUrl as string,
      {
        // A deliberately generic envelope: the common HTTP email providers all
        // accept some subset of these fields, and unknown extras are ignored.
        from: cfg.fromEmail,
        fromName: cfg.fromName,
        sender: { email: cfg.fromEmail, name: cfg.fromName },
        to: [{ email: to }],
        recipient: to,
        subject,
        html,
        text,
      },
      {
        headers: {
          Authorization: `Bearer ${cfg.apiKey}`,
          'api-key': cfg.apiKey as string,
          'Content-Type': 'application/json',
        },
        timeout: 15_000,
      },
    );
    return { success: true, provider: cfg.provider || 'http' };
  } catch (error: any) {
    const message =
      error?.response?.data?.message || error?.message || 'Unknown email transport error';
    console.error('[email] send failed:', message);
    return { success: false, error: String(message), provider: cfg.provider };
  }
}

/**
 * Wraps body content in a simple, mail-client-safe HTML shell so follow-up
 * emails look intentional rather than like plain debug output.
 */
export function emailTemplate(args: {
  title: string;
  body: string;
  ctaLabel?: string;
  ctaUrl?: string;
  footer?: string;
}): string {
  const { title, body, ctaLabel, ctaUrl, footer } = args;
  const cta =
    ctaLabel && ctaUrl
      ? `<p style="margin:28px 0;"><a href="${ctaUrl}" style="background:#4f46e5;color:#ffffff;padding:12px 22px;border-radius:8px;text-decoration:none;font-weight:600;display:inline-block;">${ctaLabel}</a></p>
         <p style="font-size:12px;color:#6b7280;">If the button does not work, copy this link into your browser:<br /><a href="${ctaUrl}">${ctaUrl}</a></p>`
      : '';
  return `<!doctype html><html><body style="margin:0;padding:24px;background:#f3f4f6;font-family:Segoe UI,Helvetica,Arial,sans-serif;color:#111827;">
  <div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:12px;padding:32px;">
    <h1 style="font-size:20px;margin:0 0 16px;">${title}</h1>
    <div style="font-size:15px;line-height:1.6;color:#374151;">${body}</div>
    ${cta}
    <hr style="border:none;border-top:1px solid #e5e7eb;margin:28px 0 16px;" />
    <p style="font-size:12px;color:#9ca3af;margin:0;">${footer || 'Sent by your church via Ecclesia.'}</p>
  </div>
</body></html>`;
}
