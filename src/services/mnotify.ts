import axios from 'axios';

const MNOTIFY_ENV_API_KEY = process.env.MNOTIFY_API_KEY;
const MNOTIFY_ENV_SENDER_ID = process.env.MNOTIFY_SENDER_ID || 'Ecclesia';

/**
 * Send SMS via mNotify API
 * @param recipient Phone number in international format or local
 * @param message Message text
 */
export async function sendSMS(
  recipient: string,
  message: string,
  opts?: { apiKey?: string; senderId?: string },
) {
  // Prefer a church-level credential when provided, else fall back to platform env.
  const MNOTIFY_API_KEY = opts?.apiKey || MNOTIFY_ENV_API_KEY;
  const MNOTIFY_SENDER_ID = opts?.senderId || MNOTIFY_ENV_SENDER_ID;
  if (!MNOTIFY_API_KEY) {
    console.warn('[sms] mNotify API key is missing; delivery skipped. Message content is not logged.');
    return { success: false, error: 'API Key missing' };
  }

  try {
    // The braces that used to wrap this template literal were part of the URL
    // string itself, so every request went to an invalid host and no SMS was
    // ever delivered.
    const url = `https://api.mnotify.com/syapi/bulk_sms?key=${MNOTIFY_API_KEY}`;
    const response = await axios.post(url, {
      recipient: [recipient],
      sender: MNOTIFY_SENDER_ID,
      message: message,
      is_schedule: false
    }, { timeout: 15_000 });

    console.log('[sms] mNotify request completed.', { status: response.status });
    return { success: true, data: response.data };
  } catch (error: any) {
    // Axios errors contain request credentials and message/password payloads. Never log the object.
    console.warn('[sms] mNotify delivery failed.', { status: error?.response?.status, code: error?.code });
    return { success: false, error: 'SMS delivery failed. Check provider configuration.' };
  }
}
