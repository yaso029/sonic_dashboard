import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../AuthContext';
import api from '../../api';
import toast from 'react-hot-toast';

const COLUMNS = [
  { key: 'todo', label: 'To Do', dot: 'bg-gray-400' },
  { key: 'in_progress', label: 'In Progress', dot: 'bg-blue-500' },
  { key: 'review', label: 'Review', dot: 'bg-amber-500' },
  { key: 'done', label: 'Done', dot: 'bg-emerald-500' },
];

const PRIORITY_BADGE = {
  low: 'bg-gray-100 text-gray-500',
  normal: 'bg-blue-100 text-blue-600',
  high: 'bg-orange-100 text-orange-600',
  urgent: 'bg-red-100 text-red-600',
};

const PRIORITIES = ['low', 'normal', 'high', 'urgent'];
const MEMBER_STATUSES = ['in_progress', 'review'];

function ProgressBar({ value }) {
  const v = Math.max(0, Math.min(100, value || 0));
  const tone = v >= 100 ? 'bg-emerald-500' : v >= 50 ? 'bg-blue-500' : 'bg-amber-500';
  return (
    <div className="mt-2">
      <div className="mb-1 flex items-center justify-between text-[10px] font-semibold text-gray-400">
        <span>PROGRESS</span><span>{v}%</span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
        <div className={`h-full rounded-full ${tone} transition-all`} style={{ width: `${v}%` }} />
      </div>
    </div>
  );
}

