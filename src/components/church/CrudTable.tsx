import React, { useEffect, useState } from 'react';
import {
  Box, Button, Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  Paper, IconButton, Dialog, DialogTitle, DialogContent, DialogActions, TextField,
  MenuItem, CircularProgress, Stack, Checkbox, FormControlLabel, Tooltip,
  Autocomplete, Divider, Typography
} from '@mui/material';
import { Add, Edit, Delete } from '@mui/icons-material';
import AuthedImageField from '../common/AuthedImageField';

export type CrudField = {
  name: string; label: string;
  type?: 'text' | 'number' | 'select' | 'date' | 'datetime' | 'textarea' | 'checkbox' | 'image' | 'autocomplete' | 'section';
  options?: { value: string; label: string }[];
  required?: boolean; defaultValue?: any;
  /** For `image` fields: whether to preview as a round avatar or a wide logo. */
  imageVariant?: 'avatar' | 'logo';
  /**
   * For `image` fields: API path of the image already stored for this row, used
   * to show the current picture when editing. Return null when there is none.
   */
  imagePath?: (row: any) => string | null;
  /**
   * Shows this field only when the current form values satisfy the predicate.
   * Used for detail fields that only apply to one payment method, so a cash
   * entry is not cluttered with bank-transfer boxes.
   */
  showIf?: (form: any) => boolean;
  /** Small grey hint shown under the input. */
  helperText?: string;
  /**
   * For `autocomplete` fields: allows a value that is not in `options`, so a
   * user can type their own (a new giving purpose, a new inventory category).
   */
  freeSolo?: boolean;
};
export type CrudColumn = { key: string; label: string; render?: (row: any) => React.ReactNode };

type Props = {
  columns: CrudColumn[];
  fields: CrudField[];
  fetchRows: () => Promise<any[]>;
  createRow?: (data: any) => Promise<any>;
  updateRow?: (id: string, data: any) => Promise<any>;
  deleteRow?: (id: string) => Promise<any>;
  idKey?: string;
  addLabel?: string;
  rowActions?: (row: any, reload: () => void) => React.ReactNode;
  /**
   * Extra controls rendered in the toolbar next to the Add button, for things
   * like spreadsheet import. Receives `reload` so the action can refresh the
   * table once it has changed data -- the same shape as `rowActions`.
   */
  toolbarActions?: (reload: () => void) => React.ReactNode;
  emptyText?: string;
};

