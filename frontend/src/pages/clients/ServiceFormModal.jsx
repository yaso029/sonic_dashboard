import { useEffect, useState } from 'react';
import api from '../../api';
import toast from 'react-hot-toast';

export default function ServiceFormModal({ clientId, onClose, onSaved }) {
  const [catalog, setCatalog] = useState([]);
  const [users, setUsers] = useState([]);
  const [form, setForm] = useState({
    service_type: '',
    status: 'active',
    recurrence: 'one_time',
    assigned_to: '',
    start_date: new Date().toISOString().slice(0, 10),
    end_date: '',
    fee_amount: 0,
    fee_currency: 'AED',
    notes: '',
  });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api.get('/api/services/catalog').then(r => setCatalog(r.data.services)).catch(() => {});
    api.get('/api/users').then(r => setUsers(r.data.filter(u => u.is_active))).catch(() => {});
  }, []);

  const onServiceTypeChange = (e) => {
    const type = e.target.value;
    const def = catalog.find(c => c.key === type);
    setForm(f => ({
      ...f,
      service_type: type,
      recurrence: def?.default_recurrence || 'one_time',
      fee_amount: def?.typical_fee_aed || 0,
    }));
  };

  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.service_type) { toast.error('Select a service type'); return; }
    setLoading(true);
    try {
      const payload = {
        ...form,
        client_id: clientId,
        assigned_to: form.assigned_to ? parseInt(form.assigned_to) : null,
        fee_amount: parseFloat(form.fee_amount) || 0,
      };
      const { data } = await api.post('/api/services', payload);
      toast.success('Service created');
      onSaved(data);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal w-[520px] px-8 py-7">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-lg font-bold">New Service</h2>
          <button onClick={onClose} className="text-2xl text-gray-400">×</button>
        </div>
        <form onSubmit={handleSubmit}>
          <label className="label">Service Type *</label>
          <select className="input mb-3" value={form.service_type} onChange={onServiceTypeChange} required>
            <option value="">Select...</option>
            {catalog.map(c => (
              <option key={c.key} value={c.key}>{c.label} ({c.default_recurrence}, AED {c.typical_fee_aed})</option>
            ))}
          </select>

          <div className="mb-3 grid grid-cols-2 gap-3">
            <div>
              <label className="label">Recurrence</label>
              <select className="input" value={form.recurrence} onChange={set('recurrence')}>
                <option value="one_time">One Time</option>
                <option value="monthly">Monthly</option>
                <option value="quarterly">Quarterly</option>
                <option value="annual">Annual</option>
              </select>
            </div>
            <div>
              <label className="label">Status</label>
              <select className="input" value={form.status} onChange={set('status')}>
                <option value="active">Active</option>
                <option value="paused">Paused</option>
                <option value="completed">Completed</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>
            <div>
              <label className="label">Start Date</label>
              <input className="input" type="date" value={form.start_date} onChange={set('start_date')} />
            </div>
            <div>
              <label className="label">End Date</label>
              <input className="input" type="date" value={form.end_date || ''} onChange={set('end_date')} />
            </div>
            <div>
              <label className="label">Fee Amount</label>
              <input className="input" type="number" step="0.01" value={form.fee_amount} onChange={set('fee_amount')} />
            </div>
            <div>
              <label className="label">Currency</label>
              <select className="input" value={form.fee_currency} onChange={set('fee_currency')}>
                <option value="AED">AED</option>
                <option value="USD">USD</option>
                <option value="EUR">EUR</option>
                <option value="GBP">GBP</option>
              </select>
            </div>
            <div className="col-span-2">
              <label className="label">Assigned To</label>
              <select className="input" value={form.assigned_to} onChange={set('assigned_to')}>
                <option value="">Me</option>
                {users.map(u => <option key={u.id} value={u.id}>{u.full_name}</option>)}
              </select>
            </div>
            <div className="col-span-2">
              <label className="label">Notes</label>
              <textarea className="input min-h-[60px] resize-y" value={form.notes} onChange={set('notes')} />
            </div>
          </div>

          <div className="flex justify-end gap-2.5">
            <button type="button" onClick={onClose} className="btn btn-ghost">Cancel</button>
            <button type="submit" disabled={loading} className="btn btn-primary">
              {loading ? 'Saving...' : 'Create Service'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
