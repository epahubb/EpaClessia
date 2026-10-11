import React from 'react';
import { Alert, Box, Button, LinearProgress, Stack, TextField } from '@mui/material';
import { RefreshCw } from 'lucide-react';
import { financeRange } from '../../lib/financeReports';
export default function FinanceControls({ state }: {
    state: any;
}) {
    const [invalid, setInvalid] = React.useState('');
    const apply = () => { try {
        financeRange(state.draft.from, state.draft.to);
        setInvalid('');
        state.setRange({ ...state.draft });
    }
    catch (e: any) {
        setInvalid(e.message);
    } };
    return <Box><Stack direction={{ xs: 'column', sm: 'row' }} gap={1.5} sx={{ p: 2, bgcolor: 'background.paper', border: '1px solid', borderColor: 'divider', borderRadius: 3, alignItems: { sm: 'center' } }}>
    <TextField size="small" type="date" label="From (UTC)" value={state.draft.from} onChange={e => state.setDraft((d: any) => ({ ...d, from: e.target.value }))} slotProps={{ inputLabel: { shrink: true } }}/>
    <TextField size="small" type="date" label="To (UTC)" value={state.draft.to} onChange={e => state.setDraft((d: any) => ({ ...d, to: e.target.value }))} slotProps={{ inputLabel: { shrink: true } }}/>
    <Button variant="contained" onClick={apply} disabled={state.loading}>Apply period</Button><Button startIcon={<RefreshCw size={16}/>} onClick={state.refresh} disabled={state.loading}>Refresh</Button>
  </Stack>{state.loading && <LinearProgress sx={{ mt: 1, borderRadius: 2 }}/>}{(state.error || invalid) && <Alert severity="error" sx={{ mt: 2 }} action={<Button onClick={state.refresh}>Retry</Button>}>{invalid || state.error}</Alert>}</Box>;
}
