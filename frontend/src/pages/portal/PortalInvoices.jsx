import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import portalApi from '../../portalApi';

const STATUS_BADGE = {
  sent: 'bg-blue-500/15 text-blue-600', partially_paid: 'bg-amber-500/15 text-amber-600',
  paid: 'bg-emerald-500/15 text-emerald-600', void: 'bg-slate-400/15 text-slate-500',
};
const money = (n, c = 'AED') => `${c} ${Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function PortalInvoices() {
  const navigate = useNavigate();
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    portalApi.get('/api/portal/invoices').then(r => setInvoices(r.data)).catch(() => {}).finally(() => setLoading(false));
  }, []);

  return (
    <div>
      <h1 className="mb-[18px] text-[22px] font-extrabold text-ink">Invoices</h1>
      <div className="card overflow-hidden">
        <table className="data-table">
          <thead><tr>{['Invoice #', 'Issue', 'Due', 'Total', 'Balance', 'Status'].map(h => <th key={h} className="th">{h}</th>)}</tr></thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} className="p-10 text-center text-gray-400">Loading...</td></tr>
            ) : invoices.length === 0 ? (
              <tr><td colSpan={6} className="p-10 text-center text-gray-400">No invoices yet.</td></tr>
            ) : invoices.map(inv => (
              <tr key={inv.id} onClick={() => navigate(`/portal/invoices/${inv.id}`)} className="cursor-pointer hover:bg-[#fafbff]">
                <td className="td font-mono font-bold text-navy">{inv.invoice_number}</td>
                <td className="td text-xs text-gray-400">{inv.issue_date || '—'}</td>
                <td className={`td text-xs ${inv.overdue ? 'text-red-500' : 'text-gray-400'}`}>{inv.due_date || '—'}</td>
                <td className="td font-semibold">{money(inv.total, inv.currency)}</td>
                <td className={`td font-semibold ${inv.balance > 0 ? 'text-amber-500' : 'text-emerald-600'}`}>{money(inv.balance, inv.currency)}</td>
                <td className="td"><span className={`badge capitalize ${STATUS_BADGE[inv.status] || ''}`}>{inv.overdue ? 'Overdue' : inv.status.replace('_', ' ')}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
