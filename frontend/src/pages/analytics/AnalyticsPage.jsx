import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import api from '../../api';
import toast from 'react-hot-toast';

const fmtNum = (v) => {
  const n = Number(v) || 0;
  if (Math.abs(n) >= 1000) return n.toLocaleString(undefined, { maximumFractionDigits: 0 });
  return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
};
const fmtVal = (m, v) => (m.unit === 'AED' ? `AED ${fmtNum(v)}` : m.unit === 'x' ? `${fmtNum(v)}x` : fmtNum(v));
const shortPeriod = (p) => { const [, mo] = (p || '').split('-'); return ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][parseInt(mo) || 0] || p; };

function Delta({ d }) {
  if (d === null || d === undefined) return <span className="text-[11px] text-[var(--text-muted)]">—</span>;
  const up = d >= 0;
  return <span className={`text-[11px] font-semibold ${up ? 'text-emerald-600' : 'text-red-500'}`}>{up ? '▲' : '▼'} {Math.abs(d)}%</span>;
}

export default function AnalyticsPage() {
  const navigate = useNavigate();
  const [clients, setClients] = useState([]);
  const [meta, setMeta] = useState({ metrics: [], channels: [] });
  const [clientId, setClientId] = useState('');
  const [months, setMonths] = useState(6);
  const [summary, setSummary] = useState(null);
  const [entries, setEntries] = useState([]);
  const [form, setForm] = useState({ period: '', metric: 'followers', value: '', channel: '' });
  const [showData, setShowData] = useState(false);

  useEffect(() => {
    api.get('/api/analytics/meta').then((r) => setMeta(r.data)).catch(() => {});
    api.get('/api/clients').then((r) => setClients(r.data || [])).catch(() => {});
    const d = new Date();
    setForm((f) => ({ ...f, period: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` }));
  }, []);

  const loadSummary = () => {
    const p = new URLSearchParams({ months: String(months) });
    if (clientId) p.set('client_id', clientId);
    api.get(`/api/analytics/summary?${p.toString()}`).then((r) => setSummary(r.data)).catch(() => {});
  };
  const loadEntries = () => {
    const p = new URLSearchParams();
    if (clientId) p.set('client_id', clientId);
    api.get(`/api/analytics/entries?${p.toString()}`).then((r) => setEntries(r.data)).catch(() => {});
  };
  useEffect(() => { loadSummary(); loadEntries(); }, [clientId, months]); // eslint-disable-line react-hooks/exhaustive-deps

  const metricsWithData = useMemo(() => (summary?.metrics || []).filter((m) => m.has_data), [summary]);
  const clientName = clients.find((c) => String(c.id) === String(clientId))?.company_name || 'All clients';

  const addEntry = async (e) => {
    e.preventDefault();
    if (!form.period || !form.metric) return toast.error('Period and metric are required');
    try {
      await api.post('/api/analytics/entries', {
        client_id: clientId ? parseInt(clientId) : null,
        period: form.period, metric: form.metric,
        value: parseFloat(form.value) || 0, channel: form.channel || null,
      });
      toast.success('Saved');
      setForm((f) => ({ ...f, value: '' }));
      loadSummary(); loadEntries();
    } catch (err) { toast.error(err?.response?.data?.detail || 'Failed to save'); }
  };

  const delEntry = async (id) => {
    if (!window.confirm('Delete this entry?')) return;
    try { await api.delete(`/api/analytics/entries/${id}`); loadSummary(); loadEntries(); }
    catch { toast.error('Delete failed'); }
  };

  const metricLabel = (key) => meta.metrics.find((m) => m.key === key)?.label || key;

  return (
    <div className="min-h-screen bg-page p-6">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <button onClick={() => navigate('/')} className="rounded-md border-[1.5px] border-gray-200 bg-white px-3 py-1.5 text-xs text-gray-600">← Home</button>
        <h1 className="text-[18px] font-black text-[var(--text)]">📊 Analytics &amp; KPIs</h1>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <select className="input !h-9 !py-0 text-xs" value={clientId} onChange={(e) => setClientId(e.target.value)}>
            <option value="">All clients</option>
            {clients.map((c) => <option key={c.id} value={c.id}>{c.company_name}</option>)}
          </select>
          <select className="input !h-9 !py-0 text-xs" value={months} onChange={(e) => setMonths(parseInt(e.target.value))}>
            <option value={3}>Last 3 months</option>
            <option value={6}>Last 6 months</option>
            <option value={12}>Last 12 months</option>
          </select>
          <button onClick={() => setShowData((v) => !v)} className="btn btn-outline btn-sm">{showData ? 'Hide data' : '✎ Enter data'}</button>
          <button onClick={() => window.print()} className="btn btn-ghost btn-sm">🖨 Print</button>
        </div>
      </div>

      <div className="mb-4 text-[13px] text-[var(--text-muted)]">Report for <b className="text-[var(--text)]">{clientName}</b> · last {months} months</div>

      {/* Data entry */}
      {showData && (
        <div className="mb-5 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
          <form onSubmit={addEntry} className="flex flex-wrap items-end gap-2">
            <div><label className="label">Month</label><input type="month" className="input !h-9" value={form.period} onChange={(e) => setForm((f) => ({ ...f, period: e.target.value }))} /></div>
            <div><label className="label">Metric</label>
              <select className="input !h-9 !py-0" value={form.metric} onChange={(e) => setForm((f) => ({ ...f, metric: e.target.value }))}>
                {meta.metrics.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
              </select>
            </div>
            <div><label className="label">Channel</label>
              <select className="input !h-9 !py-0" value={form.channel} onChange={(e) => setForm((f) => ({ ...f, channel: e.target.value }))}>
                <option value="">All</option>
                {(meta.channels || []).filter((c) => c !== 'all').map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div><label className="label">Value</label><input type="number" step="any" className="input !h-9 w-32" value={form.value} onChange={(e) => setForm((f) => ({ ...f, value: e.target.value }))} placeholder="0" /></div>
            <button type="submit" className="btn btn-primary btn-sm">+ Add</button>
            <span className="text-[11px] text-[var(--text-muted)]">{clientId ? `for ${clientName}` : 'no client (global)'}</span>
          </form>

          {entries.length > 0 && (
            <div className="mt-3 max-h-52 overflow-y-auto rounded-lg border border-[var(--border)]">
              <table className="w-full text-[12px]">
                <thead className="bg-[var(--surface-2)] text-[var(--text-muted)]">
                  <tr><th className="px-3 py-1.5 text-left">Month</th><th className="px-3 py-1.5 text-left">Metric</th><th className="px-3 py-1.5 text-left">Channel</th><th className="px-3 py-1.5 text-right">Value</th><th /></tr>
                </thead>
                <tbody>
                  {entries.map((e) => (
                    <tr key={e.id} className="border-t border-[var(--border)]">
                      <td className="px-3 py-1.5">{e.period}</td>
                      <td className="px-3 py-1.5">{metricLabel(e.metric)}</td>
                      <td className="px-3 py-1.5 text-[var(--text-muted)]">{e.channel || 'all'}</td>
                      <td className="px-3 py-1.5 text-right font-semibold">{fmtNum(e.value)}</td>
                      <td className="px-3 py-1.5 text-right"><button onClick={() => delEntry(e.id)} className="text-red-500 hover:underline">✕</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* KPI cards */}
      <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {(summary?.metrics || []).map((m) => (
          <div key={m.key} className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">{m.label}</div>
            <div className="mt-1 flex items-end justify-between">
              <div className="text-[22px] font-black text-[var(--text)]">{fmtVal(m, m.latest)}</div>
              <Delta d={m.delta} />
            </div>
          </div>
        ))}
      </div>

      {/* Charts */}
      {metricsWithData.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[var(--border)] bg-[var(--surface)] p-10 text-center text-[13px] text-[var(--text-muted)]">
          No data yet. Click <b>✎ Enter data</b> to add monthly metrics for this client.
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {metricsWithData.map((m) => (
            <div key={m.key} className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-[13px] font-bold text-[var(--text)]">{m.label}</span>
                <span className="text-[12px] text-[var(--text-muted)]">{fmtVal(m, m.latest)} <Delta d={m.delta} /></span>
              </div>
              <ResponsiveContainer width="100%" height={180}>
                <AreaChart data={m.series.map((s) => ({ ...s, label: shortPeriod(s.period) }))} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
                  <defs>
                    <linearGradient id={`g-${m.key}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#6366f1" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="#6366f1" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} width={48} />
                  <Tooltip formatter={(v) => fmtVal(m, v)} />
                  <Area type="monotone" dataKey="value" stroke="#6366f1" strokeWidth={2} fill={`url(#g-${m.key})`} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
