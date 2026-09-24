import { test } from 'node:test';
import assert from 'node:assert/strict';
import { verifiedPaymentMatches } from '../src/services/paystack';
import { applyTransactionCharge } from '../src/lib/platformSettings';

test('calculates the service charge accrued against a church collection', () => {
  const result = applyTransactionCharge(100, {
    percent: 5,
    flat: 0,
    cap: 0,
    bearer: 'recipient',
    enabled: true,
  });
  assert.equal(result.baseAmount, 100);
  assert.equal(result.chargeAmount, 5);
  assert.equal(result.netAmount, 95);
});

test('respects a cap on the separately settled service charge', () => {
  const result = applyTransactionCharge(1000, {
    percent: 10,
    flat: 0,
    cap: 25,
    bearer: 'recipient',
    enabled: true,
  });
  assert.equal(result.chargeAmount, 25);
});

test('Paystack verification accepts the exact reference, subunit amount, and currency', () => {
  assert.equal(verifiedPaymentMatches(
    { status: 'success', reference: 'gift_123', amount: 10000, currency: 'GHS' },
    { reference: 'gift_123', amount: 100, currency: 'GHS' },
  ), true);
});

test('Paystack verification rejects a successful but underpaid transaction', () => {
  assert.equal(verifiedPaymentMatches(
    { status: 'success', reference: 'gift_123', amount: 9500, currency: 'GHS' },
    { reference: 'gift_123', amount: 100, currency: 'GHS' },
  ), false);
});
