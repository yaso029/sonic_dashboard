import { useEffect, useState } from 'react';
import api from '../api';
import toast from 'react-hot-toast';

// Data-driven role hues (one per role).
const ROLE_COLORS = { admin: '#8b5cf6', marketing_manager: '#3b82f6', marketing_specialist: '#10b981', analyst: '#f59e0b', social_media_specialist: '#ec4899', seo_specialist: '#06b6d4', wordpress_developer: '#21759b', graphic_designer: '#e11d8f', video_editor: '#f97316', hr_admin: '#0d7377' };
const ROLE_LABELS = { admin: 'Admin', marketing_manager: 'Marketing Manager', marketing_specialist: 'Marketing Specialist', analyst: 'Marketing Analyst', social_media_specialist: 'Social Media Specialist', seo_specialist: 'SEO Specialist', wordpress_developer: 'WordPress Developer', graphic_designer: 'Graphic Designer', video_editor: 'Video Editor', hr_admin: 'HR Admin' };

function PasswordRevealModal({ name, password, onClose }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(password);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <div className="modal-overlay">
      <div className="modal w-[380px] p-9 text-center">
        <div className="mb-3 text-[40px]">🔑</div>
        <h2 className="mb-1.5 text-lg font-bold text-[var(--text)]">Password for {name}</h2>
        <p className="mb-5 text-[13px] text-[var(--text-muted)]">Save this password — it won't be shown again.</p>
        <div className="mb-4 rounded-lg bg-[var(--surface-2)] px-4 py-3.5 text-xl font-bold tracking-[2px] text-[var(--text)]">
          {password}
        </div>
        <div className="flex justify-center gap-2.5">
          <button onClick={copy} className="btn btn-outline">
            {copied ? 'Copied!' : 'Copy'}
          </button>
          <button onClick={onClose} className="btn btn-primary">
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

function ResetPasswordModal({ user, onClose }) {
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!password.trim()) return;
    setLoading(true);
    try {
      await api.patch(`/api/users/${user.id}/password`, { password });
      setDone(true);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed');
    } finally {
      setLoading(false);
    }
  };

  if (done) return <PasswordRevealModal name={user.full_name} password={password} onClose={onClose} />;

  return (
    <div className="modal-overlay">
      <div className="modal w-[380px] p-7">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-lg font-bold text-[var(--text)]">Reset Password — {user.full_name}</h2>
          <button onClick={onClose} className="text-xl text-[var(--text-muted)] hover:text-[var(--text)]">×</button>
        </div>
        <form onSubmit={handleSubmit}>
          <label className="label">New Password</label>
          <input
            className="input mb-4"
            value={password} onChange={e => setPassword(e.target.value)} required autoFocus
          />
          <div className="flex justify-end gap-2.5">
            <button type="button" onClick={onClose} className="btn btn-ghost">Cancel</button>
            <button type="submit" disabled={loading} className="btn btn-primary">
              {loading ? 'Saving...' : 'Set Password'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function UserModal({ user, teamLeaders, onClose, onSaved }) {
  const isEdit = !!user;
  const [form, setForm] = useState(user
    ? { full_name: user.full_name, role: user.role, team_leader_id: user.team_leader_id || '', is_active: user.is_active }
    : { full_name: '', password: '', role: 'marketing_specialist', team_leader_id: '' }
  );
  const [loading, setLoading] = useState(false);
  const [createdPassword, setCreatedPassword] = useState(null);
  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const payload = { ...form, team_leader_id: form.team_leader_id ? parseInt(form.team_leader_id) : null };
      if (isEdit) {
        await api.put(`/api/users/${user.id}`, payload);
        toast.success('User updated');
        onSaved();
        onClose();
      } else {
        if (!payload.password) { toast.error('Password required'); setLoading(false); return; }
        await api.post('/api/users', payload);
        setCreatedPassword(payload.password);
        onSaved();
      }
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed');
    } finally {
      setLoading(false);
    }
  };

  if (createdPassword) {
    return <PasswordRevealModal name={form.full_name} password={createdPassword} onClose={onClose} />;
  }

  return (
    <div className="modal-overlay">
      <div className="modal w-[420px] p-7">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-lg font-bold text-[var(--text)]">{isEdit ? 'Edit User' : 'Add User'}</h2>
          <button onClick={onClose} className="text-xl text-[var(--text-muted)] hover:text-[var(--text)]">×</button>
        </div>
        <form onSubmit={handleSubmit}>
          <label className="label">Full Name</label>
          <input className="input mb-3" value={form.full_name} onChange={set('full_name')} required placeholder="e.g. Obada" />

          {!isEdit && (
            <>
              <label className="label">Password</label>
              <input className="input mb-3" type="text" value={form.password} onChange={set('password')} required placeholder="Set a password" />
            </>
          )}

          <label className="label">Role</label>
          <select className="input mb-3" value={form.role} onChange={set('role')}>
            <option value="marketing_specialist">Marketing Specialist</option>
            <option value="marketing_manager">Marketing Manager</option>
            <option value="analyst">Marketing Analyst</option>
            <option value="social_media_specialist">Social Media Specialist</option>
            <option value="seo_specialist">SEO Specialist</option>
            <option value="wordpress_developer">WordPress Developer</option>
            <option value="graphic_designer">Graphic Designer</option>
            <option value="video_editor">Video Editor</option>
            <option value="hr_admin">HR Admin</option>
            <option value="admin">Admin</option>
          </select>

          {form.role === 'marketing_specialist' && teamLeaders.length > 0 && (
            <>
              <label className="label">Marketing Manager</label>
              <select className="input mb-3" value={form.team_leader_id} onChange={set('team_leader_id')}>
                <option value="">None</option>
                {teamLeaders.map(tl => <option key={tl.id} value={tl.id}>{tl.full_name}</option>)}
              </select>
            </>
          )}

          {isEdit && (
            <>
              <label className="label">Status</label>
              <select className="input mb-3" value={form.is_active ? 'true' : 'false'} onChange={e => setForm(f => ({ ...f, is_active: e.target.value === 'true' }))}>
                <option value="true">Active</option>
                <option value="false">Inactive</option>
              </select>
            </>
          )}

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

export default function UsersPage() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null);
  const [resetUser, setResetUser] = useState(null);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/api/users');
      setUsers(data);
    } catch { toast.error('Failed to load users'); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchUsers(); }, []);

  const deactivate = async (userId) => {
    if (!confirm('Deactivate this user?')) return;
    try {
      await api.delete(`/api/users/${userId}`);
      toast.success('User deactivated');
      fetchUsers();
    } catch (err) { toast.error(err.response?.data?.detail || 'Failed'); }
  };

  const teamLeaders = users.filter(u => u.role === 'marketing_manager' && u.is_active);

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="page-title">User Management</h1>
          <p className="page-subtitle">{users.filter(u => u.is_active).length} active users</p>
        </div>
        <button onClick={() => setModal('add')} className="btn btn-primary">
          + Add User
        </button>
      </div>

      <div className="card overflow-hidden">
        <table className="data-table">
          <thead>
            <tr>
              {['Name', 'Role', 'Marketing Manager', 'Status', 'Actions'].map(h => (
                <th key={h} className="th">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={5} className="td p-10 text-center text-[var(--text-muted)]">Loading...</td></tr>
            ) : users.map(u => (
              <tr key={u.id}>
                <td className="td">
                  <div className="font-semibold text-[var(--text)]">{u.full_name}</div>
                </td>
                <td className="td">
                  <span className="badge" style={{ background: `${ROLE_COLORS[u.role]}20`, color: ROLE_COLORS[u.role] }}>
                    {ROLE_LABELS[u.role]}
                  </span>
                </td>
                <td className="td text-[var(--text-muted)]">{u.team_leader_name || '—'}</td>
                <td className="td">
                  <span className={`badge ${u.is_active ? 'badge-success' : 'badge-error'}`}>
                    {u.is_active ? 'Active' : 'Inactive'}
                  </span>
                </td>
                <td className="td">
                  <div className="flex gap-2">
                    <button onClick={() => setModal(u)} className="btn btn-outline btn-sm">
                      Edit
                    </button>
                    <button onClick={() => setResetUser(u)} className="btn btn-sm border-[1.5px] border-amber-500 bg-transparent text-amber-700 hover:bg-amber-50 dark:text-amber-400 dark:hover:bg-amber-500/10">
                      Password
                    </button>
                    {u.is_active && (
                      <button onClick={() => deactivate(u.id)} className="btn btn-danger btn-sm">
                        Deactivate
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modal && (
        <UserModal
          user={modal === 'add' ? null : modal}
          teamLeaders={teamLeaders}
          onClose={() => setModal(null)}
          onSaved={fetchUsers}
        />
      )}

      {resetUser && (
        <ResetPasswordModal
          user={resetUser}
          onClose={() => setResetUser(null)}
        />
      )}
    </div>
  );
}
