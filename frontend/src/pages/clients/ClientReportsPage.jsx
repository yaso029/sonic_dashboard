import { useEffect, useMemo, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ResponsiveContainer, LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts';
import toast from 'react-hot-toast';
import api from '../../api';
import useIsMobile from '../../hooks/useIsMobile';

/* ─── Palette ──────────────────────────────────────────────────────────────── */
const C = {
  revenue: '#111111', collected: '#777777', outstanding: '#bbbbbb',
  active: '#10b981', paused: '#f59e0b', archived: '#94a3b8',
};
const STATUS_TASK = { todo: '#64748b', in_progress: '#3b82f6', blocked: '#ef4444', done: '#10b981' };
const SERVICE_COLORS = ['#111111', '#2e2e2e', '#454545', '#5c5c5c', '#737373', '#8a8a8a', '#a1a1a1', '#b8b8b8', '#cfcfcf'];
const COMPLIANCE = {
  overdue: { label: 'Overdue', cls: 'bg-red-500/15 text-red-700 dark:text-red-300' },
  urgent: { label: 'Urgent', cls: 'bg-amber-500/15 text-amber-700 dark:text-amber-300' },
  upcoming: { label: 'Upcoming', cls: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300' },
  action_required: { label: 'Action Needed', cls: 'bg-violet-500/15 text-violet-700 dark:text-violet-300' },
};

/* ─── Formatting helpers ───────────────────────────────────────────────────── */
const compact = (n) => {
  n = Number(n || 0);
  if (Math.abs(n) >= 1e6) return (n / 1e6).toFixed(1).replace(/\.0$/, '') + 'M';
  if (Math.abs(n) >= 1e3) return (n / 1e3).toFixed(1).replace(/\.0$/, '') + 'K';
  return String(Math.round(n));
};
const moneyC = (n, c = 'AED') => `${c} ${compact(n)}`;
const money0 = (n, c = 'AED') => `${c} ${Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
const pretty = (s) => String(s || '').replace(/_/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase());
const fmtDate = (s) => (s ? new Date(s).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');
const fmtDateTime = (s) => (s ? new Date(s).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—');

const fmtLocal = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const RANGES = {
  this_month: 'This Month', '3m': 'Last 3 Months', '6m': 'Last 6 Months',
  '12m': 'Last 12 Months', ytd: 'Year to Date',
};
function rangeFor(preset) {
  const t = new Date();
  const end = fmtLocal(t);
  const first = (y, m) => fmtLocal(new Date(y, m, 1));
  switch (preset) {
    case 'this_month': return { start: first(t.getFullYear(), t.getMonth()), end };
    case '3m': return { start: first(t.getFullYear(), t.getMonth() - 2), end };
    case '12m': return { start: first(t.getFullYear(), t.getMonth() - 11), end };
    case 'ytd': return { start: first(t.getFullYear(), 0), end };
    case '6m':
    default: return { start: first(t.getFullYear(), t.getMonth() - 5), end };
  }
}

/* ─── Small presentational primitives ──────────────────────────────────────── */
function Section({ title, subtitle, children, right }) {
  return (
    <section className="mt-7">
      <div className="mb-3 flex items-end justify-between gap-3">
        <div>
          <h2 className="text-[15px] font-bold tracking-tight text-[var(--text)]">{title}</h2>
          {subtitle && <p className="text-xs text-[var(--text-muted)]">{subtitle}</p>}
        </div>
        {right}
      </div>
      {children}
    </section>
  );
}

function Card({ children, className = '', pad = 'p-5' }) {
  return <div className={`card ${pad} ${className}`}>{children}</div>;
}

function TrendBadge({ pct, goodIsUp = true }) {
  if (pct === null || pct === undefined) {
    return <span className="text-[11px] font-medium text-[var(--text-muted)]">— no prior period</span>;
  }
  const up = pct >= 0;
  const good = goodIsUp ? up : !up;
  return (
    <span className={`inline-flex items-center gap-0.5 text-[11px] font-semibold ${good ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
      {up ? '▲' : '▼'} {Math.abs(pct).toFixed(1)}%
    </span>
  );
}

function KpiCard({ icon, label, value, children, accent }) {
  return (
    <div className="stat-card min-w-[150px] flex-1 border-t-[3px]" style={{ borderTopColor: accent }}>
      <div className="flex items-center justify-between">
        <span className="stat-label">{label}</span>
        <span className="text-lg leading-none">{icon}</span>
      </div>
      <div className="stat-value mt-1">{value}</div>
      <div className="mt-0.5 min-h-[16px]">{children}</div>
    </div>
  );
}

/* ─── Reusable searchable + sortable table ─────────────────────────────────── */
function DataTable({ columns, rows, searchKeys, initialSort, searchable = true, emptyLabel = 'No data', maxHeight }) {
  const [q, setQ] = useState('');
  const [sort, setSort] = useState(initialSort || null);

  const filtered = useMemo(() => {
    let r = rows;
    if (q && searchKeys?.length) {
      const needle = q.toLowerCase();
      r = r.filter((row) => searchKeys.some((k) => String(row[k] ?? '').toLowerCase().includes(needle)));
    }
    if (sort) {
      const col = columns.find((c) => c.key === sort.key);
      const val = (row) => (col?.sortValue ? col.sortValue(row) : row[sort.key]);
      r = [...r].sort((a, b) => {
        const av = val(a), bv = val(b);
        if (av == null && bv == null) return 0;
        if (av == null) return 1;
        if (bv == null) return -1;
        if (typeof av === 'number' && typeof bv === 'number') return sort.dir === 'asc' ? av - bv : bv - av;
        return sort.dir === 'asc'
          ? String(av).localeCompare(String(bv))
          : String(bv).localeCompare(String(av));
      });
    }
    return r;
  }, [rows, q, sort, columns, searchKeys]);

  const toggleSort = (key) => {
    setSort((s) => (s?.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }));
  };

  return (
    <div>
      {searchable && (
        <div className="mb-3 flex items-center gap-2">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search…"
            className="input max-w-[240px]"
          />
          {q && <span className="text-xs text-[var(--text-muted)]">{filtered.length} of {rows.length}</span>}
        </div>
      )}
      <div className="overflow-x-auto" style={maxHeight ? { maxHeight, overflowY: 'auto' } : undefined}>
        <table className="data-table">
          <thead>
            <tr>
              {columns.map((c) => (
                <th
                  key={c.key}
                  className={`th ${c.align === 'right' ? 'text-right' : ''} ${c.sortable !== false ? 'cursor-pointer select-none hover:text-[var(--text)]' : ''}`}
                  onClick={c.sortable !== false ? () => toggleSort(c.key) : undefined}
                  style={{ whiteSpace: 'nowrap' }}
                >
                  {c.label}
                  {sort?.key === c.key && <span className="ml-1">{sort.dir === 'asc' ? '↑' : '↓'}</span>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={columns.length} className="td p-8 text-center text-[var(--text-muted)]">{emptyLabel}</td></tr>
            ) : (
              filtered.map((row, i) => (
                <tr key={row._key ?? i} className={row._onClick ? 'cursor-pointer' : ''} onClick={row._onClick}>
                  {columns.map((c) => (
                    <td key={c.key} className={`td ${c.align === 'right' ? 'text-right' : ''}`}>
                      {c.render ? c.render(row) : row[c.key]}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ChartFrame({ title, children, height = 240 }) {
  return (
    <Card>
      <h3 className="mb-3 text-[13px] font-semibold text-[var(--text)]">{title}</h3>
      <ResponsiveContainer width="100%" height={height}>{children}</ResponsiveContainer>
    </Card>
  );
}

const axisTick = { fontSize: 11, fill: 'var(--text-muted)' };
const tooltipStyle = {
  contentStyle: { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, fontSize: 12, color: 'var(--text)' },
  labelStyle: { color: 'var(--text-muted)' },
};

/* ─── Loading skeleton ─────────────────────────────────────────────────────── */
function Skeleton() {
  return (
    <div className="animate-pulse">
      <div className="mb-7 flex flex-wrap gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-24 min-w-[150px] flex-1 rounded-card border border-[var(--border)] bg-[var(--surface-2)]" />
        ))}
      </div>
      <div className="grid gap-5 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-64 rounded-card border border-[var(--border)] bg-[var(--surface-2)]" />
        ))}
      </div>
    </div>
  );
}

/* ─── Page ─────────────────────────────────────────────────────────────────── */
export default function ClientReportsPage() {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const [preset, setPreset] = useState('6m');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchReport = useCallback(async (showToast = false) => {
    setLoading(true);
    try {
      const { start, end } = rangeFor(preset);
      const { data } = await api.get('/api/reports/clients', { params: { start, end } });
      setData(data);
      if (showToast) toast.success('Report refreshed');
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed to load report');
    } finally {
      setLoading(false);
    }
  }, [preset]);

  useEffect(() => { fetchReport(); }, [fetchReport]);

  const exportCSV = () => {
    if (!data) return;
    const esc = (v) => {
      const s = String(v ?? '');
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines = [];
    const push = (arr) => lines.push(arr.map(esc).join(','));
    push(['Sonic — Client Reports']);
    push(['Range', data.range.start, 'to', data.range.end]);
    push([]);
    push(['Key Metrics']);
    const k = data.kpis;
    push(['Active Clients', k.active_clients]);
    push(['Total Revenue (AED)', k.total_revenue]);
    push(['Outstanding (AED)', k.outstanding]);
    push(['Overdue Amount (AED)', k.overdue_amount]);
    push(['Upcoming Deliverables', k.upcoming_vat_filings]);
    push(['Overdue Tasks', k.overdue_tasks]);
    push(['Monthly Collections (AED)', k.monthly_collections]);
    push([]);
    push(['Top Clients by Revenue']);
    push(['Client', 'Total Revenue', 'Outstanding', 'Last Payment']);
    data.revenue.top_clients.forEach((c) => push([c.name, c.total_revenue, c.outstanding, c.last_payment_date || '']));
    push([]);
    push(['Upcoming Compliance Deadlines']);
    push(['Client', 'Type', 'Due Date', 'Status']);
    data.compliance.deadlines.forEach((d) => push([d.client, d.type, d.due_date || 'N/A', d.status]));
    push([]);
    push(['Team Workload']);
    push(['Marketing Specialist', 'Open Tasks', 'Completed', 'Urgent']);
    data.tasks.team_workload.forEach((t) => push([t.marketing_specialist, t.open, t.completed, t.urgent]));
    push([]);
    push(['Inactive Clients']);
    push(['Client', 'Last Activity', 'Outstanding', 'Reason']);
    data.activity.inactive_clients.forEach((c) => push([c.name, c.last_activity || '', c.outstanding, c.reason]));

    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `client-reports_${data.range.start}_${data.range.end}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Report exported');
  };

  return (
    <div className="pb-10">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="page-title">Client Reports</h1>
          <p className="page-subtitle">Overview of clients, revenue, compliance, and operational activity.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select value={preset} onChange={(e) => setPreset(e.target.value)} className="input min-w-[150px] max-w-[180px]">
            {Object.entries(RANGES).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          <button onClick={exportCSV} disabled={!data} className="btn btn-outline">⭳ Export Report</button>
          <button onClick={() => fetchReport(true)} className="btn btn-primary">↻ Refresh</button>
        </div>
      </div>

      {loading || !data ? <div className="mt-7"><Skeleton /></div> : <Report data={data} navigate={navigate} isMobile={isMobile} />}
    </div>
  );
}

/* ─── Report body (data guaranteed present) ────────────────────────────────── */
function Report({ data, navigate, isMobile }) {
  const k = data.kpis;
  const cur = data.currency || 'AED';

  const statusPie = [
    { name: 'Active', value: data.client_status.active, color: C.active },
    { name: 'Paused', value: data.client_status.paused, color: C.paused },
    { name: 'Archived', value: data.client_status.archived, color: C.archived },
  ].filter((s) => s.value > 0);

  const serviceBars = data.client_status.by_service_type.map((s) => ({ name: pretty(s.type), count: s.count }));
  const accountantMax = Math.max(1, ...data.client_status.by_accountant.map((a) => a.count));
  const taskBars = data.tasks.by_status.map((s) => ({ name: pretty(s.status), count: s.count, color: STATUS_TASK[s.status] }));

  return (
    <>
      {/* ── Top KPI cards ── */}
      <div className="mt-6 flex flex-wrap gap-4">
        <KpiCard icon="👥" label="Active Clients" value={k.active_clients} accent={C.active}>
          <span className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">+{k.new_clients_period}</span>
          <span className="text-[11px] text-[var(--text-muted)]"> new this period</span>
        </KpiCard>
        <KpiCard icon="💰" label="Total Revenue" value={moneyC(k.total_revenue, cur)} accent={C.revenue}>
          <TrendBadge pct={k.total_revenue_trend_pct} />
        </KpiCard>
        <KpiCard icon="🧾" label="Outstanding Invoices" value={moneyC(k.outstanding, cur)} accent={C.outstanding}>
          <span className="text-[11px] font-semibold text-red-600 dark:text-red-400">{money0(k.overdue_amount, cur)}</span>
          <span className="text-[11px] text-[var(--text-muted)]"> overdue</span>
        </KpiCard>
        <KpiCard icon="📋" label="Upcoming Deliverables" value={k.upcoming_vat_filings} accent="#3b82f6">
          <span className="text-[11px] text-[var(--text-muted)]">due within 60 days</span>
        </KpiCard>
        <KpiCard icon="⏰" label="Overdue Tasks" value={k.overdue_tasks} accent="#ef4444">
          <span className="text-[11px] text-[var(--text-muted)]">of {k.open_tasks} open tasks</span>
        </KpiCard>
        <KpiCard icon="📈" label="Monthly Collections" value={moneyC(k.monthly_collections, cur)} accent={C.collected}>
          <TrendBadge pct={k.monthly_collections_trend_pct} />
        </KpiCard>
      </div>

      {/* ── Section 1: Revenue Overview ── */}
      <Section title="Revenue Overview" subtitle="Invoiced vs. collected across the selected period.">
        <div className={`grid gap-5 ${isMobile ? 'grid-cols-1' : 'grid-cols-2'}`}>
          <ChartFrame title="Revenue vs Collections">
            <LineChart data={data.revenue.monthly} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="label" tick={axisTick} />
              <YAxis tick={axisTick} tickFormatter={compact} />
              <Tooltip {...tooltipStyle} formatter={(v) => money0(v, cur)} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Line type="monotone" dataKey="invoiced" name="Invoiced" stroke={C.revenue} strokeWidth={2.5} dot={{ r: 3 }} />
              <Line type="monotone" dataKey="collected" name="Collected" stroke={C.collected} strokeWidth={2.5} dot={{ r: 3 }} />
            </LineChart>
          </ChartFrame>
          <ChartFrame title="Outstanding by Month">
            <BarChart data={data.revenue.monthly} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis dataKey="label" tick={axisTick} />
              <YAxis tick={axisTick} tickFormatter={compact} />
              <Tooltip {...tooltipStyle} cursor={{ fill: 'rgba(0,0,0,0.06)' }} formatter={(v) => money0(v, cur)} />
              <Bar dataKey="outstanding" name="Outstanding" fill={C.outstanding} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ChartFrame>
        </div>

        <Card className="mt-5" pad="p-5">
          <h3 className="mb-3 text-[13px] font-semibold text-[var(--text)]">Top Clients by Revenue</h3>
          <DataTable
            searchKeys={['name']}
            initialSort={{ key: 'total_revenue', dir: 'desc' }}
            rows={data.revenue.top_clients.map((c) => ({
              ...c, _key: c.client_id, _onClick: () => navigate(`/clients/${c.client_id}`),
            }))}
            emptyLabel="No revenue recorded in this period."
            columns={[
              { key: 'name', label: 'Client Name', render: (r) => <span className="font-semibold text-[var(--text)]">{r.name}</span> },
              { key: 'total_revenue', label: 'Total Revenue', align: 'right', render: (r) => <span className="font-semibold text-emerald-600 dark:text-emerald-400">{money0(r.total_revenue, cur)}</span> },
              { key: 'outstanding', label: 'Outstanding', align: 'right', render: (r) => <span className={r.outstanding > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-[var(--text-muted)]'}>{money0(r.outstanding, cur)}</span> },
              { key: 'last_payment_date', label: 'Last Payment', align: 'right', render: (r) => <span className="text-[var(--text-muted)]">{fmtDate(r.last_payment_date)}</span> },
            ]}
          />
        </Card>
      </Section>

      {/* ── Section 2: Client Status ── */}
      <Section title="Client Status" subtitle="Distribution across status, service type, and assigned marketing_specialist.">
        <div className="grid gap-5 lg:grid-cols-3">
          <ChartFrame title="By Status" height={220}>
            <PieChart>
              <Pie data={statusPie} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={2}>
                {statusPie.map((s, i) => <Cell key={i} fill={s.color} />)}
              </Pie>
              <Tooltip {...tooltipStyle} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
            </PieChart>
          </ChartFrame>

          <ChartFrame title="Clients by Service Type" height={220}>
            <BarChart data={serviceBars} layout="vertical" margin={{ top: 0, right: 12, left: 10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
              <XAxis type="number" tick={axisTick} allowDecimals={false} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: 'var(--text-muted)' }} width={92} />
              <Tooltip {...tooltipStyle} cursor={{ fill: 'rgba(0,0,0,0.06)' }} />
              <Bar dataKey="count" name="Services" radius={[0, 4, 4, 0]}>
                {serviceBars.map((_, i) => <Cell key={i} fill={SERVICE_COLORS[i % SERVICE_COLORS.length]} />)}
              </Bar>
            </BarChart>
          </ChartFrame>

          <Card>
            <h3 className="mb-3 text-[13px] font-semibold text-[var(--text)]">Clients by Marketing Specialist</h3>
            <div className="flex flex-col gap-3">
              {data.client_status.by_accountant.length === 0 ? (
                <p className="text-sm text-[var(--text-muted)]">No assignments.</p>
              ) : data.client_status.by_accountant.map((a) => (
                <div key={a.marketing_specialist}>
                  <div className="mb-1 flex items-center justify-between text-[13px]">
                    <span className="text-[var(--text)]">{a.marketing_specialist}</span>
                    <span className="font-semibold text-[var(--text-muted)]">{a.count}</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-[var(--surface-2)]">
                    <div className="h-full rounded-full bg-accent" style={{ width: `${(a.count / accountantMax) * 100}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </Section>

      {/* ── Section 3: Compliance ── */}
      <Section title="Compliance Reports" subtitle="UAE VAT, corporate tax, trade-license renewals and registration gaps.">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <AlertCard tone="red" icon="🚨" value={data.compliance.summary.overdue} label="Overdue Filings" hint="Past their statutory deadline" />
          <AlertCard tone="amber" icon="⚠️" value={data.compliance.summary.urgent} label="Urgent (≤30 days)" hint="Need attention this month" />
          <AlertCard tone="violet" icon="🆔" value={data.compliance.summary.missing_trn} label="Missing TRN" hint="No tax registration on file" />
          <AlertCard tone="blue" icon="📄" value={data.compliance.summary.license_renewals} label="License Renewals" hint="Trade licenses due to renew" />
        </div>

        <Card className="mt-5">
          <h3 className="mb-3 text-[13px] font-semibold text-[var(--text)]">Upcoming Compliance Deadlines</h3>
          <DataTable
            searchKeys={['client', 'type']}
            initialSort={{ key: 'days', dir: 'asc' }}
            maxHeight={420}
            rows={data.compliance.deadlines.map((d, i) => ({
              ...d, _key: `${d.client_id}-${d.type}-${i}`,
              _onClick: () => navigate(`/clients/${d.client_id}`),
            }))}
            emptyLabel="No upcoming deadlines. 🎉"
            columns={[
              { key: 'client', label: 'Client', render: (r) => <span className="font-medium text-[var(--text)]">{r.client}</span> },
              { key: 'type', label: 'Deadline Type', render: (r) => <span className="text-[var(--text-muted)]">{r.type}</span> },
              { key: 'days', label: 'Due Date', sortValue: (r) => (r.days == null ? 99999 : r.days), render: (r) => (
                <span className="text-[var(--text)]">{r.due_date ? fmtDate(r.due_date) : '—'}
                  {r.days != null && <span className="ml-1 text-[11px] text-[var(--text-muted)]">({r.days < 0 ? `${-r.days}d ago` : `in ${r.days}d`})</span>}
                </span>
              ) },
              { key: 'status', label: 'Status', render: (r) => {
                const c = COMPLIANCE[r.status] || COMPLIANCE.upcoming;
                return <span className={`badge ${c.cls}`}>{c.label}</span>;
              } },
            ]}
          />
        </Card>
      </Section>

      {/* ── Section 4: Tasks & Operations ── */}
      <Section title="Tasks & Operations" subtitle="Workflow health and team workload.">
        <div className="mb-5 flex flex-wrap gap-4">
          <KpiCard icon="📂" label="Open Tasks" value={data.tasks.open} accent="#64748b" />
          <KpiCard icon="⏰" label="Overdue Tasks" value={data.tasks.overdue} accent="#ef4444" />
          <KpiCard icon="✅" label="Completed Tasks" value={data.tasks.completed} accent="#10b981" />
          <KpiCard icon="🔥" label="High Priority" value={data.tasks.high_priority} accent="#f59e0b" />
        </div>
        <div className={`grid gap-5 ${isMobile ? 'grid-cols-1' : 'grid-cols-5'}`}>
          <div className={isMobile ? '' : 'col-span-2'}>
            <ChartFrame title="Tasks by Status" height={240}>
              <BarChart data={taskBars} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="name" tick={axisTick} />
                <YAxis tick={axisTick} allowDecimals={false} />
                <Tooltip {...tooltipStyle} cursor={{ fill: 'rgba(0,0,0,0.06)' }} />
                <Bar dataKey="count" name="Tasks" radius={[4, 4, 0, 0]}>
                  {taskBars.map((t, i) => <Cell key={i} fill={t.color} />)}
                </Bar>
              </BarChart>
            </ChartFrame>
          </div>
          <Card className={isMobile ? '' : 'col-span-3'}>
            <h3 className="mb-3 text-[13px] font-semibold text-[var(--text)]">Team Workload</h3>
            <DataTable
              searchable={false}
              initialSort={{ key: 'open', dir: 'desc' }}
              rows={data.tasks.team_workload.map((t, i) => ({ ...t, _key: i }))}
              emptyLabel="No tasks assigned."
              columns={[
                { key: 'marketing_specialist', label: 'Marketing Specialist', render: (r) => <span className="font-medium text-[var(--text)]">{r.marketing_specialist}</span> },
                { key: 'open', label: 'Open', align: 'right' },
                { key: 'completed', label: 'Completed', align: 'right' },
                { key: 'urgent', label: 'Urgent', align: 'right', render: (r) => <span className={r.urgent > 0 ? 'font-semibold text-red-600 dark:text-red-400' : 'text-[var(--text-muted)]'}>{r.urgent}</span> },
              ]}
            />
          </Card>
        </div>
      </Section>

      {/* ── Section 5: Client Activity ── */}
      <Section title="Client Activity" subtitle="Recent events and clients that may need a nudge.">
        <div className={`grid gap-5 ${isMobile ? 'grid-cols-1' : 'grid-cols-5'}`}>
          <Card className={isMobile ? '' : 'col-span-2'}>
            <h3 className="mb-3 text-[13px] font-semibold text-[var(--text)]">Recent Activity</h3>
            {data.activity.recent.length === 0 ? (
              <p className="py-6 text-center text-sm text-[var(--text-muted)]">No recent activity.</p>
            ) : (
              <div className="flex flex-col">
                {data.activity.recent.map((a, i) => (
                  <div key={i} className="flex items-start gap-3 border-b border-[var(--border)] py-2.5 last:border-0">
                    <span className="text-base">{a.type === 'payment' ? '💰' : '📄'}</span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[13px] text-[var(--text)]">{a.title}</div>
                      <div className="text-[11px] text-[var(--text-muted)]">{a.subtitle} · {fmtDateTime(a.date)}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
          <Card className={isMobile ? '' : 'col-span-3'}>
            <h3 className="mb-3 text-[13px] font-semibold text-[var(--text)]">Inactive Clients</h3>
            <DataTable
              searchKeys={['name', 'reason']}
              initialSort={{ key: 'days_idle', dir: 'desc' }}
              maxHeight={360}
              rows={data.activity.inactive_clients.map((c) => ({
                ...c, _key: c.client_id, _onClick: () => navigate(`/clients/${c.client_id}`),
              }))}
              emptyLabel="All clients are active. 🎉"
              columns={[
                { key: 'name', label: 'Client', render: (r) => <span className="font-medium text-[var(--text)]">{r.name}</span> },
                { key: 'last_activity', label: 'Last Activity', render: (r) => <span className="text-[var(--text-muted)]">{fmtDate(r.last_activity)}</span> },
                { key: 'outstanding', label: 'Outstanding', align: 'right', render: (r) => <span className={r.outstanding > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-[var(--text-muted)]'}>{money0(r.outstanding, cur)}</span> },
                { key: 'reason', label: 'Reason', render: (r) => (
                  <span className={`badge ${r.reason === 'Overdue invoice' ? 'bg-red-500/15 text-red-700 dark:text-red-300' : 'bg-gray-500/12 text-gray-600 dark:text-gray-300'}`}>{r.reason}</span>
                ) },
              ]}
            />
          </Card>
        </div>
      </Section>

      <p className="mt-8 text-center text-[11px] text-[var(--text-muted)]">
        Report generated {fmtDateTime(data.generated_at)} · Range {fmtDate(data.range.start)} – {fmtDate(data.range.end)}
      </p>
    </>
  );
}

function AlertCard({ tone, icon, value, label, hint }) {
  const tones = {
    red: 'border-red-500/30 bg-red-500/5',
    amber: 'border-amber-500/30 bg-amber-500/5',
    violet: 'border-violet-500/30 bg-violet-500/5',
    blue: 'border-blue-500/30 bg-blue-500/5',
  };
  const valTone = {
    red: 'text-red-600 dark:text-red-400',
    amber: 'text-amber-600 dark:text-amber-400',
    violet: 'text-violet-600 dark:text-violet-400',
    blue: 'text-blue-600 dark:text-blue-400',
  };
  return (
    <div className={`rounded-card border ${tones[tone]} p-4`}>
      <div className="flex items-center gap-2">
        <span className="text-lg">{icon}</span>
        <span className="text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">{label}</span>
      </div>
      <div className={`mt-1.5 text-2xl font-bold ${valTone[tone]}`}>{value}</div>
      <div className="text-[11px] text-[var(--text-muted)]">{hint}</div>
    </div>
  );
}
