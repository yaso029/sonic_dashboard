import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../AuthContext';
import api from '../api';

const ROLE_LABELS = { admin: 'Administrator', marketing_manager: 'Marketing Manager', marketing_specialist: 'Marketing Specialist', analyst: 'Marketing Analyst', social_media_specialist: 'Social Media Specialist', seo_specialist: 'SEO Specialist', wordpress_developer: 'WordPress Developer', graphic_designer: 'Graphic Designer', video_editor: 'Video Editor', hr_admin: 'HR Admin' };

// Per-user module access matrix (None / View / Full). Each module key maps to a
// backend resource (video_studio & team_tasks are route-gated pseudo-resources).
const PERM_MODULES = [
  { key: 'leads', label: 'CRM / Leads' },
  { key: 'clients', label: 'Clients' },
  { key: 'services', label: 'Services' },
  { key: 'tasks', label: 'Tasks' },
  { key: 'documents', label: 'Documents' },
  { key: 'invoices', label: 'Billing' },
  { key: 'content', label: 'Content Calendar' },
  { key: 'analytics', label: 'Analytics & KPIs' },
  { key: 'expenses', label: 'Company Expenses' },
  { key: 'bills', label: 'Invoices (Renewals)' },
  { key: 'calendar', label: 'Calendar' },
  { key: 'team_tasks', label: 'Team Tasks' },
  { key: 'video_studio', label: 'Video Studio' },
  { key: 'hr', label: 'HR' },
];
const LEVELS = ['none', 'view', 'full'];
const FULL_ACTIONS = ['read', 'create', 'update', 'delete', 'assign', 'convert'];
const ACCESS_ONLY = new Set(['video_studio', 'team_tasks']);  // access = read; no "full" distinction
const defaultLevels = () => Object.fromEntries(PERM_MODULES.map(m => [m.key, 'none']));

function buildPermissions(levels) {
  const perms = {};
  for (const m of PERM_MODULES) {
    const lvl = levels[m.key] || 'none';
    if (lvl === 'view') perms[m.key] = ['read'];
    else if (lvl === 'full') perms[m.key] = ACCESS_ONLY.has(m.key) ? ['read'] : FULL_ACTIONS;
  }
  return perms;
}

// Inverse of buildPermissions: turn a stored override map back into None/View/Full
// levels so the edit form can pre-fill the user's current access.
function permissionsToLevels(perms) {
  const levels = defaultLevels();
  if (!perms) return levels;
  for (const m of PERM_MODULES) {
    const acts = perms[m.key];
    if (!acts || acts.length === 0) { levels[m.key] = 'none'; continue; }
    if (ACCESS_ONLY.has(m.key)) { levels[m.key] = 'full'; continue; }  // presence = access
    levels[m.key] = ['create', 'update', 'delete'].some(a => acts.includes(a)) ? 'full' : 'view';
  }
  return levels;
}

const ROLE_OPTIONS = [
  ['marketing_specialist', 'Marketing Specialist'], ['marketing_manager', 'Marketing Manager'],
  ['analyst', 'Marketing Analyst'], ['social_media_specialist', 'Social Media Specialist'],
  ['seo_specialist', 'SEO Specialist'], ['wordpress_developer', 'WordPress Developer'],
  ['graphic_designer', 'Graphic Designer'], ['video_editor', 'Video Editor'],
  ['admin', 'Admin'], ['hr_admin', 'HR Admin'],
];

// Reusable None/View/Full grid, shared by the create form and the edit modal.
function ModuleMatrix({ levels, setLevels }) {
  const setAll = (lvl) => setLevels(Object.fromEntries(PERM_MODULES.map(m => [m.key, lvl])));
  return (
    <div className="mt-3 rounded-xl border border-[var(--border)] p-3">
      <div className="mb-2 flex items-center gap-2 text-[11px] text-[var(--text-muted)]">
        <span>Quick set:</span>
        {LEVELS.map(l => (
          <button type="button" key={l} onClick={() => setAll(l)} className="rounded bg-[var(--surface)] px-2 py-0.5 capitalize hover:text-[var(--text)]">All {l}</button>
        ))}
      </div>
      {PERM_MODULES.map(m => (
        <div key={m.key} className="flex items-center justify-between border-b border-[var(--border)] py-1.5 last:border-0">
          <span className="text-[13px] text-[var(--text)]">{m.label}</span>
          <div className="flex gap-1">
            {LEVELS.map(lvl => {
              const active = (levels[m.key] || 'none') === lvl;
              return (
                <button type="button" key={lvl}
                  onClick={() => setLevels(s => ({ ...s, [m.key]: lvl }))}
                  className={`rounded px-2.5 py-1 text-[11px] font-semibold capitalize ${active ? 'bg-primary text-white' : 'bg-[var(--surface)] text-[var(--text-muted)] hover:text-[var(--text)]'}`}>
                  {lvl}
                </button>
              );
            })}
          </div>
        </div>
      ))}
      <div className="mt-2 text-[10.5px] leading-relaxed text-[var(--text-muted)]">
        View = read-only · Full = create/edit/delete. Modules on “None” are hidden for this user.
      </div>
    </div>
  );
}

