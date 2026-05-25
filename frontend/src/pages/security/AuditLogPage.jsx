import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../api';
import toast from 'react-hot-toast';

const badgeFor = (t) => {
  if (t.includes('failed') || t.includes('locked')) return 'bg-red-500/15 text-red-500';
  if (t.includes('success') || t.includes('created')) return 'bg-emerald-500/15 text-emerald-600';
  if (t.includes('deactivated') || t.includes('disabled')) return 'bg-amber-500/15 text-amber-600';
  if (t.includes('unlocked') || t.includes('reset') || t.includes('updated')) return 'bg-blue-500/15 text-blue-600';
  return 'bg-slate-400/15 text-slate-500';
};
const pretty = (t) => (t || '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

export default function AuditLogPage() {
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [eventTypes, setEventTypes] = useState([]);
  const [filter, setFilter] = useState('');
  const [loading, setLoading] = useState(true);

  const fetchLog = async () => {
    setLoading(true);
    try {
      const params = { limit: 200 };
      if (filter) params.event_type = filter;
      const { data } = await api.get('/api/security/audit-log', { params });
      setItems(data.items);
      setTotal(data.total);
    } catch (err) {
      toast.error(err.response?.status === 403 ? 'Admin access required' : 'Failed to load audit log');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    api.get('/api/security/audit-log/meta').then(r => setEventTypes(r.data.event_types || [])).catch(() => {});
  }, []);
  useEffect(() => { fetchLog(); }, [filter]);

  return (
    <div className="min-h-screen bg-page p-7">
      <div className="mb-5 flex items-end justify-between">
        <div>
          <button onClick={() => navigate('/settings')} className="mb-2 rounded-md border-[1.5px] border-gray-200 bg-white px-3 py-1.5 text-xs text-gray-600">← Settings</button>
          <h1 className="text-2xl font-extrabold text-ink">Security Audit Log</h1>
          <p className="mt-1 text-[13px] text-gray-400">{total} event{total === 1 ? '' : 's'} recorded</p>
        </div>
        <div className="flex items-center gap-2">
          <select value={filter} onChange={e => setFilter(e.target.value)} className="input max-w-[220px] py-2">
            <option value="">All event types</option>
            {eventTypes.map(t => <option key={t} value={t}>{pretty(t)}</option>)}
          </select>
          <button onClick={fetchLog} className="btn btn-outline">Refresh</button>
        </div>
      </div>

      <div className="card overflow-hidden">
        <table className="data-table">
          <thead><tr>{['Time', 'Event', 'Actor', 'Target', 'IP', 'Detail'].map(h => <th key={h} className="th">{h}</th>)}</tr></thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} className="p-10 text-center text-gray-400">Loading...</td></tr>
            ) : items.length === 0 ? (
              <tr><td colSpan={6} className="p-10 text-center text-gray-400">No events.</td></tr>
            ) : items.map(e => (
              <tr key={e.id}>
                <td className="td whitespace-nowrap text-xs text-gray-500">{e.created_at ? new Date(e.created_at).toLocaleString() : '—'}</td>
                <td className="td"><span className={`badge ${badgeFor(e.event_type)}`}>{pretty(e.event_type)}</span></td>
                <td className="td text-gray-700">{e.actor_label || '—'}</td>
                <td className="td text-xs text-gray-500">{e.target_type ? `${e.target_type} #${e.target_id ?? '?'}` : '—'}</td>
                <td className="td font-mono text-xs text-gray-400">{e.ip_address || '—'}</td>
                <td className="td max-w-[320px] text-xs text-gray-500">{e.detail || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
