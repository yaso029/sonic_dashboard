import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api';
import toast from 'react-hot-toast';
import usePermissions from '../hooks/usePermissions';
import DocumentUploadModal from './clients/DocumentUploadModal';

const prettyCat = (c) => (c || '').replace(/_/g, ' ').replace(/\b\w/g, ch => ch.toUpperCase());

const fmtBytes = (b) =>
  !b ? '—' : b < 1024 ? `${b} B` : b < 1048576 ? `${(b / 1024).toFixed(1)} KB` : `${(b / 1048576).toFixed(1)} MB`;

const fmtTotal = (b) => {
  if (!b) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let i = 0, n = b;
  while (n >= 1024 && i < units.length - 1) { n /= 1024; i++; }
  return `${n.toFixed(i ? 1 : 0)} ${units[i]}`;
};

function StatCard({ label, value, valueClass = 'text-[var(--text)]', sub }) {
  return (
    <div className="stat-card min-w-[150px] flex-1">
      <div className="stat-label">{label}</div>
      <div className={`mt-1.5 text-[22px] font-extrabold ${valueClass}`}>{value}</div>
      {sub != null && <div className="mt-1 text-[11px] text-[var(--text-muted)]">{sub}</div>}
    </div>
  );
}

export default function DocumentsPage() {
  const navigate = useNavigate();
  const { can } = usePermissions();
  const [docs, setDocs] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [clientFilter, setClientFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [showUpload, setShowUpload] = useState(false);

  const fetchDocs = () => {
    setLoading(true);
    api.get('/api/documents')
      .then(r => setDocs(r.data))
      .catch(() => toast.error('Failed to load documents'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchDocs(); }, []);
  useEffect(() => {
    api.get('/api/documents/meta').then(r => setCategories(r.data.categories || [])).catch(() => {});
  }, []);

  // Distinct clients present in the document set (for the filter dropdown).
  const clientOptions = useMemo(() => {
    const m = new Map();
    docs.forEach(d => { if (d.client_id) m.set(d.client_id, d.client_name || `Client #${d.client_id}`); });
    return [...m.entries()].sort((a, b) => (a[1] || '').localeCompare(b[1] || ''));
  }, [docs]);

  const displayed = useMemo(() => {
    const q = search.trim().toLowerCase();
    return docs.filter(d => {
      if (clientFilter && String(d.client_id) !== String(clientFilter)) return false;
      if (categoryFilter && d.category !== categoryFilter) return false;
      if (q && !(`${d.file_name || ''} ${d.client_name || ''} ${d.notes || ''} ${d.uploaded_by_name || ''}`.toLowerCase().includes(q))) return false;
      return true;
    });
  }, [docs, search, clientFilter, categoryFilter]);

  const totalSize = useMemo(() => docs.reduce((s, d) => s + (d.size_bytes || 0), 0), [docs]);
  const distinctClients = useMemo(() => new Set(docs.map(d => d.client_id)).size, [docs]);
  const aiAnalyzed = useMemo(() => docs.filter(d => d.ai_analyzed_at).length, [docs]);

  const downloadDoc = async (id) => {
    try {
      const { data } = await api.get(`/api/documents/${id}/signed-url`);
      window.open(`${api.defaults.baseURL || ''}${data.url}`, '_blank');
    } catch { toast.error('Could not generate download link'); }
  };

  const deleteDoc = async (id) => {
    if (!window.confirm('Delete this document? This cannot be undone.')) return;
    try { await api.delete(`/api/documents/${id}`); fetchDocs(); toast.success('Document deleted'); }
    catch (err) { toast.error(err.response?.data?.detail || 'Delete failed'); }
  };

  return (
    <div className="min-h-screen bg-page p-7 dark:bg-surface-dark">
      <div className="mb-5 flex items-start justify-between gap-3">
        <div>
          <button onClick={() => navigate('/')} className="btn btn-ghost btn-sm mb-2">← Home</button>
          <h1 className="page-title">Documents</h1>
          <p className="page-subtitle">
            Secure client document vault. {displayed.length} of {docs.length} shown.
          </p>
        </div>
        {can('documents', 'create') && (
          <button onClick={() => setShowUpload(true)} className="btn btn-primary shrink-0">↑ Upload Document</button>
        )}
      </div>

      {/* Summary */}
      <div className="mb-[18px] flex flex-wrap gap-3">
        <StatCard label="Total Documents" value={docs.length} />
        <StatCard label="Total Size" value={fmtTotal(totalSize)} valueClass="text-sky-600 dark:text-sky-400" />
        <StatCard label="Clients with Files" value={distinctClients} valueClass="text-emerald-600 dark:text-emerald-400" />
        <StatCard label="AI Analyzed" value={aiAnalyzed} valueClass="text-purple-600 dark:text-purple-400" sub="documents with an AI summary" />
      </div>

      {/* Filters */}
      <div className="mb-4 flex flex-wrap gap-2">
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search file, client, notes…"
          className="input min-w-[220px] flex-1" />
        <select value={clientFilter} onChange={e => setClientFilter(e.target.value)} className="input min-w-[180px]">
          <option value="">All Clients</option>
          {clientOptions.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
        </select>
        <select value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)} className="input min-w-[160px]">
          <option value="">All Categories</option>
          {categories.map(c => <option key={c} value={c}>{prettyCat(c)}</option>)}
        </select>
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        <table className="data-table">
          <thead>
            <tr>
              {['File', 'Client', 'Category', 'Size', 'Uploaded By', 'Date', ''].map((h, i) => (
                <th key={i} className="th">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} className="td p-10 text-center text-[var(--text-muted)]">Loading…</td></tr>
            ) : displayed.length === 0 ? (
              <tr><td colSpan={7} className="td p-10 text-center text-[var(--text-muted)]">
                {docs.length === 0
                  ? (can('documents', 'create') ? 'No documents yet. Upload trade licenses, VAT returns, statements, etc.' : 'No documents yet.')
                  : 'No documents match your filters.'}
              </td></tr>
            ) : displayed.map(d => (
              <tr key={d.id}>
                <td className="td font-semibold text-[var(--text)]">
                  {d.file_name}
                  {d.service_type && <div className="mt-0.5 text-[11px] font-normal text-[var(--text-muted)]">↳ {prettyCat(d.service_type)}</div>}
                  {d.ai_summary && <div className="mt-0.5 max-w-[340px] text-[11px] font-normal text-purple-600 dark:text-purple-400">✨ {d.ai_summary}</div>}
                </td>
                <td className="td">
                  {d.client_id ? (
                    <button onClick={() => navigate(`/clients/${d.client_id}`)} className="font-semibold text-accent hover:underline">
                      {d.client_name || `Client #${d.client_id}`}
                    </button>
                  ) : <span className="text-[var(--text-muted)]">—</span>}
                </td>
                <td className="td"><span className="badge bg-accent-soft text-accent">{prettyCat(d.category)}</span></td>
                <td className="td text-xs text-[var(--text-muted)]">{fmtBytes(d.size_bytes)}</td>
                <td className="td text-[var(--text-muted)]">{d.uploaded_by_name || '—'}</td>
                <td className="td text-xs text-[var(--text-muted)]">{d.created_at ? new Date(d.created_at).toLocaleDateString() : '—'}</td>
                <td className="td whitespace-nowrap text-right">
                  <button onClick={() => downloadDoc(d.id)} className="btn btn-outline btn-sm mr-1.5">Download</button>
                  {can('documents', 'delete') && (
                    <button onClick={() => deleteDoc(d.id)} className="btn btn-danger btn-sm">Delete</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-3 text-xs text-[var(--text-muted)]">
        Files are scoped to clients you can access. Downloads use short-lived signed links and are recorded in each document's access log.
      </p>

      {showUpload && (
        <DocumentUploadModal
          onClose={() => setShowUpload(false)}
          onSaved={() => { setShowUpload(false); fetchDocs(); }}
        />
      )}
    </div>
  );
}
