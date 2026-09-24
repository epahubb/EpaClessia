import { test } from 'node:test';
import assert from 'node:assert/strict';
import { verifiedPaymentMatches } from '../src/services/paystack';
import { applyTransactionCharge } from '../src/lib/platformSettings';

test('adds a 1% member-paid service charge on top of the donated amount', () => {
  const result = applyTransactionCharge(5, {
    percent: 1,
    flat: 0,
    cap: 0,
    bearer: 'payer',
    enabled: true,
  });
  assert.equal(result.baseAmount, 5);
  assert.equal(result.chargeAmount, 0.05);
  assert.equal(result.totalAmount, 5.05);
  assert.equal(result.netAmount, 5);
});

test('respects a cap on the member-paid service charge', () => {
  const result = applyTransactionCharge(1000, {
    percent: 10,
    flat: 0,
    cap: 25,
    bearer: 'payer',
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
