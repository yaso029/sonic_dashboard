import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../../api';
import toast from 'react-hot-toast';
import usePermissions from '../../hooks/usePermissions';
import PaymentModal from './PaymentModal';

// Data-driven status hues.
const STATUS_COLORS = {
  draft: '#94a3b8', sent: '#3b82f6', partially_paid: '#f59e0b',
  paid: '#10b981', void: '#9ca3af',
};
const money = (n, c = 'AED') => `${c} ${Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function InvoiceDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { can } = usePermissions();
  const [inv, setInv] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showPay, setShowPay] = useState(false);
  const [stripeCfg, setStripeCfg] = useState({ stripe_enabled: false });
  const [busy, setBusy] = useState(false);

  const fetchInv = async () => {
    setLoading(true);
    try {
      const { data } = await api.get(`/api/invoices/${id}`);
      setInv(data);
    } catch {
      toast.error('Invoice not found');
      navigate('/billing');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchInv();
    api.get('/api/billing/config').then(r => setStripeCfg(r.data)).catch(() => {});
  }, [id]);

  const act = async (fn, okMsg) => {
    setBusy(true);
    try { await fn(); if (okMsg) toast.success(okMsg); await fetchInv(); }
    catch (err) { toast.error(err.response?.data?.detail || 'Failed'); }
    finally { setBusy(false); }
  };

  const sendInvoice = () => act(() => api.post(`/api/invoices/${id}/send`), 'Invoice marked as sent');
  const voidInvoice = () => { if (window.confirm('Void this invoice?')) act(() => api.post(`/api/invoices/${id}/void`), 'Invoice voided'); };
  const deleteInvoice = () => { if (window.confirm('Delete this invoice?')) act(async () => { await api.delete(`/api/invoices/${id}`); navigate('/billing'); }); };
  const payByCard = () => act(async () => {
    const { data } = await api.post(`/api/invoices/${id}/payment-intent`);
    toast.success('Stripe PaymentIntent created — collect card, then Sync.');
    console.info('Stripe client_secret:', data.client_secret);
  });
  const syncStripe = () => act(async () => {
    const { data } = await api.post(`/api/invoices/${id}/sync-stripe`);
    toast.success(`Stripe status: ${data.status}`);
  });

  if (loading || !inv) return <div className="p-10 text-[var(--text-muted)]">Loading...</div>;

  const canPay = inv.status !== 'draft' && inv.status !== 'void' && inv.balance > 0;

  return (
    <div className="min-h-screen bg-page p-7 dark:bg-surface-dark">
      <button onClick={() => navigate('/billing')} className="btn btn-ghost btn-sm mb-3">← All Invoices</button>

      <div className="card mb-5 px-7 py-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="font-mono text-[22px] font-extrabold text-[var(--text)]">{inv.invoice_number}</h1>
            <div className="mt-2 text-sm font-semibold text-[var(--text)]">{inv.client_name}</div>
            {inv.client_trn && <div className="text-xs text-[var(--text-muted)]">TRN: <code>{inv.client_trn}</code></div>}
            <div className="mt-2 flex items-center gap-2.5">
              <span className="badge capitalize" style={{ background: `${STATUS_COLORS[inv.status]}20`, color: STATUS_COLORS[inv.status] }}>
                {inv.overdue ? 'Overdue' : inv.status.replace('_', ' ')}
              </span>
              <span className="text-xs text-[var(--text-muted)]">Issued {inv.issue_date || '—'} · Due {inv.due_date || '—'}</span>
            </div>
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            {inv.status === 'draft' && can('invoices', 'update') && (
              <button onClick={sendInvoice} disabled={busy} className="btn btn-primary btn-sm">Mark as Sent</button>
            )}
            {canPay && can('invoices', 'update') && (
              <button onClick={() => setShowPay(true)} disabled={busy} className="btn btn-accent btn-sm">Record Payment</button>
            )}
            {canPay && can('invoices', 'update') && stripeCfg.stripe_enabled && (
              <>
                <button onClick={payByCard} disabled={busy} className="btn btn-outline btn-sm">Pay by Card (Stripe)</button>
                {inv.stripe_payment_intent_id && <button onClick={syncStripe} disabled={busy} className="btn btn-outline btn-sm">Sync Stripe</button>}
              </>
            )}
            {inv.status !== 'void' && inv.amount_paid === 0 && can('invoices', 'update') && (
              <button onClick={voidInvoice} disabled={busy} className="btn btn-danger btn-sm">Void</button>
            )}
            {(inv.status === 'draft' || inv.status === 'void') && can('invoices', 'delete') && (
              <button onClick={deleteInvoice} disabled={busy} className="btn btn-danger btn-sm">Delete</button>
            )}
          </div>
        </div>
      </div>

      {/* Line items */}
      <div className="card mb-5 overflow-hidden">
        <table className="data-table">
          <thead>
            <tr>
              {['Description', 'Qty', 'Unit Price', 'Total'].map(h => (
                <th key={h} className={`th ${h === 'Description' ? '' : 'text-right'}`}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {inv.line_items.map(li => (
              <tr key={li.id}>
                <td className="td text-[var(--text)]">{li.description}</td>
                <td className="td text-right text-[var(--text-muted)]">{li.quantity}</td>
                <td className="td text-right text-[var(--text-muted)]">{money(li.unit_price, inv.currency)}</td>
                <td className="td text-right font-semibold text-[var(--text)]">{money(li.line_total, inv.currency)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="flex justify-end p-4">
          <div className="w-[260px] text-[13px]">
            <Row label="Subtotal" value={money(inv.subtotal, inv.currency)} />
            <Row label={`VAT (${inv.vat_rate}%)`} value={money(inv.vat_amount, inv.currency)} />
            <Row label="Total" value={money(inv.total, inv.currency)} bold />
            <Row label="Paid" value={money(inv.amount_paid, inv.currency)} className="text-emerald-600 dark:text-emerald-400" />
            <Row label="Balance" value={money(inv.balance, inv.currency)} bold className={inv.balance > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400'} />
          </div>
        </div>
      </div>

      {/* Payments */}
      <div className="card px-5 py-5">
        <div className="mb-3 text-[11px] font-bold uppercase tracking-wide text-[var(--text-muted)]">Payments</div>
        {inv.payments.length === 0 ? (
          <div className="text-[13px] text-[var(--text-muted)]">No payments recorded yet.</div>
        ) : inv.payments.map(p => (
          <div key={p.id} className="flex justify-between border-b border-[var(--border)] py-2 text-[13px] last:border-0">
            <span className="text-[var(--text-muted)]">{p.paid_at} · {p.method.replace('_', ' ')}{p.reference ? ` · ${p.reference}` : ''}{p.recorded_by_name ? ` · ${p.recorded_by_name}` : ''}</span>
            <span className="font-semibold text-emerald-600 dark:text-emerald-400">{money(p.amount, inv.currency)}</span>
          </div>
        ))}
      </div>

      {inv.notes && (
        <div className="card mt-4 px-4 py-3 text-[13px] text-[var(--text-muted)]">{inv.notes}</div>
      )}

      {showPay && (
        <PaymentModal invoice={inv} onClose={() => setShowPay(false)} onSaved={() => { setShowPay(false); fetchInv(); }} />
      )}
    </div>
  );
}

function Row({ label, value, bold, className = '' }) {
  return (
    <div className={`flex justify-between py-0.5 ${bold ? 'font-extrabold text-[var(--text)]' : 'text-[var(--text-muted)]'} ${className}`}>
      <span>{label}</span><span>{value}</span>
    </div>
  );
}