/* Inline controls shown to the assigned team member on their own task. */
function MemberControls({ task, onSave }) {
  const [status, setStatus] = useState(task.status);
  const [pct, setPct] = useState(task.progress_percent || 0);
  const [note, setNote] = useState(task.member_note || '');
  const [saving, setSaving] = useState(false);
  const dirty = status !== task.status || pct !== (task.progress_percent || 0) || note !== (task.member_note || '');

  const save = async () => {
    setSaving(true);
    try {
      await onSave({ status, progress_percent: Number(pct), member_note: note });
      toast.success('Updated');
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Update failed');
    } finally {
      setSaving(false);
    }
  };

  // Member can pick In Progress / Review; show current status too if it's outside that set.
  const statusOptions = [...new Set([task.status, ...MEMBER_STATUSES])];

  return (
    <div className="mt-3 rounded-lg bg-gray-50 p-2.5">
      <div className="mb-2 grid grid-cols-2 gap-2">
        <div>
          <label className="mb-1 block text-[10px] font-semibold uppercase text-gray-400">My Status</label>
          <select className="input !py-1.5 !text-xs" value={status} onChange={e => setStatus(e.target.value)} disabled={task.status === 'done'}>
            {statusOptions.map(s => (
              <option key={s} value={s} disabled={s === 'todo' || s === 'done'}>
                {s.replace('_', ' ')}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-[10px] font-semibold uppercase text-gray-400">Progress %</label>
          <input type="number" min={0} max={100} className="input !py-1.5 !text-xs" value={pct}
            onChange={e => setPct(e.target.value)} disabled={task.status === 'done'} />
        </div>
      </div>
      <input type="range" min={0} max={100} value={pct} onChange={e => setPct(e.target.value)}
        disabled={task.status === 'done'} className="mb-2 w-full cursor-pointer accent-blue-600" />
      <input className="input !py-1.5 !text-xs" placeholder="Progress note (optional)…" value={note}
        onChange={e => setNote(e.target.value)} disabled={task.status === 'done'} />
      <button onClick={save} disabled={!dirty || saving || task.status === 'done'}
        className="btn btn-primary mt-2 w-full !py-1.5 !text-xs disabled:opacity-50">
        {saving ? 'Saving…' : 'Save update'}
      </button>
    </div>
  );
}

function TaskCard({ task, isAdmin, currentUserId, onMemberSave, onAdminStatus, onEdit, onDelete }) {
  const mine = task.assigned_to === currentUserId;
  return (
    <div className={`mb-2.5 rounded-xl border bg-white p-3 shadow-sm ${task.is_overdue ? 'border-red-200' : 'border-gray-100'}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="text-[13.5px] font-semibold leading-snug text-ink">{task.title}</div>
        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[9px] font-bold uppercase ${PRIORITY_BADGE[task.priority] || PRIORITY_BADGE.normal}`}>
          {task.priority}
        </span>
      </div>
      {task.description && <div className="mt-1 text-[12px] leading-relaxed text-gray-500 line-clamp-3">{task.description}</div>}

      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-gray-400">
        <span>👤 {task.assigned_to_name || 'Unassigned'}</span>
        {task.due_date && (
          <span className={task.is_overdue ? 'font-semibold text-red-500' : ''}>📅 {task.due_date}{task.is_overdue ? ' · overdue' : ''}</span>
        )}
      </div>

      <ProgressBar value={task.progress_percent} />

      {task.member_note && (
        <div className="mt-2 rounded bg-gray-50 px-2 py-1.5 text-[11px] text-gray-500"><b>Note:</b> {task.member_note}</div>
      )}
      {task.review_notes && (
        <div className="mt-2 rounded bg-amber-50 px-2 py-1.5 text-[11px] text-amber-700"><b>Admin feedback:</b> {task.review_notes}</div>
      )}

      {/* Assigned team member controls (their own, not-done task) */}
      {!isAdmin && mine && <MemberControls task={task} onSave={(p) => onMemberSave(task, p)} />}

      {/* Admin controls */}
      {isAdmin && (
        <div className="mt-3 flex items-center gap-2 border-t border-gray-100 pt-2.5">
          <select className="input !py-1.5 !text-xs flex-1" value={task.status} onChange={e => onAdminStatus(task, e.target.value)}>
            {COLUMNS.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
          </select>
          <button onClick={() => onEdit(task)} className="btn btn-outline !py-1.5 !text-xs">Edit</button>
          <button onClick={() => onDelete(task)} className="btn btn-ghost !py-1.5 !text-xs !text-red-500">✕</button>
        </div>
      )}
    </div>
  );
}

function TaskModal({ task, users, onClose, onSaved }) {
  const isEdit = !!task;
  const [form, setForm] = useState(task || {
    title: '', description: '', assigned_to: '', priority: 'normal', due_date: '', status: 'todo', progress_percent: 0, review_notes: '',
  });
  const [loading, setLoading] = useState(false);
  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    if (!form.title.trim()) { toast.error('Title is required'); return; }
    setLoading(true);
    try {
      const payload = {
        title: form.title,
        description: form.description || null,
        assigned_to: form.assigned_to ? parseInt(form.assigned_to) : null,
        priority: form.priority,
        due_date: form.due_date || null,
        status: form.status,
      };
      if (isEdit) {
        payload.progress_percent = Number(form.progress_percent) || 0;
        payload.review_notes = form.review_notes || null;
        await api.put(`/api/team-tasks/${task.id}`, payload);
        toast.success('Task updated');
      } else {
        await api.post('/api/team-tasks', payload);
        toast.success('Task created');
      }
      onSaved();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to save task');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal w-[560px] max-h-[90vh] overflow-y-auto px-8 py-7">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-lg font-bold">{isEdit ? 'Edit Task' : 'New Task'}</h2>
          <button onClick={onClose} className="text-2xl text-gray-400">×</button>
        </div>
        <form onSubmit={submit}>
          <label className="label">Title *</label>
          <input className="input mb-3" value={form.title} onChange={set('title')} autoFocus />

          <label className="label">Description</label>
          <textarea className="input mb-3 min-h-[70px] resize-y" value={form.description || ''} onChange={set('description')} />

          <div className="mb-3 grid grid-cols-2 gap-3">
            <div>
              <label className="label">Assign To</label>
              <select className="input" value={form.assigned_to || ''} onChange={set('assigned_to')}>
                <option value="">— Unassigned —</option>
                {users.map(u => <option key={u.id} value={u.id}>{u.full_name}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Priority</label>
              <select className="input" value={form.priority} onChange={set('priority')}>
                {PRIORITIES.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Due Date</label>
              <input type="date" className="input" value={form.due_date || ''} onChange={set('due_date')} />
            </div>
            <div>
              <label className="label">Status</label>
              <select className="input" value={form.status} onChange={set('status')}>
                {COLUMNS.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
              </select>
            </div>
          </div>

          {isEdit && (
            <>
              <label className="label">Progress % ({form.progress_percent || 0})</label>
              <input type="range" min={0} max={100} value={form.progress_percent || 0} onChange={set('progress_percent')} className="mb-3 w-full accent-blue-600" />
              <label className="label">Review / Feedback Notes</label>
              <textarea className="input mb-3 min-h-[60px] resize-y" value={form.review_notes || ''} onChange={set('review_notes')} placeholder="Feedback visible to the assignee…" />
            </>
          )}

          <div className="flex justify-end gap-2.5">
            <button type="button" onClick={onClose} className="btn btn-ghost">Cancel</button>
            <button type="submit" disabled={loading} className="btn btn-primary">
              {loading ? 'Saving…' : isEdit ? 'Save Changes' : 'Create Task'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function TeamTasksPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const [tasks, setTasks] = useState([]);
  const [users, setUsers] = useState([]);
  const [stats, setStats] = useState({ total: 0, by_status: {}, overdue: 0 });
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null); // null | {} (new) | task (edit)

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [t, s] = await Promise.all([
        api.get('/api/team-tasks'),
        api.get('/api/team-tasks/stats').then(r => r.data).catch(() => null),
      ]);
      setTasks(t.data);
      if (s) setStats(s);
      if (isAdmin) {
        api.get('/api/users').then(r => setUsers(r.data.filter(u => u.is_active))).catch(() => {});
      }
    } finally {
      setLoading(false);
    }
  }, [isAdmin]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const memberSave = async (task, payload) => {
    const { data } = await api.put(`/api/team-tasks/${task.id}`, payload);
    setTasks(prev => prev.map(t => (t.id === data.id ? data : t)));
    api.get('/api/team-tasks/stats').then(r => setStats(r.data)).catch(() => {});
  };

  const adminStatus = async (task, status) => {
    try {
      const { data } = await api.put(`/api/team-tasks/${task.id}`, { status });
      setTasks(prev => prev.map(t => (t.id === data.id ? data : t)));
      api.get('/api/team-tasks/stats').then(r => setStats(r.data)).catch(() => {});
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Update failed');
    }
  };

  const remove = async (task) => {
    if (!window.confirm(`Delete task "${task.title}"?`)) return;
    try {
      await api.delete(`/api/team-tasks/${task.id}`);
      toast.success('Task deleted');
      fetchAll();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Delete failed');
    }
  };

  const byStatus = (key) => tasks.filter(t => t.status === key);

  return (
    <div className="min-h-screen bg-page p-7">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <button onClick={() => navigate('/')} className="mb-2 rounded-md border-[1.5px] border-gray-200 bg-white px-3 py-1.5 text-xs text-gray-600">← Home</button>
          <h1 className="page-title">Tasks Management</h1>
          <p className="page-subtitle">
            {isAdmin ? 'Assign work to the team and track progress to completion.' : 'Your assigned tasks — update status and progress.'}
          </p>
        </div>
        {isAdmin && (
          <button onClick={() => setModal({})} className="btn btn-primary">+ New Task</button>
        )}
      </div>

      {/* Stat chips */}
      <div className="mb-5 flex flex-wrap gap-3">
        {[
          { label: 'Total', value: stats.total, tone: 'text-ink' },
          { label: 'In Progress', value: stats.by_status?.in_progress || 0, tone: 'text-blue-600' },
          { label: 'In Review', value: stats.by_status?.review || 0, tone: 'text-amber-600' },
          { label: 'Done', value: stats.by_status?.done || 0, tone: 'text-emerald-600' },
          { label: 'Overdue', value: stats.overdue || 0, tone: 'text-red-600' },
        ].map(s => (
          <div key={s.label} className="min-w-[120px] flex-1 rounded-xl border border-gray-100 bg-white px-4 py-3 shadow-sm">
            <div className={`text-2xl font-black ${s.tone}`}>{s.value}</div>
            <div className="mt-0.5 text-[11px] text-gray-400">{s.label}</div>
          </div>
        ))}
      </div>

      {loading ? (
        <div className="p-10 text-gray-400">Loading…</div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-4 md:grid-cols-2 grid-cols-1">
          {COLUMNS.map(col => {
            const items = byStatus(col.key);
            return (
              <div key={col.key} className="rounded-2xl bg-gray-50/60 p-3">
                <div className="mb-3 flex items-center gap-2 px-1">
                  <span className={`h-2.5 w-2.5 rounded-full ${col.dot}`} />
                  <span className="text-[13px] font-bold text-ink">{col.label}</span>
                  <span className="ml-auto rounded-full bg-white px-2 py-0.5 text-[11px] font-semibold text-gray-500">{items.length}</span>
                </div>
                {items.length === 0 ? (
                  <div className="px-1 py-6 text-center text-[12px] text-gray-300">No tasks</div>
                ) : (
                  items.map(t => (
                    <TaskCard key={t.id} task={t} isAdmin={isAdmin} currentUserId={user?.id}
                      onMemberSave={memberSave} onAdminStatus={adminStatus}
                      onEdit={(tk) => setModal(tk)} onDelete={remove} />
                  ))
                )}
              </div>
            );
          })}
        </div>
      )}

      {modal && (
        <TaskModal
          task={Object.keys(modal).length ? modal : null}
          users={users}
          onClose={() => setModal(null)}
          onSaved={() => { setModal(null); fetchAll(); }}
        />
      )}
    </div>
  );
}
