import { useState, useRef } from 'react';
import api from '../api';
import toast from 'react-hot-toast';

const FIELD_LABELS = {
  full_name: 'Full Name', phone: 'Phone', email: 'Email', company: 'Company',
  source: 'Source', estimated_value: 'Estimated Value', notes: 'Notes',
};

export default function ImportModal({ onClose, onImported }) {
  const fileRef = useRef();
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState(null);
  const [dragOver, setDragOver] = useState(false);

  const handleFile = async (f) => {
    if (!f) return;
    const ext = f.name.split('.').pop().toLowerCase();
    if (!['csv', 'xlsx', 'xls'].includes(ext)) {
      toast.error('Only CSV and Excel (.xlsx) files allowed');
      return;
    }
    setFile(f);
    setResult(null);
    setLoading(true);
    try {
      const form = new FormData();
      form.append('file', f);
      const { data } = await api.post('/api/leads/import/preview', form);
      setPreview(data);
    } catch (err) {
      const msg = err.response?.data?.detail || err.message || 'Failed to read file';
      toast.error(msg);
      console.error('Import preview error:', err.response?.data || err.message);
      setFile(null);
    } finally {
      setLoading(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  };

  const handleImport = async () => {
    if (!file) return;
    setImporting(true);
    try {
      const form = new FormData();
      form.append('file', file);
      const { data } = await api.post('/api/leads/import', form);
      setResult(data);
      if (data.created > 0) {
        onImported();
        toast.success(`${data.created} leads imported!`);
      }
      if (data.duplicates > 0) {
        toast(`${data.duplicates} duplicate${data.duplicates > 1 ? 's' : ''} skipped`, { icon: '⚠️' });
      }
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Import failed');
    } finally {
      setImporting(false);
    }
  };

  const reset = () => {
    setFile(null);
    setPreview(null);
    setResult(null);
  };

  return (
    <div className="modal-overlay z-[300]">
      <div className="modal w-[600px] max-h-[85vh] overflow-y-auto p-9">

        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-[var(--text)]">Import Leads</h2>
            <p className="mt-1 text-[13px] text-[var(--text-muted)]">Upload a CSV or Excel file to bulk-add leads</p>
          </div>
          <button onClick={onClose} className="text-[22px] text-[var(--text-muted)] hover:text-[var(--text)]">×</button>
        </div>

        {/* Result screen */}
        {result ? (
          <div className="py-5 text-center">
            <div className="mb-3 text-5xl">{result.created > 0 ? '✅' : '⚠️'}</div>
            <div className="mb-2 text-[22px] font-bold text-[var(--text)]">
              {result.created} leads imported
            </div>
            {result.duplicates > 0 && (
              <div className="mb-2 text-sm font-semibold text-amber-600 dark:text-amber-400">
                ⚠️ {result.duplicates} duplicate{result.duplicates > 1 ? 's' : ''} found and skipped
              </div>
            )}
            {result.skipped > 0 && (
              <div className="mb-2 text-sm text-[var(--text-muted)]">{result.skipped} rows skipped</div>
            )}
            {result.errors?.length > 0 && (
              <div className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-left dark:bg-red-500/10">
                {result.errors.map((e, i) => <div key={i} className="text-xs text-red-600 dark:text-red-400">{e}</div>)}
              </div>
            )}
            <div className="mt-5 flex justify-center gap-2.5">
              <button onClick={reset} className="btn btn-outline">
                Import Another
              </button>
              <button onClick={onClose} className="btn btn-primary">
                Done
              </button>
            </div>
          </div>
        ) : !file ? (
          /* Drop zone */
          <div
            onDragOver={e => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => fileRef.current.click()}
            className={`cursor-pointer rounded-xl border-2 border-dashed px-6 py-12 text-center transition ${
              dragOver
                ? 'border-primary bg-accent-soft dark:border-accent-light dark:bg-accent/15'
                : 'border-[var(--border)] bg-[var(--surface-2)]'
            }`}
          >
            <div className="mb-3 text-[40px]">📂</div>
            <div className="mb-1.5 text-[15px] font-semibold text-[var(--text)]">
              Drop your file here or click to browse
            </div>
            <div className="text-[13px] text-[var(--text-muted)]">Supports CSV and Excel (.xlsx)</div>
            <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls" className="hidden"
              onChange={e => handleFile(e.target.files[0])} />
          </div>
        ) : loading ? (
          <div className="py-10 text-center text-[var(--text-muted)]">Reading file...</div>
        ) : preview && (
          /* Preview */
          <div>
            <div className="mb-5 flex items-center justify-between rounded-[10px] bg-accent-soft px-4 py-3.5 dark:bg-accent/15">
              <div>
                <div className="text-sm font-semibold text-[var(--text)]">📄 {file.name}</div>
                <div className="mt-0.5 text-xs text-[var(--text-muted)]">
                  {preview.total_rows} rows found · <strong className="text-emerald-600 dark:text-emerald-400">{preview.importable_rows} ready to import</strong>
                </div>
              </div>
              <button onClick={reset} className="text-[13px] text-[var(--text-muted)] hover:text-[var(--text)]">Change file</button>
            </div>

            {/* Column mapping */}
            <div className="mb-5">
              <div className="mb-2.5 text-[13px] font-semibold text-[var(--text-muted)]">Column Detection</div>
              <div className="flex flex-wrap gap-2">
                {preview.headers.map(h => {
                  const mapped = preview.column_mapping[h];
                  return (
                    <div key={h} className={`rounded-full border px-3 py-[5px] text-xs font-medium ${
                      mapped
                        ? 'border-emerald-200 bg-emerald-100 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/15 dark:text-emerald-300'
                        : 'border-[var(--border)] bg-[var(--surface-2)] text-[var(--text-muted)]'
                    }`}>
                      {h} {mapped ? `→ ${FIELD_LABELS[mapped]}` : '(ignored)'}
                    </div>
                  );
                })}
              </div>
              {preview.unrecognized_columns.length > 0 && (
                <div className="mt-2 text-xs text-amber-600 dark:text-amber-400">
                  ⚠️ {preview.unrecognized_columns.length} column(s) not recognized and will be skipped
                </div>
              )}
            </div>

            {/* Preview table */}
            <div className="mb-5">
              <div className="mb-2.5 text-[13px] font-semibold text-[var(--text-muted)]">
                Preview (first {preview.preview.length} rows)
              </div>
              <div className="overflow-x-auto rounded-lg border border-[var(--border)]">
                <table className="data-table text-xs">
                  <thead>
                    <tr>
                      {['Name', 'Phone', 'Email', 'Source', 'Budget'].map(h => (
                        <th key={h} className="th whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {preview.preview.map((row, i) => (
                      <tr key={i}>
                        <td className="td font-medium text-[var(--text)]">{row.full_name || '—'}</td>
                        <td className="td text-[var(--text-muted)]">{row.phone || '—'}</td>
                        <td className="td text-[var(--text-muted)]">{row.email || '—'}</td>
                        <td className="td text-[var(--text-muted)]">{row.source || '—'}</td>
                        <td className="td text-[var(--text-muted)]">{row.budget || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-2.5">
              <button onClick={onClose} className="btn btn-ghost">
                Cancel
              </button>
              <button
                onClick={handleImport}
                disabled={importing || preview.importable_rows === 0}
                className="btn btn-primary disabled:opacity-60"
              >
                {importing ? 'Importing...' : `Import ${preview.importable_rows} Leads`}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
