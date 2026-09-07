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
  type?: 'text' | 'number' | 'select' | 'date' | 'datetime' | 'textarea' | 'checkbox' | 'image' | 'autocomplete' | 'section'
    | 'multiselect' | 'list';
  options?: { value: string; label: string }[];
  /**
   * For `list` fields: the fields of a single entry. The value is an array of
   * objects, used for repeating groups like a member's schools attended or the
   * children in their household.
   */
  itemFields?: CrudField[];
  /** For `list` fields: wording of the add button, e.g. "Add child". */
  itemLabel?: string;
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
  /**
   * Called every time the add/edit dialog is opened, with the row being edited
   * (or null when adding). Lets a page refresh dropdown options that another
   * screen may have changed since this page was first loaded -- e.g. groups
   * added under Settings must appear on the member form without a page reload.
   */
  onDialogOpen?: (row: any | null) => void;
};

/**
 * Reads a field value, where a dotted name addresses a nested group.
 *
 * A member's medical details are one object on the record, so the form
 * addresses them as `medical.bloodGroup` rather than flattening them into a
 * dozen separate columns.
 */
const getField = (obj: any, name: string): any =>
  name.includes('.')
    ? name.split('.').reduce((acc: any, key) => (acc === null || acc === undefined ? acc : acc[key]), obj)
    : obj?.[name];

/** Returns a copy of `obj` with a (possibly nested) field set. */
const setField = (obj: any, name: string, value: any): any => {
  if (!name.includes('.')) return { ...obj, [name]: value };
  const [head, ...rest] = name.split('.');
  return { ...obj, [head]: setField(obj?.[head] ?? {}, rest.join('.'), value) };
};

/** Blank values for one entry of a `list` field. */
const emptyItem = (fields: CrudField[]): any => {
  const item: any = {};
  fields.forEach((f) => { item[f.name] = f.defaultValue ?? (f.type === 'checkbox' ? false : ''); });
  return item;
};

/**
 * A repeating group of fields - a member's schools attended, the children in
 * their household. Entries are added and removed one at a time, and each entry
 * honours `showIf` against its OWN values, so a child's dedication date only
 * appears once that child is marked as dedicated.
 */
const ListField: React.FC<{
  field: CrudField;
  value: any[];
  onChange: (rows: any[]) => void;
}> = ({ field, value, onChange }) => {
  const itemFields = field.itemFields || [];
  const rows = Array.isArray(value) ? value : [];

  const setRow = (index: number, key: string, v: any) => {
    onChange(rows.map((row, i) => (i === index ? { ...row, [key]: v } : row)));
  };

  return (
    <Box>
      <Divider sx={{ mb: 1.5 }} />
      <Typography variant="subtitle2" fontWeight={700}>{field.label}</Typography>
      {field.helperText && (
        <Typography variant="caption" color="text.secondary">{field.helperText}</Typography>
      )}
      <Stack spacing={2} sx={{ mt: 1.5 }}>
        {rows.length === 0 && (
          <Typography variant="body2" color="text.secondary">
            None added yet.
          </Typography>
        )}
        {rows.map((row, index) => (
          <Paper key={index} variant="outlined" sx={{ p: 2 }}>
            <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
              <Typography variant="caption" fontWeight={700} color="text.secondary">
                {(field.itemLabel || 'Entry')} {index + 1}
              </Typography>
              <Tooltip title="Remove">
                <IconButton
                  size="small"
                  color="error"
                  onClick={() => onChange(rows.filter((_, i) => i !== index))}
                >
                  <Delete fontSize="small" />
                </IconButton>
              </Tooltip>
            </Stack>
            <Stack spacing={1.5}>
              {itemFields
                .filter((f) => !f.showIf || f.showIf(row))
                .map((f) => f.type === 'checkbox' ? (
                  <FormControlLabel
                    key={f.name}
                    control={(
                      <Checkbox
                        checked={!!row[f.name]}
                        onChange={(e) => setRow(index, f.name, e.target.checked)}
                      />
                    )}
                    label={f.label}
                  />
                ) : f.type === 'select' ? (
                  <TextField
                    key={f.name} select size="small" fullWidth label={f.label}
                    value={row[f.name] ?? ''} helperText={f.helperText}
                    onChange={(e) => setRow(index, f.name, e.target.value)}
                  >
                    {(f.options || []).map((o) => (
                      <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>
                    ))}
                  </TextField>
                ) : (
                  <TextField
                    key={f.name} size="small" fullWidth label={f.label}
                    type={f.type === 'number' ? 'number' : f.type === 'date' ? 'date' : 'text'}
                    value={row[f.name] ?? ''} helperText={f.helperText}
                    multiline={f.type === 'textarea'} minRows={f.type === 'textarea' ? 2 : undefined}
                    onChange={(e) => setRow(index, f.name, e.target.value)}
                    InputLabelProps={f.type === 'date' ? { shrink: true } : undefined}
                  />
                ))}
            </Stack>
          </Paper>
        ))}
        <Box>
          <Button
            size="small"
            startIcon={<Add />}
            onClick={() => onChange([...rows, emptyItem(itemFields)])}
          >
            {field.itemLabel ? `Add ${field.itemLabel.toLowerCase()}` : 'Add entry'}
          </Button>
        </Box>
      </Stack>
    </Box>
  );
};

