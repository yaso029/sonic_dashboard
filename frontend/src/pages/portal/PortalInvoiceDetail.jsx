import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import portalApi from '../../portalApi';
import toast from 'react-hot-toast';

const money = (n, c = 'AED') => `${c} ${Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function Row({ label, value, bold, color }) {
  return (
    <div className={`flex justify-between py-0.5 ${color || (bold ? 'text-navy' : 'text-gray-600')} ${bold ? 'font-extrabold' : ''}`}>
      <span>{label}</span><span>{value}</span>
    </div>
  );
}

export default function PortalInvoiceDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [inv, setInv] = useState(null);
  const [stripeEnabled, setStripeEnabled] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    portalApi.get(`/api/portal/invoices/${id}`).then(r => setInv(r.data)).catch(() => navigate('/portal/invoices'));
    portalApi.get('/api/portal/billing/config').then(r => setStripeEnabled(r.data.stripe_enabled)).catch(() => {});
  }, [id]);

  const payNow = async () => {
    setBusy(true);
    try {
      const { data } = await portalApi.post(`/api/portal/invoices/${id}/payment-intent`);
      console.info('client_secret', data.client_secret);
      toast.success('Payment initiated — your marketing_specialist will confirm once settled.');
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Could not start payment');
    } finally {
      setBusy(false);
    }
  };

  if (!inv) return <div className="text-gray-400">Loading...</div>;

  return (
    <div>
      <button onClick={() => navigate('/portal/invoices')} className="mb-3 rounded-md border-[1.5px] border-gray-200 bg-white px-3 py-1.5 text-xs text-gray-600">← Invoices</button>

      <div className="card mb-[18px] px-6 py-[22px]">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="font-mono text-xl font-extrabold text-ink">{inv.invoice_number}</h1>
            <div className="mt-1.5 text-xs text-gray-400">Issued {inv.issue_date || '—'} · Due {inv.due_date || '—'}</div>
          </div>
          {stripeEnabled && inv.balance > 0 && inv.status !== 'void' && (
            <button onClick={payNow} disabled={busy} className="rounded-lg bg-[#635bff] px-5 py-2.5 text-sm font-bold text-white disabled:opacity-50">
              Pay {money(inv.balance, inv.currency)}
            </button>
          )}
        </div>
      </div>

      <div className="card mb-[18px] overflow-hidden">
        <table className="data-table">
          <thead><tr>{['Description', 'Qty', 'Unit Price', 'Total'].map(h => <th key={h} className={`th ${h === 'Description' ? '' : 'text-right'}`}>{h}</th>)}</tr></thead>
          <tbody>
            {inv.line_items.map(li => (
              <tr key={li.id}>
                <td className="td">{li.description}</td>
                <td className="td text-right text-gray-600">{li.quantity}</td>
                <td className="td text-right text-gray-600">{money(li.unit_price, inv.currency)}</td>
                <td className="td text-right font-semibold">{money(li.line_total, inv.currency)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="flex justify-end px-4 py-3.5">
          <div className="w-[260px] text-[13px]">
            <Row label="Subtotal" value={money(inv.subtotal, inv.currency)} />
            <Row label={`VAT (${inv.vat_rate}%)`} value={money(inv.vat_amount, inv.currency)} />
            <Row label="Total" value={money(inv.total, inv.currency)} bold />
            <Row label="Paid" value={money(inv.amount_paid, inv.currency)} color="text-emerald-600" />
            <Row label="Balance" value={money(inv.balance, inv.currency)} bold color={inv.balance > 0 ? 'text-amber-500' : 'text-emerald-600'} />
          </div>
        </div>
      </div>
    </div>
  );
}
