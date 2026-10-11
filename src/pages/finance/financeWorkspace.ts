import { useEffect, useState } from 'react';
import { financeRange } from '../../lib/financeReports';
import api from '../../services/api';
export { financeMoney, financeLedger, ledgerCsv } from '../../lib/financeLedger';
export type { LedgerEntry } from '../../lib/financeLedger';
export const currentPeriod = () => { const params = new URLSearchParams(window.location.search); if (params.get('from') && params.get('to')) {
    try {
        const r = financeRange(params.get('from'), params.get('to'));
        return { from: r.from, to: r.to };
    }
    catch { /* fall back to the current month */ }
} const to = new Date().toISOString().slice(0, 10); return { from: `${to.slice(0, 7)}-01`, to }; };
export function useFinanceWorkspace() {
    const [range, setRange] = useState(currentPeriod), [draft, setDraft] = useState(currentPeriod), [revision, setRevision] = useState(0);
    const [data, setData] = useState<any>(null), [error, setError] = useState(''), [loading, setLoading] = useState(true);
    useEffect(() => { const c = new AbortController(); setLoading(true); setError(''); api.get('/church/finance/report', { params: { ...range, horizon: 3 }, signal: c.signal }).then(r => { if (!c.signal.aborted)
        setData(r.data); }).catch(e => { if (!c.signal.aborted)
        setError(e?.response?.data?.error || 'Financial records could not be loaded. Please retry.'); }).finally(() => { if (!c.signal.aborted)
        setLoading(false); }); return () => c.abort(); }, [range, revision]);
    useEffect(() => { const change = () => setRevision(v => v + 1); window.addEventListener('epaclessia:finance-changed', change); return () => window.removeEventListener('epaclessia:finance-changed', change); }, []);
    return { range, draft, setDraft, setRange, data, error, loading, refresh: () => setRevision(v => v + 1) };
}
