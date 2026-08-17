import React, { useMemo, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import { Upload, X, Download, AlertTriangle, CheckCircle2, Loader2, ArrowLeft } from 'lucide-react';
import churchApi from '../../services/churchApi';
import {
  MEMBER_IMPORT_FIELDS,
  guessColumnMapping,
  validateImportRows,
  MAX_IMPORT_ROWS,
} from '../../lib/memberImport';

/**
 * Bulk member import from Excel or CSV.
 *
 * Flow: pick file -> confirm column mapping -> server-verified preview -> import.
 *
 * The file is parsed in the browser, so a large register never travels as a
 * binary upload. Only plain JSON rows are posted, and the server re-validates
 * everything with the same rules used here (src/lib/memberImport.ts).
 */

interface MemberImportModalProps {
  open: boolean;
  onClose: () => void;
  /** Called after a successful import so the caller can refresh its list. */
  onImported?: (summary: ImportSummary) => void;
}

interface ImportSummary {
  totalRows: number;
  imported: number;
  importable: number;
  skipped: number;
  failed: number;
  duplicateEmailsInFile: string[];
  skippedRows: Array<{ rowNumber: number; reason: string }>;
  failedRows: Array<{ rowNumber: number; errors: string[] }>;
  warnings: Array<{ rowNumber: number; warnings: string[] }>;
}

type Step = 'select' | 'map' | 'preview' | 'done';

const MemberImportModal: React.FC<MemberImportModalProps> = ({ open, onClose, onImported }) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<Step>('select');
  const [fileName, setFileName] = useState('');
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [skipExisting, setSkipExisting] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<ImportSummary | null>(null);

  const reset = () => {
    setStep('select');
    setFileName('');
    setHeaders([]);
    setRows([]);
    setMapping({});
    setBusy(false);
    setError(null);
    setSummary(null);
    if (inputRef.current) inputRef.current.value = '';
  };

  const close = () => {
    reset();
    onClose();
  };

  /** Local validation, used to preview problems before contacting the server. */
  const localValidation = useMemo(() => {
    if (rows.length === 0) return null;
    return validateImportRows(rows, mapping);
  }, [rows, mapping]);

  const handleFile = async (file?: File) => {
    if (!file) return;
    setError(null);
    setBusy(true);
    try {
      const buffer = await file.arrayBuffer();
      // cellDates makes SheetJS hand back real Date objects instead of the
      // serial numbers that silently turn birthdays into five-digit integers.
      const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });
      const sheetName = workbook.SheetNames[0];
      if (!sheetName) throw new Error('That file contains no sheets.');
      const sheet = workbook.Sheets[sheetName];

      const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, blankrows: false });
      if (matrix.length === 0) throw new Error('The first sheet is empty.');

      const headerRow = (matrix[0] as unknown[]).map((h) => String(h ?? '').trim());
      const parsedRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
        defval: null,
        blankrows: false,
      });

      if (parsedRows.length === 0) throw new Error('The sheet has headers but no data rows.');
      if (parsedRows.length > MAX_IMPORT_ROWS) {
        throw new Error(
          `This file has ${parsedRows.length} rows. The limit is ${MAX_IMPORT_ROWS} per import, so please split it.`,
        );
      }

      setFileName(file.name);
      setHeaders(headerRow.filter((h) => h !== ''));
      setRows(parsedRows);
      setMapping(guessColumnMapping(headerRow));
      setStep('map');
    } catch (err: any) {
      setError(err?.message || 'That file could not be read.');
    } finally {
      setBusy(false);
    }
  };

  /** Ask the server for an authoritative preview without writing anything. */
  const runPreview = async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await churchApi.importMembers(rows, mapping, {
        skipExistingEmails: skipExisting,
        dryRun: true,
      });
      setSummary(result);
      setStep('preview');
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'The preview could not be generated.');
    } finally {
      setBusy(false);
    }
  };

  const runImport = async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await churchApi.importMembers(rows, mapping, {
        skipExistingEmails: skipExisting,
        dryRun: false,
      });
      setSummary(result);
      setStep('done');
      onImported?.(result);
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'The import failed.');
    } finally {
      setBusy(false);
    }
  };

  /** Hand the user a correctly-headed template so mapping is unnecessary. */
  const downloadTemplate = () => {
    const labels = MEMBER_IMPORT_FIELDS.map((f) => f.label);
    const example = [
      'Ama', 'Mensah', 'ama.mensah@example.com', '0244123456', 'Female',
      '1990-04-03', 'Married', '2015-06-20', 'Teacher', 'Accra', 'MEM-000123', 'Active', '',
    ];
    const sheet = XLSX.utils.aoa_to_sheet([labels, example]);
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, sheet, 'Members');
    XLSX.writeFile(book, 'member-import-template.xlsx');
  };

  if (!open) return null;

  const unmappedRequired = MEMBER_IMPORT_FIELDS.filter((f) => f.required && !mapping[f.key]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-3xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h2 className="text-lg font-semibold">Import members from a spreadsheet</h2>
          <button type="button" onClick={close} className="text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-6 py-4 overflow-y-auto space-y-4">
          {error && (
            <div className="flex gap-2 p-3 rounded bg-red-50 border border-red-200 text-sm text-red-700">
              <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {step === 'select' && (
            <div className="space-y-4">
              <p className="text-sm text-gray-600">
                Upload an Excel (.xlsx, .xls) or CSV file. The first row must contain column headings.
                Up to {MAX_IMPORT_ROWS} members can be imported at a time.
              </p>
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                disabled={busy}
                className="w-full border-2 border-dashed border-gray-300 rounded-lg py-10 flex flex-col items-center gap-2 hover:border-blue-400 hover:bg-blue-50/40 disabled:opacity-50"
              >
                {busy ? <Loader2 className="w-6 h-6 animate-spin text-gray-400" /> : <Upload className="w-6 h-6 text-gray-400" />}
                <span className="text-sm font-medium text-gray-700">
                  {busy ? 'Reading file...' : 'Choose a spreadsheet'}
                </span>
              </button>
              <button
                type="button"
                onClick={downloadTemplate}
                className="inline-flex items-center gap-2 text-sm text-blue-600 hover:underline"
              >
                <Download className="w-4 h-4" />
                Download a template with the correct columns
              </button>
            </div>
          )}

          {step === 'map' && (
            <div className="space-y-4">
              <p className="text-sm text-gray-600">
                <strong>{fileName}</strong> &mdash; {rows.length} data row{rows.length === 1 ? '' : 's'} found.
                Confirm which spreadsheet column feeds each field.
              </p>

              <div className="space-y-2">
                {MEMBER_IMPORT_FIELDS.map((field) => (
                  <div key={field.key} className="flex items-center gap-3">
                    <label className="w-40 text-sm text-gray-700 shrink-0">
                      {field.label}
                      {field.required && <span className="text-red-500"> *</span>}
                    </label>
                    <select
                      value={mapping[field.key] || ''}
                      onChange={(e) =>
                        setMapping((prev) => {
                          const next = { ...prev };
                          if (e.target.value === '') delete next[field.key];
                          else next[field.key] = e.target.value;
                          return next;
                        })
                      }
                      className="flex-1 border border-gray-300 rounded px-2 py-1.5 text-sm"
                    >
                      <option value="">-- not imported --</option>
                      {headers.map((h) => (
                        <option key={h} value={h}>{h}</option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>

              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input type="checkbox" checked={skipExisting} onChange={(e) => setSkipExisting(e.target.checked)} />
                Skip members whose email address is already in the register
              </label>

              {localValidation && localValidation.invalidRows.length > 0 && (
                <div className="p-3 rounded bg-amber-50 border border-amber-200 text-sm text-amber-800">
                  {localValidation.invalidRows.length} row{localValidation.invalidRows.length === 1 ? '' : 's'} will
                  be skipped because of missing or invalid data. You will see the details next.
                </div>
              )}
            </div>
          )}

          {(step === 'preview' || step === 'done') && summary && (
            <div className="space-y-4">
              {step === 'done' && (
                <div className="flex gap-2 p-3 rounded bg-green-50 border border-green-200 text-sm text-green-800">
                  <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />
                  <span>{summary.imported} member{summary.imported === 1 ? '' : 's'} imported successfully.</span>
                </div>
              )}

              <div className="grid grid-cols-4 gap-3 text-center">
                <Stat label="Rows in file" value={summary.totalRows} />
                <Stat label={step === 'done' ? 'Imported' : 'Will import'} value={step === 'done' ? summary.imported : summary.importable} tone="green" />
                <Stat label="Skipped" value={summary.skipped} tone="amber" />
                <Stat label="Invalid" value={summary.failed} tone="red" />
              </div>

              {summary.failedRows.length > 0 && (
                <IssueList
                  title="Rows that cannot be imported"
                  tone="red"
                  items={summary.failedRows.map((r) => `Row ${r.rowNumber}: ${r.errors.join('; ')}`)}
                />
              )}
              {summary.skippedRows.length > 0 && (
                <IssueList
                  title="Rows skipped as duplicates"
                  tone="amber"
                  items={summary.skippedRows.map((r) => `Row ${r.rowNumber}: ${r.reason}`)}
                />
              )}
              {summary.warnings.length > 0 && (
                <IssueList
                  title="Warnings (these rows will still import)"
                  tone="gray"
                  items={summary.warnings.map((r) => `Row ${r.rowNumber}: ${r.warnings.join('; ')}`)}
                />
              )}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between px-6 py-4 border-t bg-gray-50">
          <div>
            {(step === 'map' || step === 'preview') && (
              <button
                type="button"
                onClick={() => setStep(step === 'preview' ? 'map' : 'select')}
                disabled={busy}
                className="inline-flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900 disabled:opacity-50"
              >
                <ArrowLeft className="w-4 h-4" />
                Back
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button type="button" onClick={close} className="px-4 py-2 text-sm border border-gray-300 rounded hover:bg-white">
              {step === 'done' ? 'Close' : 'Cancel'}
            </button>

            {step === 'map' && (
              <button
                type="button"
                onClick={runPreview}
                disabled={busy || unmappedRequired.length > 0}
                title={unmappedRequired.length > 0 ? `Map ${unmappedRequired.map((f) => f.label).join(' and ')} first` : undefined}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm text-white bg-blue-600 rounded hover:bg-blue-700 disabled:opacity-50"
              >
                {busy && <Loader2 className="w-4 h-4 animate-spin" />}
                Preview import
              </button>
            )}

            {step === 'preview' && (
              <button
                type="button"
                onClick={runImport}
                disabled={busy || summary?.importable === 0}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm text-white bg-green-600 rounded hover:bg-green-700 disabled:opacity-50"
              >
                {busy && <Loader2 className="w-4 h-4 animate-spin" />}
                Import {summary?.importable ?? 0} member{summary?.importable === 1 ? '' : 's'}
              </button>
            )}
          </div>
        </div>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept=".xlsx,.xls,.csv"
        className="hidden"
        onChange={(e) => handleFile(e.target.files?.[0])}
      />
    </div>
  );
};

const Stat: React.FC<{ label: string; value: number; tone?: 'green' | 'amber' | 'red' }> = ({ label, value, tone }) => {
  const color =
    tone === 'green' ? 'text-green-600' : tone === 'amber' ? 'text-amber-600' : tone === 'red' ? 'text-red-600' : 'text-gray-900';
  return (
    <div className="border border-gray-200 rounded p-3">
      <div className={`text-xl font-semibold ${color}`}>{value}</div>
      <div className="text-xs text-gray-500">{label}</div>
    </div>
  );
};

const IssueList: React.FC<{ title: string; items: string[]; tone: 'red' | 'amber' | 'gray' }> = ({ title, items, tone }) => {
  const styles =
    tone === 'red'
      ? 'bg-red-50 border-red-200 text-red-800'
      : tone === 'amber'
        ? 'bg-amber-50 border-amber-200 text-amber-800'
        : 'bg-gray-50 border-gray-200 text-gray-700';
  return (
    <div className={`p-3 rounded border text-sm ${styles}`}>
      <div className="font-medium mb-1">{title}</div>
      <ul className="list-disc pl-5 space-y-0.5 max-h-40 overflow-y-auto">
        {items.slice(0, 50).map((item, i) => (
          <li key={i}>{item}</li>
        ))}
      </ul>
      {items.length > 50 && <div className="mt-1 text-xs opacity-75">...and {items.length - 50} more.</div>}
    </div>
  );
};

export default MemberImportModal;
