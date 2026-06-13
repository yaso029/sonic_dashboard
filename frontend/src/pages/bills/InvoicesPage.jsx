import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import api from '../../api';
import toast from 'react-hot-toast';

const pad = (n) => String(n).padStart(2, '0');
const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const CUR = { USD: { symbol: '$', label: 'US Dollar', color: '#10b981' }, SYP: { symbol: 'ل.س', label: 'Syrian Pound', color: '#6366f1' } };
const REC_LABEL = { none: 'One-off', monthly: 'Monthly', yearly: 'Yearly' };
const REC_COLOR = { none: '#9ca3af', monthly: '#3b82f6', yearly: '#8b5cf6' };

const fmtMoney = (amount, currency) => {
  const n = Number(amount) || 0;
  if (currency === 'USD') return `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  return `${n.toLocaleString(undefined, { maximumFractionDigits: 0 })} ل.س`;
};

function daysLabel(days) {
  if (days === null || days === undefined) return '';
  if (days < 0) return `Expired ${-days}d ago`;
  if (days === 0) return 'Expires today';
  if (days === 1) return 'Expires tomorrow';
  return `Expires in ${days}d`;
}
function daysColor(days) {
  if (days === null || days === undefined) return '#9ca3af';
  if (days < 0) return '#dc2626';
  if (days <= 3) return '#ef4444';
  if (days <= 14) return '#f59e0b';
  return '#10b981';
}

function BillModal({ bill, meta, onClose, onSaved, onDeleted }) {
  const isEdit = !!bill?.id;
  const [f, setF] = useState(bill || {
    title: '', vendor: '', category: '', currency: 'USD', amount: '',
    invoice_date: iso(new Date()), recurrence: 'none', expires_at: '', reminder_days: 7, note: '',
  });
  const [saving, setSaving] = useState(false);
  const set = (k) => (e) => setF((p) => ({ ...p, [k]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    if (!f.title.trim()) return toast.error('Title is required');
    if (f.amount === '' || isNaN(parseFloat(f.amount))) return toast.error('Enter a valid amount');
    if (!f.invoice_date) return toast.error('Invoice date is required');
    if (f.recurrence !== 'none' && !f.expires_at) return toast.error('Recurring invoices need an expiry date for reminders');
    setSaving(true);
    try {
      const payload = {
        title: f.title, vendor: f.vendor || null, category: f.category || null,
        currency: f.currency, amount: parseFloat(f.amount),
        invoice_date: f.invoice_date, recurrence: f.recurrence,
        expires_at: f.expires_at || null,
        reminder_days: parseInt(f.reminder_days) || 7,
        note: f.note || null,
      };
      if (isEdit) await api.put(`/api/bills/${bill.id}`, payload);
      else await api.post('/api/bills', payload);
      toast.success(isEdit ? 'Invoice updated' : 'Invoice added');
      onSaved();
    } catch (err) { toast.error(err?.response?.data?.detail || 'Save failed'); setSaving(false); }
  };
  const del = async () => {
    if (!window.confirm('Delete this invoice?')) return;
    try { await api.delete(`/api/bills/${bill.id}`); toast.success('Deleted'); onDeleted(); }
    catch { toast.error('Delete failed'); }
  };

  return (
    <div className="modal-overlay">
      <div className="modal w-[560px] max-h-[92vh] overflow-y-auto px-7 py-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold">{isEdit ? 'Edit Invoice' : 'New Invoice'}</h2>
          <button onClick={onClose} className="text-2xl text-gray-400">×</button>
        </div>
        <form onSubmit={submit}>
          <label className="label">Invoice name *</label>
          <input className="input mb-3" value={f.title} onChange={set('title')} placeholder="e.g. Hostinger renewal — 2026" autoFocus />

          <div className="mb-3 grid grid-cols-2 gap-3">
            <div>
              <label className="label">Vendor / Site</label>
              <input className="input" value={f.vendor || ''} onChange={set('vendor')} placeholder="Hostinger, Adobe..." />
            </div>
            <div>
              <label className="label">Category</label>
              <input className="input" list="bill-cats" value={f.category || ''} onChange={set('category')} placeholder="Hosting, Domain..." />
              <datalist id="bill-cats">{(meta.categories || []).map((c) => <option key={c} value={c} />)}</datalist>
            </div>
            <div>
              <label className="label">Currency *</label>
              <select className="input" value={f.currency} onChange={set('currency')}>
                {meta.currencies.map((c) => <option key={c} value={c}>{c} — {CUR[c]?.label}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Amount * ({CUR[f.currency]?.symbol})</label>
              <input type="number" step="any" className="input" value={f.amount} onChange={set('amount')} placeholder="0" />
            </div>
            <div>
              <label className="label">Invoice date *</label>
              <input type="date" className="input" value={f.invoice_date} onChange={set('invoice_date')} />
            </div>
            <div>
              <label className="label">Recurrence</label>
              <select className="input" value={f.recurrence} onChange={set('recurrence')}>
                {(meta.recurrences || ['none', 'monthly', 'yearly']).map((r) => <option key={r} value={r}>{REC_LABEL[r] || r}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Expires on {f.recurrence !== 'none' && <span className="text-red-500">*</span>}</label>
              <input type="date" className="input" value={f.expires_at || ''} onChange={set('expires_at')} />
            </div>
            <div>
              <label className="label">Remind (days before)</label>
              <input type="number" min={0} max={365} className="input" value={f.reminder_days} onChange={set('reminder_days')} />
            </div>
          </div>

          <label className="label">Note</label>
          <textarea className="input mb-4 min-h-[70px] resize-y" value={f.note || ''} onChange={set('note')} placeholder="Optional note…" />

          <div className="flex items-center justify-between gap-2">
            <div>{isEdit && <button type="button" onClick={del} className="btn btn-sm border border-red-300 bg-white text-red-600 hover:bg-red-50">🗑 Delete</button>}</div>
            <div className="flex gap-2.5">
              <button type="button" onClick={onClose} className="btn btn-ghost">Cancel</button>
              <button type="submit" disabled={saving} className="btn btn-primary">{saving ? 'Saving…' : isEdit ? 'Save' : 'Add Invoice'}</button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

function CurrencyCard({ cur, total, count }) {
  const c = CUR[cur];
  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5" style={{ borderTop: `3px solid ${c.color}` }}>
      <div className="text-[12px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">{cur} · {c.label}</div>
      <div className="mt-1.5 text-[28px] font-black" style={{ color: c.color }}>{fmtMoney(total, cur)}</div>
      <div className="mt-0.5 text-[12px] text-[var(--text-muted)]">{count} invoice{count === 1 ? '' : 's'} in this period</div>
    </div>
  );
}

function BillsChart({ cur, series }) {
  const c = CUR[cur];
  const data = (series || []).map((s) => ({ ...s, label: s.date.slice(5) }));
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
      <div className="mb-2 text-[13px] font-bold text-[var(--text)]">{cur} invoices over time</div>
      {data.length === 0 ? (
        <div className="flex h-[180px] items-center justify-center text-[12px] text-[var(--text-muted)]">No {cur} invoices in this period</div>
      ) : (
        <ResponsiveContainer width="100%" height={180}>
          <LineChart data={data} margin={{ top: 4, right: 10, left: -12, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
            <XAxis dataKey="label" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} width={52} />
            <Tooltip formatter={(v) => fmtMoney(v, cur)} />
            <Line type="monotone" dataKey="total" stroke={c.color} strokeWidth={2.5} dot={{ r: 3 }} />
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

export default function InvoicesPage() {
  const navigate = useNavigate();
  const today = new Date();
  const [range, setRange] = useState({ from: iso(new Date(today.getFullYear(), today.getMonth(), 1)), to: iso(today) });
  const [meta, setMeta] = useState({ currencies: ['USD', 'SYP'], recurrences: ['none', 'monthly', 'yearly'], categories: [] });
  const [summary, setSummary] = useState(null);
  const [list, setList] = useState([]);
  const [upcoming, setUpcoming] = useState([]);
  const [modal, setModal] = useState(null);

  useEffect(() => { api.get('/api/bills/meta').then((r) => setMeta(r.data)).catch(() => {}); }, []);

  const loadUpcoming = () => api.get('/api/bills/upcoming?within_days=30').then((r) => setUpcoming(r.data)).catch(() => {});
  const load = () => {
    const p = new URLSearchParams({ date_from: range.from, date_to: range.to });
    api.get(`/api/bills/summary?${p.toString()}`).then((r) => setSummary(r.data)).catch(() => {});
    api.get(`/api/bills?${p.toString()}`).then((r) => setList(r.data)).catch(() => {});
    loadUpcoming();
  };
  useEffect(load, [range]); // eslint-disable-line react-hooks/exhaustive-deps

  const quick = (which) => {
    const t = new Date();
    if (which === 'this') setRange({ from: iso(new Date(t.getFullYear(), t.getMonth(), 1)), to: iso(new Date(t.getFullYear(), t.getMonth() + 1, 0)) });
    else if (which === 'last') setRange({ from: iso(new Date(t.getFullYear(), t.getMonth() - 1, 1)), to: iso(new Date(t.getFullYear(), t.getMonth(), 0)) });
    else if (which === 'year') setRange({ from: iso(new Date(t.getFullYear(), 0, 1)), to: iso(new Date(t.getFullYear(), 11, 31)) });
  };

  const totals = summary?.totals || { USD: 0, SYP: 0 };
  const counts = summary?.counts || { USD: 0, SYP: 0 };

  return (
    <div className="min-h-screen bg-page p-6">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <button onClick={() => navigate('/')} className="rounded-md border-[1.5px] border-gray-200 bg-white px-3 py-1.5 text-xs text-gray-600">← Home</button>
        <h1 className="text-[18px] font-black text-[var(--text)]">🧾 Invoices</h1>
        <button onClick={() => setModal({})} className="ml-auto btn btn-primary btn-sm">+ New Invoice</button>
      </div>

      {/* Upcoming renewals alert */}
      {upcoming.length > 0 && (
        <div className="mb-5 overflow-hidden rounded-xl border-2 border-amber-300 bg-amber-50">
          <div className="border-b border-amber-200 bg-amber-100/60 px-4 py-2 text-[12px] font-bold uppercase tracking-wide text-amber-800">
            ⏰ Upcoming renewals ({upcoming.length})
          </div>
          <div className="max-h-56 overflow-y-auto">
            {upcoming.map((b) => (
              <button key={b.id} onClick={() => setModal(b)} className="flex w-full items-center gap-3 border-b border-amber-100 px-4 py-2.5 text-left hover:bg-amber-100/50">
                <span className="text-[11px] font-bold uppercase" style={{ color: daysColor(b.days_left) }}>{daysLabel(b.days_left)}</span>
                <div className="flex-1">
                  <div className="text-[13px] font-semibold text-[var(--text)]">{b.title}{b.vendor && <span className="text-[var(--text-muted)]"> · {b.vendor}</span>}</div>
                  <div className="text-[11px] text-[var(--text-muted)]">Expires {b.expires_at} · {REC_LABEL[b.recurrence]} · {fmtMoney(b.amount, b.currency)}</div>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Period */}
      <div className="mb-5 flex flex-wrap items-end gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
        <div><label className="label">From</label><input type="date" className="input !h-9" value={range.from} onChange={(e) => setRange((r) => ({ ...r, from: e.target.value }))} /></div>
        <div><label className="label">To</label><input type="date" className="input !h-9" value={range.to} onChange={(e) => setRange((r) => ({ ...r, to: e.target.value }))} /></div>
        <div className="flex gap-1.5">
          <button onClick={() => quick('this')} className="btn btn-outline btn-sm">This month</button>
          <button onClick={() => quick('last')} className="btn btn-outline btn-sm">Last month</button>
          <button onClick={() => quick('year')} className="btn btn-outline btn-sm">This year</button>
        </div>
      </div>

      {/* Totals + charts */}
      <div className="mb-5 grid gap-4 sm:grid-cols-2">
        <CurrencyCard cur="USD" total={totals.USD} count={counts.USD} />
        <CurrencyCard cur="SYP" total={totals.SYP} count={counts.SYP} />
      </div>
      <div className="mb-5 grid gap-4 lg:grid-cols-2">
        <BillsChart cur="USD" series={summary?.series?.USD} />
        <BillsChart cur="SYP" series={summary?.series?.SYP} />
      </div>

      {/* List */}
      <div className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)]">
        <div className="border-b border-[var(--border)] px-4 py-3 text-[13px] font-bold uppercase tracking-wide text-[var(--text-muted)]">
          Invoices ({list.length})
        </div>
        {list.length === 0 ? (
          <div className="p-8 text-center text-[13px] text-[var(--text-muted)]">No invoices in this period. Click <b>+ New Invoice</b>.</div>
        ) : (
          <table className="w-full text-[13px]">
            <thead className="bg-[var(--surface-2)] text-[var(--text-muted)]">
              <tr>
                <th className="px-4 py-2 text-left">Date</th>
                <th className="px-4 py-2 text-left">Invoice</th>
                <th className="px-4 py-2 text-left">Recurrence</th>
                <th className="px-4 py-2 text-left">Renews</th>
                <th className="px-4 py-2 text-right">Amount</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {list.map((b) => (
                <tr key={b.id} className="cursor-pointer border-t border-[var(--border)] hover:bg-[var(--surface-2)]" onClick={() => setModal(b)}>
                  <td className="px-4 py-2.5 text-[var(--text-muted)]">{b.invoice_date}</td>
                  <td className="px-4 py-2.5">
                    <div className="font-semibold text-[var(--text)]">{b.title}</div>
                    <div className="text-[11px] text-[var(--text-muted)]">{[b.vendor, b.category].filter(Boolean).join(' · ') || '—'}</div>
                  </td>
                  <td className="px-4 py-2.5">
                    <span className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase" style={{ background: `${REC_COLOR[b.recurrence]}22`, color: REC_COLOR[b.recurrence] }}>{REC_LABEL[b.recurrence]}</span>
                  </td>
                  <td className="px-4 py-2.5 text-[11px]" style={{ color: daysColor(b.days_left) }}>
                    {b.expires_at ? <>{b.expires_at}<br /><span className="text-[10px]">{daysLabel(b.days_left)}</span></> : <span className="text-[var(--text-muted)]">—</span>}
                  </td>
                  <td className="px-4 py-2.5 text-right font-bold" style={{ color: CUR[b.currency]?.color }}>{fmtMoney(b.amount, b.currency)}</td>
                  <td className="px-4 py-2.5 text-right"><span className="rounded-full px-2 py-0.5 text-[10px] font-bold" style={{ background: `${CUR[b.currency]?.color}22`, color: CUR[b.currency]?.color }}>{b.currency}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {modal && (
        <BillModal
          bill={modal.id ? modal : null}
          meta={meta}
          onClose={() => setModal(null)}
          onSaved={() => { setModal(null); load(); }}
          onDeleted={() => { setModal(null); load(); }}
        />
      )}
    </div>
  );
}
