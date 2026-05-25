import { useEffect, useState } from 'react';
import api from '../../api';
import toast from 'react-hot-toast';

export default function ClientFormModal({ client, leadPrefill, onClose, onSaved }) {
  const isEdit = !!client;
  const [meta, setMeta] = useState({ legal_forms: [], emirates: [], statuses: [] });
  const [users, setUsers] = useState([]);
  const [form, setForm] = useState(client || {
    company_name: leadPrefill?.company || '',
    primary_contact_name: leadPrefill?.full_name || '',
    primary_email: leadPrefill?.email || '',
    primary_phone: leadPrefill?.phone || '',
    trn: '',
    ct_registration_number: '',
    trade_license_number: '',
    trade_license_emirate: '',
    legal_form: '',
    industry: '',
    fiscal_year_end_month: 12,
    fiscal_year_end_day: 31,
    esr_applicable: false,
    assigned_accountant_id: '',
    notes: '',
  });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api.get('/api/clients/meta').then(r => setMeta(r.data)).catch(() => {});
    api.get('/api/users').then(r => setUsers(r.data.filter(u => u.is_active))).catch(() => {});
  }, []);

  const set = k => e => setForm(f => ({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const payload = {
        ...form,
        fiscal_year_end_month: parseInt(form.fiscal_year_end_month) || 12,
        fiscal_year_end_day: parseInt(form.fiscal_year_end_day) || 31,
        assigned_accountant_id: form.assigned_accountant_id ? parseInt(form.assigned_accountant_id) : null,
      };
      let data;
      if (isEdit) {
        data = (await api.put(`/api/clients/${client.id}`, payload)).data;
        toast.success('Client updated');
      } else {
        data = (await api.post('/api/clients', payload)).data;
        toast.success('Client created');
      }
      onSaved(data);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to save client');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal w-[600px] max-h-[90vh] overflow-y-auto px-8 py-7">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-lg font-bold">{isEdit ? 'Edit Client' : 'New Client'}</h2>
          <button onClick={onClose} className="text-2xl text-gray-400">×</button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="field-section mt-1">COMPANY</div>
          <div className="mb-4 grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="label">Company Name *</label>
              <input className="input" value={form.company_name} onChange={set('company_name')} required />
            </div>
            <div>
              <label className="label">Industry</label>
              <input className="input" value={form.industry || ''} onChange={set('industry')} placeholder="e.g. Trading, F&B, Consultancy" />
            </div>
            <div>
              <label className="label">Legal Form</label>
              <select className="input" value={form.legal_form || ''} onChange={set('legal_form')}>
                <option value="">—</option>
                {meta.legal_forms.map(lf => <option key={lf} value={lf}>{lf.replace(/_/g, ' ').toUpperCase()}</option>)}
              </select>
            </div>
          </div>

          <div className="field-section">PRIMARY CONTACT</div>
          <div className="mb-4 grid grid-cols-2 gap-3">
            <div>
              <label className="label">Contact Name</label>
              <input className="input" value={form.primary_contact_name || ''} onChange={set('primary_contact_name')} />
            </div>
            <div>
              <label className="label">Phone</label>
              <input className="input" value={form.primary_phone || ''} onChange={set('primary_phone')} />
            </div>
            <div className="col-span-2">
              <label className="label">Email</label>
              <input className="input" type="email" value={form.primary_email || ''} onChange={set('primary_email')} />
            </div>
          </div>

          <div className="field-section">ASSIGNMENT</div>
          <div className="mb-4 grid grid-cols-2 gap-3">
            <div>
              <label className="label">Assigned Marketing Specialist</label>
              <select className="input" value={form.assigned_accountant_id || ''} onChange={set('assigned_accountant_id')}>
                <option value="">Me</option>
                {users.map(u => <option key={u.id} value={u.id}>{u.full_name}</option>)}
              </select>
            </div>
            {isEdit && (
              <div>
                <label className="label">Status</label>
                <select className="input" value={form.status || 'active'} onChange={set('status')}>
                  {meta.statuses.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            )}
          </div>

          <div className="mb-4">
            <label className="label">Notes</label>
            <textarea className="input min-h-[60px] resize-y" value={form.notes || ''} onChange={set('notes')} />
          </div>

          <div className="flex justify-end gap-2.5">
            <button type="button" onClick={onClose} className="btn btn-ghost">Cancel</button>
            <button type="submit" disabled={loading} className="btn btn-primary">
              {loading ? 'Saving...' : isEdit ? 'Save Changes' : 'Create Client'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
