import { attendanceDateRange } from './memberAttendance';
export const moneyCents = (n: unknown) => { const v = Number(n); if (!Number.isFinite(v) || v < 0 || v > 999999999999) throw new Error('Enter a valid, non-negative amount.'); return Math.round(v * 100); };
export function financeRange(from: unknown, to: unknown) {
  const range = attendanceDateRange(from, to);
  if (range.endExclusive.getTime() - range.start.getTime() > 366 * 86400000) throw new Error('Choose a date range of at most 366 days.');
  return range;
}
export function financeTotals(giving: any[], expenses: any[], from: string, to: string, horizon = 3) {
  const days = (financeRange(from, to).endExclusive.getTime() - financeRange(from, to).start.getTime()) / 86400000;
  const currencies = new Map<string, { currency: string; income: number; tithes: number; expenses: number }>();
  const bucket = (currency: string) => { const key = String(currency || 'GHS').toUpperCase(); if (!currencies.has(key)) currencies.set(key, { currency: key, income: 0, tithes: 0, expenses: 0 }); return currencies.get(key)!; };
  for (const g of giving) if (g.status === 'completed') {
    const b = bucket(g.currency); const cents = moneyCents(g.amount); b.income += cents;
    if (/^tithes?$/i.test(String(g.purpose || '').trim())) b.tithes += cents;
  }
  // Only paid expenses reduce cash. Pending/approved entries remain commitments.
  for (const e of expenses) if (String(e.status || '').toLowerCase() === 'paid') bucket(e.currency).expenses += moneyCents(e.amount);
  return [...currencies.values()].map(b => ({ currency: b.currency, income: b.income / 100, tithes: b.tithes / 100, expenses: b.expenses / 100, net: (b.income - b.expenses) / 100,
    projectedIncome: Math.round(b.income / days * 30.4375 * horizon) / 100, projectedExpenses: Math.round(b.expenses / days * 30.4375 * horizon) / 100,
    projectedNet: Math.round((b.income - b.expenses) / days * 30.4375 * horizon) / 100 }));
}
