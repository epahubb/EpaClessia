export function invoiceStatusQuery(query: any, status: string, now = new Date()) {
    if (status === 'overdue')
        return query.whereIn('status', ['pending', 'overdue']).where('dueDate', '<', now);
    return status === 'all' ? query : query.where('status', status);
}
export function ticketStatusQuery(query: any, status: string) {
    return status === 'unresolved' ? query.whereIn('status', ['open', 'in_progress']) : status === 'all' ? query : query.where('status', status);
}
export function monthKeys(now: Date) { return Array.from({ length: 12 }, (_, i) => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 11 + i, 1)).toISOString().slice(0, 7)); }
export function summarizePlatformBilling(rows: any[], now = new Date()) {
    const keys = monthKeys(now), current = now.toISOString().slice(0, 7), currencies = new Map<string, Map<string, number>>();
    let excluded = 0, legacyDates = 0;
    for (const row of rows) {
        if (row.status !== 'paid')
            continue;
        const date = new Date(row.paidAt || row.issueDate || row.createdAt), amount = Number(row.amount), cents = Math.round(amount * 100);
        if (!Number.isFinite(date.getTime()) || !Number.isSafeInteger(cents) || amount < 0) {
            excluded++;
            continue;
        }
        if (date > now) {
            excluded++;
            continue;
        }
        const month = date.toISOString().slice(0, 7);
        if (!keys.includes(month))
            continue;
        if (!row.paidAt)
            legacyDates++;
        const currency = String(row.currency || 'GHS').toUpperCase();
        if (!currencies.has(currency))
            currencies.set(currency, new Map());
        const bucket = currencies.get(currency)!;
        const total = (bucket.get(month) || 0) + cents;
        if (!Number.isSafeInteger(total))
            throw new Error('Invoice total exceeds safe reporting range');
        bucket.set(month, total);
    }
    return { currencies: [...currencies.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([currency, buckets]) => ({ currency, monthPaid: (buckets.get(current) || 0) / 100, trailingPaid: [...buckets.values()].reduce((a, b) => { const total = a + b; if (!Number.isSafeInteger(total))
                throw new Error('Invoice total exceeds safe reporting range'); return total; }, 0) / 100, series: keys.map(month => ({ month, value: (buckets.get(month) || 0) / 100 })) })), excluded, legacyDates };
}
export function safeCsv(rows: unknown[][]) { const cell = (value: unknown) => { let s = String(value ?? ''); if (/^[\s]*[=+@-]/.test(s) || /^[\t\r\n]/.test(s))
    s = "'" + s; return '"' + s.replaceAll('"', '""') + '"'; }; return '\uFEFF' + rows.map(row => row.map(cell).join(',')).join('\r\n'); }
export function saveCsv(rows: unknown[][], filename: string) { const url = URL.createObjectURL(new Blob([safeCsv(rows)], { type: 'text/csv;charset=utf-8' })); const a = document.createElement('a'); a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