export const CrudTable: React.FC<Props> = ({
  columns, fields, fetchRows, createRow, updateRow, deleteRow,
  idKey = 'id', addLabel = 'Add New', rowActions, toolbarActions, emptyText = 'No records yet.'
}) => {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState<any>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = async () => {
    setLoading(true);
    try { setRows(await fetchRows()); } catch (e) { console.error(e); setRows([]); }
    finally { setLoading(false); }
  };
  useEffect(() => { reload(); /* eslint-disable-next-line */ }, []);

  const openCreate = () => {
    const init: any = {};
    fields.forEach(f => { init[f.name] = f.defaultValue ?? (f.type === 'checkbox' ? false : ''); });
    setForm(init); setEditing(null); setError(null); setOpen(true);
  };
  const openEdit = (row: any) => {
    const init: any = {};
    fields.forEach(f => { init[f.name] = row[f.name] ?? (f.type === 'checkbox' ? false : ''); });
    setForm(init); setEditing(row); setError(null); setOpen(true);
  };
  /** Fields currently applicable, given what the user has chosen so far. */
  const visibleFields = fields.filter(f => !f.showIf || f.showIf(form));

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      // Only submit fields that are actually shown. Switching the payment
      // method from bank transfer to cash must not silently keep the bank
      // details the user had already typed.
      const payload: any = {};
      visibleFields.forEach(f => {
        if (f.type === 'section') return;
        payload[f.name] = form[f.name];
      });
      if (editing && updateRow) await updateRow(editing[idKey], payload);
      else if (createRow) await createRow(payload);
      setOpen(false); await reload();
    } catch (e: any) {
      // Shown inside the dialog instead of an alert() so the user keeps their
      // typed input and can see which requirement was missed.
      setError(e?.friendlyMessage || e?.response?.data?.error || 'Failed to save. Please check the form and try again.');
    } finally { setSaving(false); }
  };
  const del = async (row: any) => {
    if (!deleteRow) return;
    if (!window.confirm('Delete this record? This cannot be undone.')) return;
    try { await deleteRow(row[idKey]); await reload(); }
    catch (e: any) { alert(e?.response?.data?.error || 'Failed to delete'); }
  };

  const showActions = !!(updateRow || deleteRow || rowActions);

  return (
    <Box>
      {(createRow || toolbarActions) && (
        <Stack direction="row" justifyContent="flex-end" spacing={1} sx={{ mb: 2 }}>
          {toolbarActions?.(reload)}
          {createRow && (
            <Button variant="contained" startIcon={<Add />} onClick={openCreate}>{addLabel}</Button>
          )}
        </Stack>
      )}
      <TableContainer component={Paper} variant="outlined">
        <Table size="small">
          <TableHead>
            <TableRow>
              {columns.map(c => <TableCell key={c.key} sx={{ fontWeight: 700 }}>{c.label}</TableCell>)}
              {showActions && <TableCell align="right" sx={{ fontWeight: 700 }}>Actions</TableCell>}
            </TableRow>
          </TableHead>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={columns.length + 1} align="center" sx={{ py: 4 }}><CircularProgress size={28} /></TableCell></TableRow>
            ) : rows.length === 0 ? (
              <TableRow><TableCell colSpan={columns.length + 1} align="center" sx={{ py: 4, color: 'text.secondary' }}>{emptyText}</TableCell></TableRow>
            ) : rows.map((row, i) => (
              <TableRow key={row[idKey] || i} hover>
                {columns.map(c => <TableCell key={c.key}>{c.render ? c.render(row) : (row[c.key] ?? '—')}</TableCell>)}
                {showActions && (
                  <TableCell align="right">
                    {rowActions && rowActions(row, reload)}
                    {updateRow && <Tooltip title="Edit"><IconButton size="small" onClick={() => openEdit(row)}><Edit fontSize="small" /></IconButton></Tooltip>}
                    {deleteRow && <Tooltip title="Delete"><IconButton size="small" color="error" onClick={() => del(row)}><Delete fontSize="small" /></IconButton></Tooltip>}
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      <Dialog open={open} onClose={() => setOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>{editing ? 'Edit Record' : addLabel}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            {error && (
              <Typography color="error" variant="body2" sx={{ fontWeight: 600 }}>{error}</Typography>
            )}
            {visibleFields.map(f => f.type === 'section' ? (
              <Box key={f.name}>
                <Divider sx={{ mb: 1.5 }} />
                <Typography variant="subtitle2" fontWeight={700}>{f.label}</Typography>
                {f.helperText && <Typography variant="caption" color="text.secondary">{f.helperText}</Typography>}
              </Box>
            ) : f.type === 'autocomplete' ? (
              <Autocomplete
                key={f.name}
                freeSolo={f.freeSolo !== false}
                options={(f.options || []).map(o => o.value)}
                value={form[f.name] ?? ''}
                // `onInputChange` (not just onChange) is what captures a value
                // the user types but never picks from the dropdown.
                onInputChange={(_, v) => setForm({ ...form, [f.name]: v })}
                onChange={(_, v) => setForm({ ...form, [f.name]: v ?? '' })}
                renderInput={(params) => (
                  <TextField {...params} label={f.label} required={f.required} helperText={f.helperText} fullWidth />
                )}
              />
            ) : f.type === 'image' ? (
              <AuthedImageField
                key={f.name}
                label={f.label}
                variant={f.imageVariant || 'avatar'}
                existingPath={editing && f.imagePath ? f.imagePath(editing) : null}
                value={form[f.name]}
                onChange={dataUrl => setForm({ ...form, [f.name]: dataUrl })}
              />
            ) : f.type === 'checkbox' ? (
              <FormControlLabel key={f.name} control={<Checkbox checked={!!form[f.name]} onChange={e => setForm({ ...form, [f.name]: e.target.checked })} />} label={f.label} />
            ) : f.type === 'select' ? (
              <TextField key={f.name} select label={f.label} value={form[f.name] ?? ''} required={f.required}
                helperText={f.helperText}
                onChange={e => setForm({ ...form, [f.name]: e.target.value })} fullWidth>
                {(f.options || []).map(o => <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>)}
              </TextField>
            ) : (
              <TextField key={f.name} label={f.label}
                type={f.type === 'number' ? 'number' : f.type === 'date' ? 'date' : f.type === 'datetime' ? 'datetime-local' : 'text'}
                value={form[f.name] ?? ''} required={f.required} helperText={f.helperText}
                multiline={f.type === 'textarea'} minRows={f.type === 'textarea' ? 3 : undefined}
                onChange={e => setForm({ ...form, [f.name]: e.target.value })} fullWidth
                InputLabelProps={f.type === 'date' || f.type === 'datetime' ? { shrink: true } : undefined} />
            ))}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default CrudTable;
