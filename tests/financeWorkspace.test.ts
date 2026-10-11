import test from 'node:test';
import assert from 'node:assert/strict';
import { financeLedger, financeMoney, ledgerCsv } from '../src/lib/financeLedger';
test('unified ledger preserves direction, source IDs, status, currency and dues period', () => {
    const rows = financeLedger({ giving: [{ id: 'same', amount: 10, currency: 'GHS', status: 'completed', purpose: 'Tithe', receivedAt: '2026-01-01T10:00:00Z' }], dues: [{ id: 'same', amount: 20, currency: 'USD', status: 'completed', memberName: 'Ama', duesName: 'Welfare', collectionPeriod: 'January', paidAt: '2026-01-02T10:00:00Z' }], expenses: [{ id: 'same', amount: 5, currency: 'GHS', status: 'approved', vendor: 'Hall', date: '2026-01-03T10:00:00Z' }] });
    assert.equal(rows.length, 3);
    assert.equal(new Set(rows.map(r => r.id)).size, 3);
    assert.equal(rows[0].direction, 'out');
    assert.equal(rows[0].status, 'approved');
    assert.equal(rows[1].currency, 'USD');
    assert.equal(rows[1].description, 'Welfare · January');
    assert.equal(rows[2].kind, 'Giving');
});
test('ledger CSV escapes quotes, commas and spreadsheet formulas', () => {
    const row = financeLedger({ dues: [{ id: '1', amount: 25, status: 'completed', memberName: '=HYPERLINK("bad")', duesName: 'Welfare, "annual"', paidAt: '2026-01-01' }] })[0];
    const csv = ledgerCsv([row]);
    assert.ok(csv.startsWith('\uFEFF'));
    assert.ok(csv.includes('"\'=HYPERLINK(""bad"")"'));
    assert.ok(csv.includes('"Welfare, ""annual"""'));
    assert.ok(!csv.includes('undefined'));
});
test('missing rows yield empty ledger; currency display does not crash on legacy invalid code', () => { assert.deepEqual(financeLedger(null), []); assert.ok(financeMoney(20, 'NOTACURRENCY').includes('20')); });
