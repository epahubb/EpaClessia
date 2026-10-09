import test from 'node:test';
import assert from 'node:assert/strict';
import axios from 'axios';
import { sendSMS } from '../src/services/mnotify';
import { sendEmail } from '../src/services/email';

test('missing SMS configuration never logs recipient or credential-bearing message', async t => {
 const lines: string[] = []; t.mock.method(console, 'warn', (...args: any[]) => lines.push(JSON.stringify(args)));
 const secret = 'SyntheticInvitationPasswordOnly!';
 await sendSMS('0000000000', `Login test; Password ${secret}`);
 assert.equal(lines.join('').includes(secret), false); assert.equal(lines.join('').includes('0000000000'), false);
});
test('provider errors never log Axios payloads, API keys or invitation passwords', async t => {
 const lines: string[] = []; for (const method of ['warn','error','log'] as const) t.mock.method(console, method, (...args: any[]) => lines.push(JSON.stringify(args)));
 const secret = 'SyntheticInvitationPasswordOnly!', apiKey = 'synthetic-provider-key';
 t.mock.method(axios, 'post', async () => { throw Object.assign(new Error(secret), { code: 'ECONNABORTED', config: { url: '?key='+apiKey, data: { message: secret } }, response: { status: 503, data: { message: secret } } }); });
 const sms = await sendSMS('0000000000', secret, { apiKey });
 const email = await sendEmail({ to: 'fixture@example.test', subject: 'Fixture invitation', html: secret, config: { apiUrl: 'https://provider.example.test', apiKey } });
 assert.equal(sms.success, false); assert.equal(email.success, false);
 for(const value of [secret,apiKey,'0000000000']) assert.equal(lines.join('').includes(value), false);
 assert.equal(JSON.stringify(sms).includes(secret), false); assert.equal(JSON.stringify(email).includes(secret), false);
});
