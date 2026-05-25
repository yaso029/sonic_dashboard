import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../api';
import { useAuth } from '../../AuthContext';

const money = (n, c = 'AED') =>
  `${c} ${Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const OPEN_TASK = ['todo', 'in_progress', 'blocked'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const todayISO = () => new Date().toISOString().slice(0, 10);

function fmtDate(d) {
  if (!d) return '—';
  const dt = new Date(d);
  if (isNaN(dt)) return d;
  return `${dt.getDate()} ${MONTHS[dt.getMonth()]}`;
}

function daysFromToday(iso) {
  // iso = YYYY-MM-DD
  const t = new Date(todayISO());
  const d = new Date(iso);
  if (isNaN(d)) return null;
  return Math.round((d - t) / 86400000);
}

// Data-driven due-badge hue (text colour depends on how soon the date is).
function dueBadge(iso) {
  const n = daysFromToday(iso);
  if (n === null) return { text: '', color: '#94a3b8' };
  if (n < 0) return { text: `${-n}d overdue`, color: '#ef4444' };
  if (n === 0) return { text: 'today', color: '#f59e0b' };
  if (n === 1) return { text: 'tomorrow', color: '#f59e0b' };
  if (n <= 7) return { text: `in ${n}d`, color: '#0ea5e9' };
  return { text: `in ${n}d`, color: '#94a3b8' };
}

function StatCard({ label, value, tone = '', sub, onClick }) {
  return (
    <div
      onClick={onClick}
      className={`stat-card min-w-[150px] flex-1 ${onClick ? 'cursor-pointer transition-transform hover:-translate-y-0.5' : ''}`}
    >
      <div className="stat-label">{label}</div>
      <div className={`mt-1.5 text-[22px] font-extrabold ${tone || 'text-[var(--text)]'}`}>{value}</div>
      {sub != null && <div className="mt-1 text-[11px] text-[var(--text-muted)]/70">{sub}</div>}
    </div>
  );
}

function Panel({ title, action, children }) {
  return (
    <div className="card min-w-[320px] flex-1 overflow-hidden p-0">
      <div className="flex items-center justify-between border-b border-[var(--border)] px-[18px] py-3.5">
        <div className="text-xs font-bold uppercase tracking-wide text-[var(--text-muted)]">{title}</div>
        {action}
      </div>
      <div className="py-2">{children}</div>
    </div>
  );
}

export default function AgentsDashboard() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [clients, setClients] = useState([]);
  const [services, setServices] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [reports, setReports] = useState(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      const safe = (p) => p.then(r => r.data).catch(() => null);
      const [cl, sv, tk, inv, rep] = await Promise.all([
        safe(api.get('/api/clients')),
        safe(api.get('/api/services', { params: { status: 'active' } })),
        safe(api.get('/api/tasks')),
        safe(api.get('/api/invoices')),
        safe(api.get('/api/billing/reports')),
      ]);
      if (!alive) return;
      setClients(cl || []);
      setServices(sv || []);
      setTasks(tk || []);
      setInvoices(inv || []);
      setReports(rep);
      setLoading(false);
    })();
    return () => { alive = false; };
  }, []);

  const activeClients = clients.filter(c => c.status !== 'archived');
  const openTasks = tasks.filter(t => OPEN_TASK.includes(t.status));
  const overdueTasks = openTasks.filter(t => t.due_date && t.due_date < todayISO());

  // ── Upcoming deadlines: open tasks + unpaid invoices that have a due date ──
  const deadlines = [
    ...openTasks
      .filter(t => t.due_date)
      .map(t => ({ kind: 'task', date: t.due_date, label: t.title, sub: t.client_name || 'Internal', to: t.client_id ? `/clients/${t.client_id}` : '/crm' })),
    ...invoices
      .filter(i => i.due_date && !['paid', 'void', 'draft'].includes(i.status))
      .map(i => ({ kind: 'invoice', date: i.due_date, label: `${i.invoice_number} · ${money(i.balance, i.currency)}`, sub: i.client_name, to: `/billing/${i.id}` })),
  ].sort((a, b) => (a.date < b.date ? -1 : 1)).slice(0, 8);

  // ── Recent activity: newest invoices, tasks, clients merged ──
  const activity = [
    ...invoices.map(i => ({
      ts: i.created_at, icon: '🧾', text: `Invoice ${i.invoice_number} created`, sub: i.client_name, to: `/billing/${i.id}`,
    })),
    ...tasks.map(t => (t.completed_at
      ? { ts: t.completed_at, icon: '✅', text: `Task done: ${t.title}`, sub: t.client_name || 'Internal', to: t.client_id ? `/clients/${t.client_id}` : '/crm' }
      : { ts: t.created_at, icon: '📋', text: `Task: ${t.title}`, sub: t.client_name || 'Internal', to: t.client_id ? `/clients/${t.client_id}` : '/crm' })),
    ...activeClients.map(c => ({ ts: c.created_at, icon: '🏢', text: `Client: ${c.company_name}`, sub: c.assigned_accountant_name || '', to: `/clients/${c.id}` })),
  ].filter(a => a.ts).sort((a, b) => (a.ts < b.ts ? 1 : -1)).slice(0, 7);

  const aging = reports?.aging;

  return (
    <div>
      <div className="mb-6">
        <h1 className="page-title">Marketing Specialists Dashboard</h1>
        <p className="page-subtitle">
          {loading ? 'Loading your workspace…' : `Welcome back, ${user?.full_name || ''} — here's your practice at a glance.`}
        </p>
      </div>

      {/* KPI row */}
      <div className="mb-[18px] flex flex-wrap gap-3">
        <StatCard label="Clients" value={activeClients.length}
          tone="text-primary dark:text-accent-light"
          sub={clients.length !== activeClients.length ? `${clients.length - activeClients.length} archived` : 'active'}
          onClick={() => navigate('/clients')} />
        <StatCard label="Active Services" value={services.length} tone="text-accent"
          onClick={() => navigate('/clients')} />
        <StatCard label="Open Tasks" value={openTasks.length} tone="text-sky-500" sub={`${tasks.length} total`} />
        <StatCard label="Overdue Tasks" value={overdueTasks.length}
          tone={overdueTasks.length ? 'text-red-500' : 'text-emerald-500'} />
        {reports && (
          <StatCard label="AR Outstanding" value={money(reports.total_outstanding)} tone="text-amber-500"
            sub={reports.overdue_amount ? `${money(reports.overdue_amount)} overdue` : 'none overdue'}
            onClick={() => navigate('/billing')} />
        )}
      </div>

      {/* AR aging strip */}
      {aging && reports.total_outstanding > 0 && (
        <div className="card mb-[18px] px-[18px] py-3.5">
          <div className="mb-2.5 text-[11px] font-bold uppercase tracking-wide text-[var(--text-muted)]">Accounts Receivable Aging</div>
          <div className="flex flex-wrap gap-7">
            {[['Current', 'current'], ['1–30d', '1_30'], ['31–60d', '31_60'], ['61–90d', '61_90'], ['90d+', '90_plus']].map(([lbl, k]) => (
              <div key={k}>
                <div className="text-[11px] text-[var(--text-muted)]/70">{lbl}</div>
                <div className={`text-sm font-bold ${k === '90_plus' ? 'text-red-500' : 'text-[var(--text)]'}`}>{money(aging[k])}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Two panels */}
      <div className="flex flex-wrap items-start gap-4">
        <Panel
          title="Upcoming deadlines"
          action={<span className="text-[11px] text-[var(--text-muted)]/60">{deadlines.length} item{deadlines.length === 1 ? '' : 's'}</span>}
        >
          {loading ? (
            <div className="p-6 text-center text-[13px] text-[var(--text-muted)]">Loading…</div>
          ) : deadlines.length === 0 ? (
            <div className="p-7 text-center text-[13px] text-[var(--text-muted)]">No dated tasks or invoices due 🎉</div>
          ) : deadlines.map((d, i) => {
            const b = dueBadge(d.date);
            return (
              <div key={i} onClick={() => navigate(d.to)}
                className={`flex cursor-pointer items-center gap-3 px-[18px] py-2.5 hover:bg-[var(--surface-2)] ${i < deadlines.length - 1 ? 'border-b border-[var(--border)]' : ''}`}>
                <div className="w-[46px] text-center text-xs font-bold text-primary dark:text-accent-light">{fmtDate(d.date)}</div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13px] font-semibold text-[var(--text)]">
                    <span className="mr-1.5">{d.kind === 'invoice' ? '🧾' : '📋'}</span>{d.label}
                  </div>
                  <div className="text-[11px] text-[var(--text-muted)]">{d.sub}</div>
                </div>
                <span className="whitespace-nowrap text-[11px] font-bold" style={{ color: b.color }}>{b.text}</span>
              </div>
            );
          })}
        </Panel>

        <Panel title="Recent activity">
          {loading ? (
            <div className="p-6 text-center text-[13px] text-[var(--text-muted)]">Loading…</div>
          ) : activity.length === 0 ? (
            <div className="p-7 text-center text-[13px] text-[var(--text-muted)]">No recent activity yet.</div>
          ) : activity.map((a, i) => (
            <div key={i} onClick={() => navigate(a.to)}
              className={`flex cursor-pointer items-center gap-3 px-[18px] py-2.5 hover:bg-[var(--surface-2)] ${i < activity.length - 1 ? 'border-b border-[var(--border)]' : ''}`}>
              <div className="text-base">{a.icon}</div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13px] font-semibold text-[var(--text)]">{a.text}</div>
                {a.sub ? <div className="text-[11px] text-[var(--text-muted)]">{a.sub}</div> : null}
              </div>
              <span className="whitespace-nowrap text-[11px] text-[var(--text-muted)]/60">{fmtDate(a.ts)}</span>
            </div>
          ))}
        </Panel>
      </div>

      {/* Quick links */}
      <div className="mt-[18px] flex flex-wrap gap-2.5">
        {[['Clients', '/clients'], ['Billing', '/billing'], ['CRM / Leads', '/crm'], ['Calendar', '/calendar']].map(([lbl, to]) => (
          <button key={to} onClick={() => navigate(to)} className="btn btn-outline">
            {lbl} →
          </button>
        ))}
      </div>
    </div>
  );
}
