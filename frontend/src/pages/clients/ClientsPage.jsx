import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../api';
import toast from 'react-hot-toast';
import { useAuth } from '../../AuthContext';
import usePermissions from '../../hooks/usePermissions';
import ClientFormModal from './ClientFormModal';

const STATUS_BADGE = {
  active: 'bg-emerald-500/15 text-emerald-600',
  paused: 'bg-amber-500/15 text-amber-600',
  archived: 'bg-slate-400/15 text-slate-500',
};

export default function ClientsPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { can } = usePermissions();
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [showAdd, setShowAdd] = useState(false);

  const fetchClients = async () => {
    setLoading(true);
    try {
      const params = {};
      if (statusFilter) params.status = statusFilter;
      if (search) params.search = search;
      const { data } = await api.get('/api/clients', { params });
      setClients(data);
    } catch {
      toast.error('Failed to load clients');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchClients(); }, [statusFilter]);
  useEffect(() => {
    const t = setTimeout(fetchClients, 300);
    return () => clearTimeout(t);
  }, [search]);

  return (
    <div className="min-h-screen bg-page p-7">
      <div className="mb-5 flex items-center justify-between">
        <div>
          <button onClick={() => navigate('/')} className="mb-2 rounded-md border-[1.5px] border-gray-200 bg-white px-3 py-1.5 text-xs text-gray-600">← Home</button>
          <h1 className="text-2xl font-extrabold text-ink">Clients</h1>
          <p className="mt-1 text-[13px] text-gray-400">{clients.length} client{clients.length === 1 ? '' : 's'}</p>
        </div>
        {can('clients', 'create') && (
          <button onClick={() => setShowAdd(true)} className="btn btn-primary">+ Add Client</button>
        )}
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search company, TRN, contact, email..."
          className="input min-w-[200px] flex-1"
        />
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="input min-w-[140px] max-w-[160px]">
          <option value="">All Statuses</option>
          <option value="active">Active</option>
          <option value="paused">Paused</option>
          <option value="archived">Archived</option>
        </select>
      </div>

      <div className="card overflow-hidden">
        <table className="data-table">
          <thead>
            <tr>
              {['Company', 'Contact', 'TRN', 'Emirate', 'Form', 'Services', 'Open Tasks', 'Status', 'Assigned'].map(h => (
                <th key={h} className="th">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={9} className="p-10 text-center text-gray-400">Loading...</td></tr>
            ) : clients.length === 0 ? (
              <tr><td colSpan={9} className="p-10 text-center text-gray-400">
                {can('clients', 'create') ? 'No clients yet. Click "+ Add Client" or convert a Lead.' : 'No clients to display.'}
              </td></tr>
            ) : clients.map(c => (
              <tr key={c.id} onClick={() => navigate(`/clients/${c.id}`)} className="cursor-pointer hover:bg-[#fafbff]">
                <td className="td">
                  <div className="text-[13px] font-semibold text-ink">{c.company_name}</div>
                  {c.industry && <div className="mt-0.5 text-[11px] text-gray-400">{c.industry}</div>}
                </td>
                <td className="td text-gray-600">
                  {c.primary_contact_name || '—'}
                  {c.primary_phone && <div className="mt-0.5 text-[11px] text-gray-400">{c.primary_phone}</div>}
                </td>
                <td className="td font-mono text-xs text-gray-600">{c.trn || '—'}</td>
                <td className="td text-gray-600">{c.trade_license_emirate || '—'}</td>
                <td className="td text-xs uppercase text-gray-600">{c.legal_form || '—'}</td>
                <td className="td">
                  <span className="rounded-full bg-blue-50 px-2.5 py-0.5 text-[11px] font-semibold text-navy">{c.service_count}</span>
                </td>
                <td className="td">
                  {c.open_task_count > 0
                    ? <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-[11px] font-semibold text-amber-700">{c.open_task_count} open</span>
                    : '—'}
                </td>
                <td className="td">
                  <span className={`badge capitalize ${STATUS_BADGE[c.status] || 'bg-gray-100 text-gray-500'}`}>{c.status}</span>
                </td>
                <td className="td text-xs text-gray-400">{c.assigned_accountant_name || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showAdd && (
        <ClientFormModal
          onClose={() => setShowAdd(false)}
          onSaved={(created) => { setShowAdd(false); fetchClients(); navigate(`/clients/${created.id}`); }}
        />
      )}
    </div>
  );
}
