import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import portalApi from '../../portalApi';

const money = (n, c = 'AED') => `${c} ${Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function Card({ label, value, color }) {
  return (
    <div className="card min-w-[160px] flex-1 px-5 py-[18px]">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">{label}</div>
      <div className={`mt-1.5 text-[22px] font-extrabold ${color || 'text-ink'}`}>{value}</div>
    </div>
  );
}

export default function PortalDashboard() {
  const navigate = useNavigate();
  const [invoices, setInvoices] = useState([]);
  const [services, setServices] = useState({ services: [], open_tasks: [] });

  useEffect(() => {
    portalApi.get('/api/portal/invoices').then(r => setInvoices(r.data)).catch(() => {});
    portalApi.get('/api/portal/services').then(r => setServices(r.data)).catch(() => {});
  }, []);

  const outstanding = invoices.reduce((s, i) => s + (i.balance || 0), 0);
  const activeServices = services.services.filter(s => s.status === 'active').length;

  return (
    <div>
      <h1 className="mb-[18px] text-2xl font-extrabold text-ink">Welcome</h1>
      <div className="mb-6 flex flex-wrap gap-3">
        <Card label="Outstanding Balance" value={money(outstanding)} color={outstanding > 0 ? 'text-amber-500' : 'text-emerald-600'} />
        <Card label="Open Invoices" value={invoices.filter(i => i.balance > 0).length} />
        <Card label="Active Services" value={activeServices} />
        <Card label="Open Items" value={services.open_tasks.length} />
      </div>

      <div className="card px-5 py-[18px]">
        <div className="mb-3 text-[11px] font-bold uppercase tracking-wide text-gray-400">Recent Invoices</div>
        {invoices.slice(0, 5).length === 0 ? (
          <div className="text-[13px] text-gray-400">No invoices yet.</div>
        ) : invoices.slice(0, 5).map(inv => (
          <div key={inv.id} onClick={() => navigate(`/portal/invoices/${inv.id}`)}
            className="flex cursor-pointer justify-between border-b border-gray-100 py-2.5 text-[13px]">
            <span className="font-mono font-semibold text-navy">{inv.invoice_number}</span>
            <span className="text-gray-400">{inv.due_date}</span>
            <span className="font-semibold">{money(inv.total, inv.currency)}</span>
            <span className={`font-semibold ${inv.balance > 0 ? 'text-amber-500' : 'text-emerald-600'}`}>{inv.balance > 0 ? `${money(inv.balance, inv.currency)} due` : 'Paid'}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
