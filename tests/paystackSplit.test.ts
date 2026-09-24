import { test } from 'node:test';
import assert from 'node:assert/strict';
import { verifiedPaymentMatches } from '../src/services/paystack';
import { applyTransactionCharge } from '../src/lib/platformSettings';

test('payer-borne platform percentage is added on top', () => {
  const result = applyTransactionCharge(100, {
    percent: 5,
    flat: 0,
    cap: 0,
    bearer: 'payer',
    enabled: true,
  });
  assert.deepEqual(result, {
    baseAmount: 100,
    chargeAmount: 5,
    totalAmount: 105,
    netAmount: 100,
    chargeBearer: 'payer',
  });
});

test('recipient-borne platform percentage is deducted from the church share', () => {
  const result = applyTransactionCharge(100, {
    percent: 5,
    flat: 0,
    cap: 0,
    bearer: 'recipient',
    enabled: true,
  });
  assert.equal(result.totalAmount, 100);
  assert.equal(result.chargeAmount, 5);
  assert.equal(result.netAmount, 95);
});

test('Paystack verification accepts the exact reference, subunit amount, and currency', () => {
  assert.equal(verifiedPaymentMatches(
    { status: 'success', reference: 'gift_123', amount: 10500, currency: 'GHS' },
    { reference: 'gift_123', amount: 105, currency: 'GHS' },
  ), true);
});

test('Paystack verification rejects a successful but underpaid transaction', () => {
  assert.equal(verifiedPaymentMatches(
    { status: 'success', reference: 'gift_123', amount: 10000, currency: 'GHS' },
    { reference: 'gift_123', amount: 105, currency: 'GHS' },
  ), false);
});
