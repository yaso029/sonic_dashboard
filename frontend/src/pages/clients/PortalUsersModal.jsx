import { useEffect, useState } from 'react';
import api from '../../api';
import toast from 'react-hot-toast';

export default function PortalUsersModal({ clientId, onClose }) {
  const [users, setUsers] = useState([]);
  const [form, setForm] = useState({ email: '', full_name: '', password: '' });
  const [loading, setLoading] = useState(false);

  const fetchUsers = () => api.get(`/api/clients/${clientId}/portal-users`).then(r => setUsers(r.data)).catch(() => {});
  useEffect(() => { fetchUsers(); }, [clientId]);

  const create = async (e) => {
    e.preventDefault();
    if (!form.email || form.password.length < 6) { toast.error('Email + password (min 6 chars) required'); return; }
    setLoading(true);
    try {
      await api.post(`/api/clients/${clientId}/portal-users`, form);
      toast.success('Portal account created');
      setForm({ email: '', full_name: '', password: '' });
      fetchUsers();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed');
    } finally {
      setLoading(false);
    }
  };

  const toggleActive = async (u) => {
    try {
      await api.put(`/api/portal-users/${u.id}`, { is_active: !u.is_active });
      fetchUsers();
    } catch { toast.error('Failed'); }
  };

  const resetPassword = async (u) => {
    const pw = window.prompt(`New password for ${u.email} (min 6 chars):`);
    if (!pw) return;
    try {
      await api.put(`/api/portal-users/${u.id}`, { password: pw });
      toast.success('Password reset');
    } catch (err) { toast.error(err.response?.data?.detail || 'Failed'); }
  };

  return (
    <div className="modal-overlay">
      <div className="modal w-[580px] max-h-[90vh] overflow-y-auto px-8 py-7">
        <div className="mb-1.5 flex items-center justify-between">
          <h2 className="text-lg font-bold">Client Portal Access</h2>
          <button onClick={onClose} className="text-2xl text-gray-400">×</button>
        </div>
        <p className="mb-5 text-xs text-gray-400">Portal accounts let this client log in at <code>/portal</code> to view invoices, documents and service status.</p>

        <div className="mb-5">
          {users.length === 0 ? (
            <div className="py-2.5 text-[13px] text-gray-400">No portal accounts yet.</div>
          ) : users.map(u => (
            <div key={u.id} className="flex items-center justify-between border-b border-gray-100 py-2.5">
              <div>
                <div className="text-[13px] font-semibold text-ink">{u.email}</div>
                <div className="text-[11px] text-gray-400">{u.full_name || '—'} · {u.is_active ? 'Active' : 'Disabled'}{u.last_login_at ? ` · last login ${new Date(u.last_login_at).toLocaleDateString()}` : ''}</div>
              </div>
              <div className="flex gap-1.5">
                <button onClick={() => resetPassword(u)} className="rounded-md border-[1.5px] border-gray-200 bg-white px-2.5 py-1 text-[11px]">Reset PW</button>
                <button onClick={() => toggleActive(u)}
                  className={`rounded-md border-[1.5px] bg-white px-2.5 py-1 text-[11px] font-semibold ${u.is_active ? 'border-red-500 text-red-500' : 'border-green-500 text-green-600'}`}>
                  {u.is_active ? 'Disable' : 'Enable'}
                </button>
              </div>
            </div>
          ))}
        </div>

        <form onSubmit={create} className="border-t border-gray-200 pt-4">
          <div className="field-section">NEW ACCOUNT</div>
          <div className="mb-3.5 grid grid-cols-2 gap-3">
            <div><label className="label">Email *</label><input className="input" type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} /></div>
            <div><label className="label">Contact Name</label><input className="input" value={form.full_name} onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))} /></div>
            <div className="col-span-2"><label className="label">Initial Password *</label><input className="input" type="text" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} placeholder="min 6 characters" /></div>
          </div>
          <div className="flex justify-end">
            <button type="submit" disabled={loading} className="btn btn-primary">
              {loading ? 'Creating...' : 'Create Account'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
