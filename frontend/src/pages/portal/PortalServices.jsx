import { useEffect, useState } from 'react';
import portalApi from '../../portalApi';

const STATUS_BADGE = {
  active: 'bg-emerald-500/15 text-emerald-600', paused: 'bg-amber-500/15 text-amber-600',
  completed: 'bg-blue-500/15 text-blue-600', cancelled: 'bg-red-500/15 text-red-500',
  todo: 'bg-slate-500/15 text-slate-500', in_progress: 'bg-blue-500/15 text-blue-600', blocked: 'bg-red-500/15 text-red-500',
};
const pretty = (c) => (c || '').replace(/_/g, ' ').replace(/\b\w/g, ch => ch.toUpperCase());

export default function PortalServices() {
  const [data, setData] = useState({ services: [], open_tasks: [] });

  useEffect(() => {
    portalApi.get('/api/portal/services').then(r => setData(r.data)).catch(() => {});
  }, []);

  return (
    <div>
      <h1 className="mb-[18px] text-[22px] font-extrabold text-ink">Your Services</h1>

      <div className="card mb-6 overflow-hidden">
        <table className="data-table">
          <thead><tr>{['Service', 'Recurrence', 'Status', 'Started'].map(h => <th key={h} className="th">{h}</th>)}</tr></thead>
          <tbody>
            {data.services.length === 0 ? (
              <tr><td colSpan={4} className="p-10 text-center text-gray-400">No services on record.</td></tr>
            ) : data.services.map(s => (
              <tr key={s.id}>
                <td className="td font-semibold text-ink">{pretty(s.service_type)}</td>
                <td className="td capitalize text-gray-600">{(s.recurrence || '').replace('_', ' ')}</td>
                <td className="td"><span className={`badge capitalize ${STATUS_BADGE[s.status] || ''}`}>{s.status}</span></td>
                <td className="td text-xs text-gray-400">{s.start_date || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2 className="mb-3 text-[15px] font-bold text-ink">Open Items</h2>
      <div className="card px-5 py-2">
        {data.open_tasks.length === 0 ? (
          <div className="py-3.5 text-[13px] text-gray-400">Nothing outstanding — you're all caught up.</div>
        ) : data.open_tasks.map(t => (
          <div key={t.id} className="flex justify-between border-b border-gray-100 py-2.5 text-[13px]">
            <span className="text-ink">{t.title}</span>
            <span className="flex items-center gap-3.5">
              {t.due_date && <span className="text-xs text-gray-400">Due {t.due_date}</span>}
              <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold capitalize ${STATUS_BADGE[t.status] || 'bg-slate-500/15 text-slate-500'}`}>{(t.status || '').replace('_', ' ')}</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
