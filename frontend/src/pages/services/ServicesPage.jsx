import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../api';
import toast from 'react-hot-toast';

const STATUS_COLORS = {
  active: '#10b981', paused: '#f59e0b', completed: '#3b82f6', cancelled: '#9ca3af',
};
const RECURRENCE_LABELS = {
  one_time: 'One-time', monthly: 'Monthly', quarterly: 'Quarterly', annual: 'Annual',
};

const money = (n, c = 'AED') =>
  `${c} ${Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

const titleCase = (s) => (s || '').replace(/_/g, ' ').replace(/\b\w/g, m => m.toUpperCase());

function StatCard({ label, value, valueClass = 'text-[var(--text)]', sub }) {
  return (
    <div className="stat-card min-w-[150px] flex-1">
      <div className="stat-label">{label}</div>
      <div className={`mt-1.5 text-[22px] font-extrabold ${valueClass}`}>{value}</div>
      {sub != null && <div className="mt-1 text-[11px] text-[var(--text-muted)]">{sub}</div>}
    </div>
  );
}

export default function ServicesPage() {
  const navigate = useNavigate();
  const [catalog, setCatalog] = useState({ services: [], statuses: [], recurrences: [] });
  const [services, setServices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [typeFilter, setTypeFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [recurrenceFilter, setRecurrenceFilter] = useState('');
  const [search, setSearch] = useState('');

  // Catalog (type labels + filter options) — fetched once.
  useEffect(() => {
    api.get('/api/services/catalog').then(r => setCatalog(r.data)).catch(() => {});
  }, []);

  // Services — refetch when server-side filters change.
  useEffect(() => {
    setLoading(true);
    const params = {};
    if (statusFilter) params.status = statusFilter;
    if (typeFilter) params.service_type = typeFilter;
    api.get('/api/services', { params })
      .then(r => setServices(r.data))
      .catch(() => toast.error('Failed to load services'))
      .finally(() => setLoading(false));
  }, [statusFilter, typeFilter]);

  const typeLabel = (key) => catalog.services.find(s => s.key === key)?.label || titleCase(key);

  // Client-side: recurrence filter + client/notes search.
  const displayed = useMemo(() => {
    const q = search.trim().toLowerCase();
    return services.filter(s => {
      if (recurrenceFilter && s.recurrence !== recurrenceFilter) return false;
      if (q && !(`${s.client_name || ''} ${s.notes || ''}`.toLowerCase().includes(q))) return false;
      return true;
    });
  }, [services, recurrenceFilter, search]);

  // Summary metrics computed from the current (server-filtered) set.
  const activeList = services.filter(s => s.status === 'active');
  const distinctClients = new Set(services.map(s => s.client_id)).size;
  const activeFeeValue = activeList.reduce((sum, s) => sum + (s.fee_amount || 0), 0);

  // Breakdown by service type (active only) — clickable chips set the type filter.
  const byType = useMemo(() => {
    const counts = {};
    activeList.forEach(s => { counts[s.service_type] = (counts[s.service_type] || 0) + 1; });
    return Object.entries(counts).sort((a, b) => b[1] - a[1]);
  }, [services]);

  return (
    <div className="min-h-screen bg-page p-7 dark:bg-surface-dark">
      <div className="mb-5 flex items-start justify-between">
        <div>
          <button onClick={() => navigate('/')} className="btn btn-ghost btn-sm mb-2">← Home</button>
          <h1 className="page-title">Client Services</h1>
          <p className="page-subtitle">
            Practice-wide view of every engagement. {displayed.length} shown.
          </p>
        </div>
      </div>

      {/* Summary */}
      <div className="mb-[18px] flex flex-wrap gap-3">
        <StatCard label="Total Services" value={services.length} />
        <StatCard label="Active" value={activeList.length} valueClass="text-emerald-600 dark:text-emerald-400" />
        <StatCard label="Clients Engaged" value={distinctClients} valueClass="text-sky-600 dark:text-sky-400" />
        <StatCard label="Active Fee Value" value={money(activeFeeValue)} valueClass="text-amber-600 dark:text-amber-400" sub="sum of active engagement fees" />
      </div>

      {/* By-type chips */}
      {byType.length > 0 && (
        <div className="mb-[18px] flex flex-wrap items-center gap-2">
          <span className="text-[11px] font-bold uppercase tracking-wide text-[var(--text-muted)]">Active by type:</span>
          {byType.map(([key, count]) => (
            <button key={key} onClick={() => setTypeFilter(typeFilter === key ? '' : key)}
              className={`rounded-full px-3 py-1 text-xs font-semibold ${typeFilter === key ? 'bg-primary text-white' : 'border border-[var(--border)] bg-[var(--surface)] text-[var(--text-muted)]'}`}>
              {typeLabel(key)} <span className="opacity-70">{count}</span>
            </button>
          ))}
        </div>
      )}

      {/* Filters */}
      <div className="mb-4 flex flex-wrap gap-2">
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search client or notes…"
          className="input min-w-[220px] flex-1" />
        <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)} className="input min-w-[160px]">
          <option value="">All Types</option>
          {catalog.services.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
        </select>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="input min-w-[140px]">
          <option value="">All Statuses</option>
          {(catalog.statuses || []).map(s => <option key={s} value={s}>{titleCase(s)}</option>)}
        </select>
        <select value={recurrenceFilter} onChange={e => setRecurrenceFilter(e.target.value)} className="input min-w-[140px]">
          <option value="">All Recurrences</option>
          {(catalog.recurrences || []).map(r => <option key={r} value={r}>{RECURRENCE_LABELS[r] || titleCase(r)}</option>)}
        </select>
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        <table className="data-table">
          <thead>
            <tr>
              {['Client', 'Service', 'Recurrence', 'Assignee', 'Fee', 'Status'].map(h => (
                <th key={h} className="th">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} className="td p-10 text-center text-[var(--text-muted)]">Loading…</td></tr>
            ) : displayed.length === 0 ? (
              <tr><td colSpan={6} className="td p-10 text-center text-[var(--text-muted)]">
                No services match. Services are created from a client's page.
              </td></tr>
            ) : displayed.map(s => (
              <tr key={s.id} onClick={() => navigate(`/clients/${s.client_id}`)} className="cursor-pointer">
                <td className="td font-semibold text-[var(--text)]">{s.client_name || '—'}</td>
                <td className="td font-semibold text-accent">{typeLabel(s.service_type)}</td>
                <td className="td text-xs text-[var(--text-muted)]">{RECURRENCE_LABELS[s.recurrence] || titleCase(s.recurrence)}</td>
                <td className="td text-xs text-[var(--text-muted)]">{s.assigned_to_name || '—'}</td>
                <td className="td font-semibold text-[var(--text)]">{s.fee_amount ? money(s.fee_amount, s.fee_currency) : '—'}</td>
                <td className="td">
                  <span className="badge capitalize" style={{ background: `${STATUS_COLORS[s.status] || '#9ca3af'}20`, color: STATUS_COLORS[s.status] || '#9ca3af' }}>
                    {s.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-3 text-xs text-[var(--text-muted)]">
        Tip: click any row to open the client and add, edit or invoice the engagement.
      </p>
    </div>
  );
}
