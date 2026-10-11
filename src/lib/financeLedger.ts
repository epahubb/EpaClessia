export const financeMoney = (value: any, currency = 'GHS') => { try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency, maximumFractionDigits: 2 }).format(Number(value) || 0);
}
catch {
    return `${currency} ${Number(value || 0).toFixed(2)}`;
} };
export type LedgerEntry = {
    id: string;
    kind: string;
    name: string;
    description: string;
    amount: number;
    currency: string;
    status: string;
    method: string;
    date: string;
    reference: string;
    direction: 'in' | 'out';
};
export function financeLedger(data: any): LedgerEntry[] {
    return [...(data?.giving || []).map((r: any) => ({ id: `giving:${r.id}`, kind: 'Giving', name: r.donorName || 'Anonymous', description: r.purpose || 'General', amount: Number(r.amount), currency: r.currency || 'GHS', status: r.status, method: r.paymentMethod || '—', date: r.receivedAt || r.createdAt, reference: r.reference || '—', direction: 'in' as const })),
        ...(data?.dues || []).map((r: any) => ({ id: `dues:${r.id}`, kind: 'Dues', name: r.memberName, description: [r.duesName, r.collectionPeriod].filter(Boolean).join(' · '), amount: Number(r.amount), currency: r.currency || 'GHS', status: r.status, method: r.paymentMethod || '—', date: r.paidAt || r.createdAt, reference: r.reference || '—', direction: 'in' as const })),
        ...(data?.expenses || []).map((r: any) => ({ id: `expense:${r.id}`, kind: 'Expense', name: r.vendor || 'Unspecified payee', description: r.description || r.category || 'Expense', amount: Number(r.amount), currency: r.currency || 'GHS', status: r.status, method: r.paymentMethod || '—', date: r.date || r.createdAt, reference: String(r.id), direction: 'out' as const }))].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}
export function ledgerCsv(rows: LedgerEntry[]) {
    const escape = (v: any) => { let s = String(v ?? ''); if (/^[\s]*[=+@-]/.test(s) || /^[\t\r\n]/.test(s))
        s = `'${s}`; return `"${s.replaceAll('"', '""')}"`; };
    return '\uFEFF' + [['Date (UTC)', 'Type', 'Name', 'Description', 'Currency', 'Amount', 'Direction', 'Status', 'Method', 'Reference'], ...rows.map(r => [r.date, r.kind, r.name, r.description, r.currency, r.amount, r.direction, r.status, r.method, r.reference])].map(r => r.map(escape).join(',')).join('\r\n');
}