// Edit an existing user's role + module access (no need to delete & recreate).
function EditUserModal({ user, onClose, onSaved }) {
  const [role, setRole] = useState(user.role);
  const [customAccess, setCustomAccess] = useState(!!user.permissions);
  const [levels, setLevels] = useState(() => permissionsToLevels(user.permissions));
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');

  const save = async () => {
    setSaving(true); setMsg('');
    try {
      const payload = { role };
      // {} clears any override -> revert to role default; admins are always full.
      payload.permissions = (customAccess && role !== 'admin') ? buildPermissions(levels) : {};
      await api.put(`/api/users/${user.id}`, payload);
      onSaved();
    } catch (e) {
      setMsg(e?.response?.data?.detail || 'Failed to save changes');
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal w-[560px] max-h-[90vh] overflow-y-auto px-8 py-7">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-lg font-bold">Edit — {user.full_name}</h2>
          <button onClick={onClose} className="text-2xl text-gray-400">×</button>
        </div>
        <div className="mb-1 text-[11px] text-[var(--text-muted)]">{user.email}</div>
        <label className="label">Role / Job title</label>
        <select value={role} onChange={e => setRole(e.target.value)} className="input mb-4">
          {ROLE_OPTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>

        {role === 'admin' ? (
          <div className="mb-4 rounded-lg bg-[var(--surface-2)] px-3 py-2.5 text-xs text-[var(--text-muted)]">
            Admins always have full access to every module.
          </div>
        ) : (
          <div className="mb-4">
            <label className="flex cursor-pointer items-center gap-2 text-[13px] font-semibold text-[var(--text)]">
              <input type="checkbox" checked={customAccess} onChange={e => setCustomAccess(e.target.checked)} />
              Customize module access (override the role default)
            </label>
            {customAccess && <ModuleMatrix levels={levels} setLevels={setLevels} />}
          </div>
        )}

        {msg && <div className="mb-2.5 text-xs text-red-500">{msg}</div>}
        <div className="flex justify-end gap-2.5">
          <button onClick={onClose} className="btn btn-ghost">Cancel</button>
          <button onClick={save} disabled={saving} className="btn btn-primary">{saving ? 'Saving…' : 'Save Changes'}</button>
        </div>
      </div>
    </div>
  );
}

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
  const [customAccess, setCustomAccess] = useState(false);
  const [moduleLevels, setModuleLevels] = useState(defaultLevels());
  const [editingUser, setEditingUser] = useState(null);

  const teamLeaders = users.filter(u => u.role === 'marketing_manager');

  useEffect(() => {
    if (isAdmin) {
      api.get('/api/users').then(r => setUsers(r.data)).catch(() => {});
    }
  }, [isAdmin]);

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
      if (customAccess && addForm.role !== 'admin') {
        payload.permissions = buildPermissions(moduleLevels);
      }
      await api.post('/api/users', payload);
      setAddMsg('User created successfully');
      setAddForm({ full_name: '', email: '', password: '', role: 'marketing_specialist', team_leader_id: '' });
      setCustomAccess(false);
      setModuleLevels(defaultLevels());
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
        {isAdmin && (
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

                  {/* Per-user module access (None / View / Full) */}
                  {addForm.role === 'admin' ? (
                    <div className="mb-4 rounded-lg bg-[var(--surface)] px-3 py-2.5 text-xs text-[var(--text-muted)]">
                      Admins always have full access to every module.
                    </div>
                  ) : (
                    <div className="mb-4">
                      <label className="flex cursor-pointer items-center gap-2 text-[13px] font-semibold text-[var(--text)]">
                        <input type="checkbox" checked={customAccess} onChange={e => setCustomAccess(e.target.checked)} />
                        Customize module access (override the role default)
                      </label>
                      {customAccess && <ModuleMatrix levels={moduleLevels} setLevels={setModuleLevels} />}
                    </div>
                  )}

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
                        <button onClick={() => setEditingUser(u)} className="btn btn-outline btn-sm">
                          ✎ Edit role &amp; access
                        </button>
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

            {editingUser && (
              <EditUserModal
                user={editingUser}
                onClose={() => setEditingUser(null)}
                onSaved={() => { setEditingUser(null); api.get('/api/users').then(r => setUsers(r.data)).catch(() => {}); }}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}