export const CrudTable: React.FC<Props> = ({
  columns, fields, fetchRows, createRow, updateRow, deleteRow,
  idKey = 'id', addLabel = 'Add New', rowActions, toolbarActions, emptyText = 'No records yet.',
  onDialogOpen,
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

  /** The blank value a field starts from, which differs by field type. */
  const blankFor = (f: CrudField) =>
    f.defaultValue ?? (f.type === 'checkbox' ? false : f.type === 'multiselect' || f.type === 'list' ? [] : '');

  const openCreate = () => {
    let init: any = {};
    fields.forEach(f => { init = setField(init, f.name, blankFor(f)); });
    setForm(init); setEditing(null); setError(null); setOpen(true);
    // Refresh any option lists this form depends on, so a group or office
    // created moments ago on another screen is already selectable here.
    onDialogOpen?.(null);
  };
  const openEdit = (row: any) => {
    let init: any = {};
    fields.forEach(f => {
      const stored = getField(row, f.name);
      // A list or multi-select must always be an array to edit. Stored values
      // can arrive as JSON text from older records, so those are parsed rather
      // than silently discarded.
      if (f.type === 'multiselect' || f.type === 'list') {
        init = setField(init, f.name, Array.isArray(stored)
          ? stored
          : typeof stored === 'string' && stored.trim().startsWith('[')
            ? (() => { try { return JSON.parse(stored); } catch { return []; } })()
            : []);
        return;
      }
      init = setField(init, f.name, stored ?? blankFor(f));
    });
    setForm(init); setEditing(row); setError(null); setOpen(true);
    onDialogOpen?.(row);
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
      let payload: any = {};
      visibleFields.forEach(f => {
        if (f.type === 'section') return;
        payload = setField(payload, f.name, getField(form, f.name));
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
            ) : f.type === 'list' ? (
              <ListField
                key={f.name}
                field={f}
                value={getField(form, f.name)}
                onChange={rows => setForm(setField(form, f.name, rows))}
              />
            ) : f.type === 'multiselect' ? (
              <Autocomplete
                key={f.name}
                multiple
                disableCloseOnSelect
                options={(f.options || []).map(o => o.value)}
                getOptionLabel={v => (f.options || []).find(o => o.value === v)?.label || String(v)}
                value={Array.isArray(getField(form, f.name)) ? getField(form, f.name) : []}
                onChange={(_, v) => setForm(setField(form, f.name, v))}
                renderInput={(params) => (
                  <TextField
                    {...params}
                    label={f.label}
                    required={f.required}
                    helperText={f.helperText}
                    fullWidth
                  />
                )}
              />
            ) : f.type === 'autocomplete' ? (
              <Autocomplete
                key={f.name}
                freeSolo={f.freeSolo !== false}
                options={(f.options || []).map(o => o.value)}
                value={getField(form, f.name) ?? ''}
                // `onInputChange` (not just onChange) is what captures a value
                // the user types but never picks from the dropdown.
                onInputChange={(_, v) => setForm(setField(form, f.name, v))}
                onChange={(_, v) => setForm(setField(form, f.name, v ?? ''))}
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
                value={getField(form, f.name)}
                onChange={dataUrl => setForm(setField(form, f.name, dataUrl))}
              />
            ) : f.type === 'checkbox' ? (
              <FormControlLabel key={f.name} control={<Checkbox checked={!!getField(form, f.name)} onChange={e => setForm(setField(form, f.name, e.target.checked))} />} label={f.label} />
            ) : f.type === 'select' ? (
              <TextField key={f.name} select label={f.label} value={getField(form, f.name) ?? ''} required={f.required}
                helperText={f.helperText}
                onChange={e => setForm(setField(form, f.name, e.target.value))} fullWidth>
                {(f.options || []).map(o => <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>)}
              </TextField>
            ) : (
              <TextField key={f.name} label={f.label}
                type={f.type === 'number' ? 'number' : f.type === 'date' ? 'date' : f.type === 'datetime' ? 'datetime-local' : 'text'}
                value={getField(form, f.name) ?? ''} required={f.required} helperText={f.helperText}
                multiline={f.type === 'textarea'} minRows={f.type === 'textarea' ? 3 : undefined}
                onChange={e => setForm(setField(form, f.name, e.target.value))} fullWidth
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
