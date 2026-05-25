import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../api';
import toast from 'react-hot-toast';
import usePermissions from '../../hooks/usePermissions';
import InvoiceFormModal from './InvoiceFormModal';

// Data-driven status hues.
const STATUS_COLORS = {
  draft: '#94a3b8', sent: '#3b82f6', partially_paid: '#f59e0b',
  paid: '#10b981', void: '#9ca3af',
};

const money = (n, c = 'AED') => `${c} ${Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function StatCard({ label, value, valueClass = 'text-[var(--text)]' }) {
  return (
    <div className="stat-card min-w-[150px] flex-1">
      <div className="stat-label">{label}</div>
      <div className={`mt-1 text-xl font-extrabold ${valueClass}`}>{value}</div>
    </div>
  );
}

export default function InvoicesPage() {
  const navigate = useNavigate();
  const { can } = usePermissions();
  const [invoices, setInvoices] = useState([]);
  const [reports, setReports] = useState(null);
  const [statusFilter, setStatusFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);

  const fetchAll = async () => {
    setLoading(true);
    try {
      const params = {};
      if (statusFilter) params.status = statusFilter;
      const [inv, rep] = await Promise.all([
        api.get('/api/invoices', { params }).then(r => r.data),
        api.get('/api/billing/reports').then(r => r.data).catch(() => null),
      ]);
      setInvoices(inv);
      setReports(rep);
    } catch {
      toast.error('Failed to load invoices');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchAll(); }, [statusFilter]);

  const generateDue = async () => {
    try {
      const { data } = await api.post('/api/subscriptions/generate-due');
      toast.success(`Generated ${data.generated} invoice(s) from due subscriptions`);
      fetchAll();
    } catch (err) { toast.error(err.response?.data?.detail || 'Failed'); }
  };

  return (
    <div className="min-h-screen bg-page p-7 dark:bg-surface-dark">
      <div className="mb-5 flex items-center justify-between">
        <div>
          <button onClick={() => navigate('/')} className="btn btn-ghost btn-sm mb-2">← Home</button>
          <h1 className="page-title">Billing</h1>
          <p className="page-subtitle">{invoices.length} invoice{invoices.length === 1 ? '' : 's'}</p>
        </div>
        <div className="flex gap-2">
          {can('invoices', 'create') && (
            <button onClick={generateDue} className="btn btn-outline">Generate Due Retainers</button>
          )}
          {can('invoices', 'create') && (
            <button onClick={() => setShowCreate(true)} className="btn btn-primary">+ New Invoice</button>
          )}
        </div>
      </div>

      {reports && (
        <div className="mb-5 flex flex-wrap gap-3">
          <StatCard label="Invoiced" value={money(reports.total_invoiced)} />
          <StatCard label="Collected" value={money(reports.total_collected)} valueClass="text-emerald-600 dark:text-emerald-400" />
          <StatCard label="Outstanding" value={money(reports.total_outstanding)} valueClass="text-amber-600 dark:text-amber-400" />
          <StatCard label="Overdue" value={money(reports.overdue_amount)} valueClass="text-red-600 dark:text-red-400" />
          <StatCard label="VAT Collected" value={money(reports.vat_collected)} />
        </div>
      )}

      {reports && reports.total_outstanding > 0 && (
        <div className="card mb-5 px-5 py-4">
          <div className="mb-2.5 text-[11px] font-bold uppercase tracking-wide text-[var(--text-muted)]">Accounts Receivable Aging</div>
          <div className="flex flex-wrap gap-5">
            {[['Current', 'current'], ['1–30d', '1_30'], ['31–60d', '31_60'], ['61–90d', '61_90'], ['90d+', '90_plus']].map(([lbl, k]) => (
              <div key={k}>
                <div className="text-[11px] text-[var(--text-muted)]">{lbl}</div>
                <div className={`text-sm font-bold ${k === '90_plus' ? 'text-red-600 dark:text-red-400' : 'text-[var(--text)]'}`}>{money(reports.aging[k])}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="mb-4 flex gap-2">
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="input min-w-[160px] max-w-[200px]">
          <option value="">All Statuses</option>
          <option value="draft">Draft</option>
          <option value="sent">Sent</option>
          <option value="partially_paid">Partially Paid</option>
          <option value="paid">Paid</option>
          <option value="void">Void</option>
        </select>
      </div>

      <div className="card overflow-hidden">
        <table className="data-table">
          <thead>
            <tr>
              {['Invoice #', 'Client', 'Issue', 'Due', 'Total', 'Balance', 'Status'].map(h => (
                <th key={h} className="th">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} className="td p-10 text-center text-[var(--text-muted)]">Loading...</td></tr>
            ) : invoices.length === 0 ? (
              <tr><td colSpan={7} className="td p-10 text-center text-[var(--text-muted)]">No invoices yet.</td></tr>
            ) : invoices.map(inv => (
              <tr key={inv.id} onClick={() => navigate(`/billing/${inv.id}`)} className="cursor-pointer">
                <td className="td font-mono font-bold text-accent">{inv.invoice_number}</td>
                <td className="td text-[var(--text)]">{inv.client_name}</td>
                <td className="td text-xs text-[var(--text-muted)]">{inv.issue_date || '—'}</td>
                <td className={`td text-xs ${inv.overdue ? 'text-red-600 dark:text-red-400' : 'text-[var(--text-muted)]'}`}>{inv.due_date || '—'}</td>
                <td className="td font-semibold text-[var(--text)]">{money(inv.total, inv.currency)}</td>
                <td className={`td font-semibold ${inv.balance > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400'}`}>{money(inv.balance, inv.currency)}</td>
                <td className="td">
                  <span className="badge capitalize" style={{ background: `${STATUS_COLORS[inv.status]}20`, color: STATUS_COLORS[inv.status] }}>
                    {inv.overdue ? 'Overdue' : inv.status.replace('_', ' ')}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showCreate && (
        <InvoiceFormModal
          onClose={() => setShowCreate(false)}
          onSaved={(created) => { setShowCreate(false); navigate(`/billing/${created.id}`); }}
        />
      )}
    </div>
  );
}
