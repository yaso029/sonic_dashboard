import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../AuthContext';
import api from '../api';

const ROLE_LABELS = { admin: 'Administrator', marketing_manager: 'Marketing Manager', marketing_specialist: 'Marketing Specialist', analyst: 'Marketing Analyst', social_media_specialist: 'Social Media Specialist', seo_specialist: 'SEO Specialist', wordpress_developer: 'WordPress Developer', graphic_designer: 'Graphic Designer', video_editor: 'Video Editor', hr_admin: 'HR Admin' };

function Section({ title, children }) {
  return (
    <div className="card mb-6 p-7">
      <div className="field-section">{title}</div>
      {children}
    </div>
  );
}

function Input({ label, value, onChange, type = 'text', placeholder }) {
  return (
    <div className="mb-4">
      <label className="label">{label}</label>
      <input type={type} value={value} onChange={onChange} placeholder={placeholder} className="input" />
    </div>
  );
}

export default function SettingsPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const isYaso = user?.email === 'yaso@sonic.com';

  const [ownPassword, setOwnPassword] = useState('');
  const [ownPwSaving, setOwnPwSaving] = useState(false);
  const [ownPwMsg, setOwnPwMsg] = useState('');

  const [users, setUsers] = useState([]);
  const [resetPw, setResetPw] = useState({});
  const [resetMsg, setResetMsg] = useState({});

  const [showAddUser, setShowAddUser] = useState(false);
  const [addForm, setAddForm] = useState({ full_name: '', email: '', password: '', role: 'marketing_specialist', team_leader_id: '' });
  const [addSaving, setAddSaving] = useState(false);
  const [addMsg, setAddMsg] = useState('');

  const teamLeaders = users.filter(u => u.role === 'marketing_manager');

  useEffect(() => {
    if (isYaso) {
      api.get('/api/users').then(r => setUsers(r.data)).catch(() => {});
    }
  }, [isYaso]);

  const handleOwnPassword = async (e) => {
    e.preventDefault();
    setOwnPwSaving(true);
    setOwnPwMsg('');
    try {
      await api.patch('/api/users/me/password', { password: ownPassword });
      setOwnPwMsg('Password updated successfully');
      setOwnPassword('');
    } catch (err) {
      setOwnPwMsg(err?.response?.data?.detail || 'Failed to update password');
    }
    setOwnPwSaving(false);
  };

  const handleResetPassword = async (userId) => {
    const pw = resetPw[userId] || '';
    if (!pw) return;
    try {
      await api.patch(`/api/users/${userId}/password`, { password: pw });
      setResetMsg(m => ({ ...m, [userId]: 'Reset successfully' }));
      setResetPw(p => ({ ...p, [userId]: '' }));
    } catch {
      setResetMsg(m => ({ ...m, [userId]: 'Failed' }));
    }
  };

  const handleAddUser = async (e) => {
    e.preventDefault();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(addForm.email.trim())) {
      setAddMsg('A valid email is required (the employee is emailed their assigned tasks)');
      return;
    }
    setAddSaving(true);
    setAddMsg('');
    try {
      const payload = { ...addForm, team_leader_id: addForm.team_leader_id ? parseInt(addForm.team_leader_id) : null };
      await api.post('/api/users', payload);
      setAddMsg('User created successfully');
      setAddForm({ full_name: '', email: '', password: '', role: 'marketing_specialist', team_leader_id: '' });
      api.get('/api/users').then(r => setUsers(r.data));
      setShowAddUser(false);
    } catch (err) {
      setAddMsg(err?.response?.data?.detail || 'Failed to create user');
    }
    setAddSaving(false);
  };

  const handleDeactivate = async (userId) => {
    if (!window.confirm('Deactivate this user?')) return;
    try {
      await api.delete(`/api/users/${userId}`);
      setUsers(u => u.map(x => x.id === userId ? { ...x, is_active: false } : x));
    } catch {}
  };

  const handleDelete = async (u) => {
    if (!window.confirm(
      `Permanently DELETE ${u.full_name}?\n\nThis cannot be undone. Their assigned leads, clients and tasks will be kept but un-assigned.`
    )) return;
    try {
      await api.delete(`/api/users/${u.id}/permanent`);
      setUsers(list => list.filter(x => x.id !== u.id));
    } catch (err) {
      alert(err?.response?.data?.detail || 'Failed to delete user');
    }
  };

  return (
    <div className="min-h-screen bg-page dark:bg-surface-dark">
      {/* Header */}
      <div className="flex items-center gap-4 border-b border-[var(--border)] bg-secondary px-8 py-5">
        <button onClick={() => navigate('/')} className="rounded-lg border border-white/20 bg-white/10 px-3.5 py-1.5 text-[13px] text-white/80 hover:bg-white/20">← Home</button>
        <div>
          <div className="text-xl font-black text-white">Settings</div>
          <div className="text-[11px] text-white/60">Account & system management</div>
        </div>
      </div>

      <div className="mx-auto max-w-[860px] px-6 py-10">

        {/* My Account */}
        <Section title="My Account">
          <div className="mb-5 grid grid-cols-2 gap-4">
            {[['Full Name', user?.full_name], ['Email', user?.email]].map(([label, val]) => (
              <div key={label}>
                <div className="mb-1 text-[11px] text-[var(--text-muted)]">{label}</div>
                <div className="text-[15px] font-semibold text-[var(--text)]">{val}</div>
              </div>
            ))}
          </div>
          <div>
            <div className="mb-1.5 text-[11px] text-[var(--text-muted)]">Role & Permissions</div>
            <div className="flex items-center gap-2.5">
              <span className="badge badge-accent text-xs">
                {ROLE_LABELS[user?.role] || user?.role}
              </span>
              {user?.role === 'marketing_specialist' && <span className="text-xs text-[var(--text-muted)]">Access: CRM, Clients, Calendar</span>}
              {user?.role === 'marketing_manager' && <span className="text-xs text-[var(--text-muted)]">Access: CRM (team scope), Clients, Calendar</span>}
              {user?.role === 'analyst' && <span className="text-xs text-[var(--text-muted)]">Access: Read-only across clients, services & tasks</span>}
              {user?.role === 'social_media_specialist' && <span className="text-xs text-[var(--text-muted)]">Access: Content Creation services & tasks, Calendar</span>}
              {user?.role === 'seo_specialist' && <span className="text-xs text-[var(--text-muted)]">Access: VAT / Paid Advertising / Marketing Consultation services, Calendar</span>}
              {user?.role === 'admin' && <span className="text-xs text-[var(--text-muted)]">Full system access</span>}
              {user?.role === 'hr_admin' && <span className="text-xs text-[var(--text-muted)]">Access: HR Module, Calendar</span>}
            </div>
          </div>
        </Section>

        {/* Change Password */}
        <Section title="Change My Password">
          <form onSubmit={handleOwnPassword}>
            <Input label="New Password" type="password" value={ownPassword} onChange={e => setOwnPassword(e.target.value)} placeholder="Enter new password" />
            {ownPwMsg && <div className={`mb-3 text-xs ${ownPwMsg.includes('success') ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500'}`}>{ownPwMsg}</div>}
            <button type="submit" disabled={ownPwSaving || !ownPassword} className="btn btn-primary">
              {ownPwSaving ? 'Saving...' : 'Update Password'}
            </button>
          </form>
        </Section>

        {/* Admin: User Management */}
        {isYaso && (
          <>
            <Section title="User Management">
              <div className="mb-5 flex items-center justify-between">
                <button onClick={() => navigate('/audit-log')} className="btn btn-ghost">
                  🛡 Security Audit Log
                </button>
                <button onClick={() => setShowAddUser(v => !v)} className="btn btn-accent">
                  {showAddUser ? 'Cancel' : '+ Add User'}
                </button>
              </div>

              {showAddUser && (
                <form onSubmit={handleAddUser} className="mb-6 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-6">
                  <div className="mb-4 text-[13px] font-bold text-[var(--text-muted)]">New User</div>
                  <div className="grid grid-cols-2 gap-3">
                    <Input label="Full Name *" value={addForm.full_name} onChange={e => setAddForm(f => ({ ...f, full_name: e.target.value }))} />
                    <Input label="Email *" type="email" value={addForm.email} onChange={e => setAddForm(f => ({ ...f, email: e.target.value }))} placeholder="employee@example.com" />
                    <Input label="Password *" type="password" value={addForm.password} onChange={e => setAddForm(f => ({ ...f, password: e.target.value }))} />
                    <div className="mb-4">
                      <label className="label">Role</label>
                      <select value={addForm.role} onChange={e => setAddForm(f => ({ ...f, role: e.target.value }))} className="input">
                        <option value="marketing_specialist">Marketing Specialist</option>
                        <option value="marketing_manager">Marketing Manager</option>
                        <option value="analyst">Marketing Analyst</option>
                        <option value="social_media_specialist">Social Media Specialist</option>
                        <option value="seo_specialist">SEO Specialist</option>
                        <option value="wordpress_developer">WordPress Developer</option>
                        <option value="graphic_designer">Graphic Designer</option>
                        <option value="video_editor">Video Editor</option>
                        <option value="admin">Admin</option>
                        <option value="hr_admin">HR Admin</option>
                      </select>
                    </div>
                    {addForm.role === 'marketing_specialist' && (
                      <div className="mb-4">
                        <label className="label">Marketing Manager</label>
                        <select value={addForm.team_leader_id} onChange={e => setAddForm(f => ({ ...f, team_leader_id: e.target.value }))} className="input">
                          <option value="">— None —</option>
                          {teamLeaders.map(tl => <option key={tl.id} value={tl.id}>{tl.full_name}</option>)}
                        </select>
                      </div>
                    )}
                  </div>
                  {addMsg && <div className={`mb-2.5 text-xs ${addMsg.includes('success') ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500'}`}>{addMsg}</div>}
                  <button type="submit" disabled={addSaving} className="btn btn-accent">
                    {addSaving ? 'Creating...' : 'Create User'}
                  </button>
                </form>
              )}

              <div className="flex flex-col gap-3">
                {users.map(u => (
                  <div key={u.id} className={`rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-5 py-4 ${u.is_active ? '' : 'opacity-45'}`}>
                    <div className="flex flex-wrap items-start gap-4">
                      <div className="min-w-[160px] flex-1">
                        <div className="text-sm font-bold text-[var(--text)]">{u.full_name}</div>
                        <div className="mt-0.5 text-[11px] text-[var(--text-muted)]">{u.email}</div>
                        <div className="mt-1.5 flex items-center gap-1.5">
                          <span className="badge badge-accent text-[10px]">
                            {ROLE_LABELS[u.role] || u.role}
                          </span>
                          {!u.is_active && <span className="text-[10px] font-semibold text-red-500">Inactive</span>}
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <input type="password" placeholder="New password" value={resetPw[u.id] || ''}
                          onChange={e => setResetPw(p => ({ ...p, [u.id]: e.target.value }))}
                          className="input w-[150px]" />
                        <button onClick={() => handleResetPassword(u.id)} disabled={!resetPw[u.id]} className="btn btn-primary btn-sm">
                          Reset
                        </button>
                        {u.is_active && u.id !== user?.id && (
                          <button onClick={() => handleDeactivate(u.id)} className="btn btn-danger btn-sm">
                            Deactivate
                          </button>
                        )}
                        {u.id !== user?.id && u.email !== 'yaso@sonic.com' && (
                          <button onClick={() => handleDelete(u)} className="btn btn-sm border border-red-300 bg-white text-red-600 hover:bg-red-50">
                            Delete
                          </button>
                        )}
                        {resetMsg[u.id] && <span className={`text-[11px] ${resetMsg[u.id].includes('success') ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500'}`}>{resetMsg[u.id]}</span>}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </Section>
          </>
        )}
      </div>
    </div>
  );
}
