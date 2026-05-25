import { useEffect, useState } from 'react';
import api from '../../api';
import toast from 'react-hot-toast';

// Data-driven badge hues (per commission status).
const STATUS_COLORS = { pending: '#f59e0b', closed: '#3b82f6', paid: '#10b981' };

function CommissionModal({ commission, partners, onClose, onSaved }) {
  const isEdit = !!commission;
  const [form, setForm] = useState(commission ? {
    partner_id: commission.partner_id,
    referred_client_name: commission.referred_client_name || '',
    deal_value: commission.deal_value || 0,
    commission_rate: commission.commission_rate || 0.5,
    notes: commission.notes || '',
    status: commission.status || 'pending',
  } : {
    partner_id: '', referred_client_name: '', deal_value: 0, commission_rate: 0.5, notes: '', status: 'pending',
  });
  const [loading, setLoading] = useState(false);
  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }));
  const estimated = ((parseFloat(form.deal_value) || 0) * (parseFloat(form.commission_rate) || 0) / 100).toLocaleString();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (isEdit) {
        await api.put(`/api/commissions/${commission.id}`, form);
      } else {
        await api.post('/api/commissions', { ...form, partner_id: parseInt(form.partner_id) });
      }
      toast.success(isEdit ? 'Updated' : 'Commission created');
      onSaved();
      onClose();
    } catch (err) { toast.error(err.response?.data?.detail || 'Failed'); }
    finally { setLoading(false); }
  };

  return (
    <div className="modal-overlay">
      <div className="modal w-[480px] p-7">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-lg font-bold text-[var(--text)]">{isEdit ? 'Edit Commission' : 'Add Commission'}</h2>
          <button onClick={onClose} className="text-xl text-[var(--text-muted)] hover:text-[var(--text)]">×</button>
        </div>
        <form onSubmit={handleSubmit}>
          <label className="label">Partner *</label>
          <select className="input mb-3" value={form.partner_id} onChange={set('partner_id')} required>
            <option value="">Select partner...</option>
            {partners.map(p => <option key={p.id} value={p.id}>{p.full_name}</option>)}
          </select>
          <label className="label">Referred Client Name</label>
          <input className="input mb-3" value={form.referred_client_name} onChange={set('referred_client_name')} />
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Deal Value (AED)</label>
              <input className="input mb-3" type="number" value={form.deal_value} onChange={set('deal_value')} />
            </div>
            <div>
              <label className="label">Commission Rate (%)</label>
              <input className="input mb-3" type="number" step="0.01" value={form.commission_rate} onChange={set('commission_rate')} />
            </div>
          </div>
          <div className="mb-3 rounded-lg bg-amber-500/15 px-3.5 py-2.5 text-[13px] font-bold text-amber-700 dark:text-amber-300">
            Estimated Commission: AED {estimated}
          </div>
          <label className="label">Status</label>
          <select className="input mb-3" value={form.status} onChange={set('status')}>
            <option value="pending">Pending</option>
            <option value="closed">Closed</option>
            <option value="paid">Paid</option>
          </select>
          <label className="label">Notes</label>
          <textarea className="input mb-3 min-h-[60px] resize-y" value={form.notes} onChange={set('notes')} />
          <div className="mt-1 flex justify-end gap-2.5">
            <button type="button" onClick={onClose} className="btn btn-ghost">Cancel</button>
            <button type="submit" disabled={loading} className="btn btn-primary">
              {loading ? 'Saving...' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function Commissions() {
  const [commissions, setCommissions] = useState([]);
  const [partners, setPartners] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null);

  const fetchAll = async () => {
    setLoading(true);
    try {
      const [c, p] = await Promise.all([
        api.get('/api/commissions').then(r => r.data),
        api.get('/api/partners').then(r => r.data),
      ]);
      setCommissions(c);
      setPartners(p);
    } catch { toast.error('Failed to load'); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchAll(); }, []);

  const markPaid = async (id) => {
    try {
      await api.put(`/api/commissions/${id}/paid`);
      toast.success('Marked as paid');
      fetchAll();
    } catch { toast.error('Failed'); }
  };

  const totalOwed = commissions.filter(c => c.status !== 'paid').reduce((s, c) => s + (c.commission_amount || 0), 0);
  const totalPaid = commissions.filter(c => c.status === 'paid').reduce((s, c) => s + (c.commission_amount || 0), 0);
  const now = new Date();
  const thisMonth = commissions.filter(c => {
    const d = new Date(c.created_at);
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  }).reduce((s, c) => s + (c.commission_amount || 0), 0);

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="page-title">Commission Tracker</h1>
        <button onClick={() => setModal('add')} className="btn btn-primary">
          + Add Commission
        </button>
      </div>

      {/* Summary */}
      <div className="mb-7 grid grid-cols-3 gap-4">
        {[
          { label: 'Total Owed', value: `AED ${totalOwed.toLocaleString()}`, tone: 'border-t-amber-500 text-amber-600 dark:text-amber-400' },
          { label: 'Total Paid', value: `AED ${totalPaid.toLocaleString()}`, tone: 'border-t-emerald-500 text-emerald-600 dark:text-emerald-400' },
          { label: 'This Month', value: `AED ${thisMonth.toLocaleString()}`, tone: 'border-t-primary text-primary dark:border-t-accent-light dark:text-accent-light' },
        ].map(s => (
          <div key={s.label} className={`stat-card border-t-[4px] ${s.tone}`}>
            <div className="stat-label">{s.label}</div>
            <div className="text-[22px] font-extrabold">{s.value}</div>
          </div>
        ))}
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        <table className="data-table">
          <thead>
            <tr>
              {['Partner', 'Client', 'Deal Value', 'Rate', 'Commission', 'Status', 'Paid On', 'Actions'].map(h => (
                <th key={h} className="th">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={8} className="td p-10 text-center text-[var(--text-muted)]">Loading...</td></tr>
            ) : commissions.length === 0 ? (
              <tr><td colSpan={8} className="td p-10 text-center text-[var(--text-muted)]">No commissions yet</td></tr>
            ) : commissions.map(c => (
              <tr key={c.id}>
                <td className="td font-semibold text-[var(--text)]">{c.partner_name}</td>
                <td className="td text-[var(--text-muted)]">{c.referred_client_name || '—'}</td>
                <td className="td text-[var(--text-muted)]">
                  {c.deal_value ? `AED ${Number(c.deal_value).toLocaleString()}` : '—'}
                </td>
                <td className="td text-[var(--text-muted)]">{c.commission_rate}%</td>
                <td className="td font-bold text-accent">
                  AED {Number(c.commission_amount).toLocaleString()}
                </td>
                <td className="td">
                  <span className="badge capitalize" style={{ background: `${STATUS_COLORS[c.status]}20`, color: STATUS_COLORS[c.status] }}>
                    {c.status}
                  </span>
                </td>
                <td className="td text-xs text-[var(--text-muted)]/70">
                  {c.paid_at ? new Date(c.paid_at).toLocaleDateString() : '—'}
                </td>
                <td className="td">
                  <div className="flex gap-1.5">
                    <button onClick={() => setModal(c)} className="btn btn-outline btn-sm">Edit</button>
                    {c.status !== 'paid' && (
                      <button onClick={() => markPaid(c.id)} className="btn btn-accent btn-sm">Mark Paid</button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modal && (
        <CommissionModal
          commission={modal === 'add' ? null : modal}
          partners={partners}
          onClose={() => setModal(null)}
          onSaved={fetchAll}
        />
      )}
    </div>
  );
}
