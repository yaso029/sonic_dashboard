import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../api';
import toast from 'react-hot-toast';
import { useAuth } from '../../AuthContext';

const CHANNEL_ICON = { instagram: '📷', facebook: '👍', linkedin: '💼', tiktok: '🎵', twitter: '🐦', youtube: '▶️', blog: '✍️', other: '📌' };
const STATUS_COLOR = {
  idea: '#9ca3af', draft: '#3b82f6', review: '#f59e0b', approved: '#8b5cf6', scheduled: '#06b6d4', published: '#10b981',
};
const WEEK = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const pad = (n) => String(n).padStart(2, '0');
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

function PostModal({ post, presetDate, clients, users, meta, canEdit, onClose, onSaved, onDeleted }) {
  const { user } = useAuth();
  const isEdit = !!post?.id;
  const [f, setF] = useState(post || {
    title: '', client_id: '', caption: '', channel: 'instagram',
    scheduled_date: presetDate || '', status: 'idea', assigned_to: '', notes: '',
  });
  const [saving, setSaving] = useState(false);
  const set = (k) => (e) => setF((p) => ({ ...p, [k]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    if (!f.title.trim()) return toast.error('Title is required');
    setSaving(true);
    try {
      const payload = {
        title: f.title, caption: f.caption || null, channel: f.channel,
        scheduled_date: f.scheduled_date || null, status: f.status, notes: f.notes || null,
        client_id: f.client_id ? parseInt(f.client_id) : null,
        assigned_to: f.assigned_to ? parseInt(f.assigned_to) : null,
      };
      if (isEdit) await api.put(`/api/content/${post.id}`, payload);
      else await api.post('/api/content', payload);
      toast.success(isEdit ? 'Post updated' : 'Post added');
      onSaved();
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Save failed');
      setSaving(false);
    }
  };

  const del = async () => {
    if (!window.confirm('Delete this post?')) return;
    try { await api.delete(`/api/content/${post.id}`); toast.success('Deleted'); onDeleted(); }
    catch (err) { toast.error(err?.response?.data?.detail || 'Delete failed'); }
  };

  return (
    <div className="modal-overlay">
      <div className="modal w-[560px] max-h-[92vh] overflow-y-auto px-7 py-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold">{isEdit ? 'Edit Post' : 'New Post'}</h2>
          <button onClick={onClose} className="text-2xl text-gray-400">×</button>
        </div>
        <form onSubmit={submit}>
          <label className="label">Title *</label>
          <input className="input mb-3" value={f.title} onChange={set('title')} disabled={!canEdit} placeholder="e.g. Ramadan offer reel" autoFocus />
          <div className="mb-3 grid grid-cols-2 gap-3">
            <div>
              <label className="label">Client</label>
              <select className="input" value={f.client_id || ''} onChange={set('client_id')} disabled={!canEdit}>
                <option value="">— None —</option>
                {clients.map((c) => <option key={c.id} value={c.id}>{c.company_name}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Channel</label>
              <select className="input" value={f.channel} onChange={set('channel')} disabled={!canEdit}>
                {meta.channels.map((c) => <option key={c} value={c}>{CHANNEL_ICON[c] || ''} {c}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Date</label>
              <input type="date" className="input" value={f.scheduled_date || ''} onChange={set('scheduled_date')} disabled={!canEdit} />
            </div>
            <div>
              <label className="label">Status</label>
              <select className="input" value={f.status} onChange={set('status')} disabled={!canEdit}>
                {meta.statuses.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div className="col-span-2">
              <label className="label">Assigned to</label>
              <select className="input" value={f.assigned_to || ''} onChange={set('assigned_to')} disabled={!canEdit}>
                <option value="">— Unassigned —</option>
                {users.map((u) => <option key={u.id} value={u.id}>{u.full_name}</option>)}
              </select>
            </div>
          </div>
          <label className="label">Caption</label>
          <textarea className="input mb-3 min-h-[90px] resize-y" value={f.caption || ''} onChange={set('caption')} disabled={!canEdit} placeholder="Post copy / caption…" />
          <label className="label">Notes</label>
          <input className="input mb-4" value={f.notes || ''} onChange={set('notes')} disabled={!canEdit} placeholder="Internal notes (optional)" />

          <div className="flex items-center justify-between gap-2">
            <div>{isEdit && canEdit && <button type="button" onClick={del} className="btn btn-sm border border-red-300 bg-white text-red-600 hover:bg-red-50">🗑 Delete</button>}</div>
            <div className="flex gap-2.5">
              <button type="button" onClick={onClose} className="btn btn-ghost">Close</button>
              {canEdit && <button type="submit" disabled={saving} className="btn btn-primary">{saving ? 'Saving…' : isEdit ? 'Save' : 'Add Post'}</button>}
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function ContentCalendarPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [cursor, setCursor] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });
  const [posts, setPosts] = useState([]);
  const [clients, setClients] = useState([]);
  const [users, setUsers] = useState([]);
  const [meta, setMeta] = useState({ channels: Object.keys(CHANNEL_ICON), statuses: Object.keys(STATUS_COLOR) });
  const [filters, setFilters] = useState({ client_id: '', channel: '', status: '' });
  const [modal, setModal] = useState(null); // { post } | { presetDate }
  const [view, setView] = useState('month');

  const monthKey = `${cursor.getFullYear()}-${pad(cursor.getMonth() + 1)}`;
  const canEdit = true; // visibility is gated at the hub/route; field-level handled by API

  useEffect(() => {
    api.get('/api/content/meta').then((r) => setMeta(r.data)).catch(() => {});
    api.get('/api/clients').then((r) => setClients(r.data || [])).catch(() => {});
    api.get('/api/users/team').then((r) => {
      const team = r.data || [];
      const withSelf = [{ id: user.id, full_name: `${user.full_name} (me)` }, ...team.filter((u) => u.id !== user.id)];
      setUsers(withSelf);
    }).catch(() => setUsers([{ id: user.id, full_name: `${user.full_name} (me)` }]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchPosts = () => {
    const p = new URLSearchParams({ month: monthKey });
    if (filters.client_id) p.set('client_id', filters.client_id);
    if (filters.channel) p.set('channel', filters.channel);
    if (filters.status) p.set('status', filters.status);
    api.get(`/api/content?${p.toString()}`).then((r) => setPosts(r.data)).catch(() => {});
  };
  useEffect(fetchPosts, [monthKey, filters]); // eslint-disable-line react-hooks/exhaustive-deps

  const cells = useMemo(() => {
    const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const offset = (first.getDay() + 6) % 7; // Monday-first
    const daysInMonth = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate();
    const arr = [];
    for (let i = 0; i < offset; i++) arr.push(null);
    for (let d = 1; d <= daysInMonth; d++) arr.push(new Date(cursor.getFullYear(), cursor.getMonth(), d));
    while (arr.length % 7 !== 0) arr.push(null);
    return arr;
  }, [cursor]);

  const byDate = useMemo(() => {
    const m = {};
    posts.forEach((p) => { if (p.scheduled_date) (m[p.scheduled_date] = m[p.scheduled_date] || []).push(p); });
    return m;
  }, [posts]);

  const monthLabel = cursor.toLocaleString('default', { month: 'long', year: 'numeric' });
  const todayIso = ymd(new Date());
  const move = (delta) => setCursor((c) => new Date(c.getFullYear(), c.getMonth() + delta, 1));

  const Chip = ({ p }) => (
    <button onClick={() => setModal({ post: p })}
      className="mb-1 flex w-full items-center gap-1 truncate rounded px-1.5 py-1 text-left text-[11px]"
      style={{ background: `${STATUS_COLOR[p.status]}1a`, color: 'var(--text)' }}>
      <span style={{ width: 6, height: 6, borderRadius: 3, background: STATUS_COLOR[p.status], flexShrink: 0 }} />
      <span>{CHANNEL_ICON[p.channel] || '📌'}</span>
      <span className="truncate">{p.title}</span>
    </button>
  );

  return (
    <div className="min-h-screen bg-page p-6">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <button onClick={() => navigate('/')} className="rounded-md border-[1.5px] border-gray-200 bg-white px-3 py-1.5 text-xs text-gray-600">← Home</button>
        <h1 className="text-[18px] font-black text-[var(--text)]">📅 Content Calendar</h1>
        <div className="ml-auto flex items-center gap-2">
          <div className="flex items-center overflow-hidden rounded-lg border border-[var(--border)]">
            <button onClick={() => setView('month')} className={`px-3 py-1.5 text-xs font-semibold ${view === 'month' ? 'bg-primary text-white' : 'text-[var(--text-muted)]'}`}>Month</button>
            <button onClick={() => setView('list')} className={`px-3 py-1.5 text-xs font-semibold ${view === 'list' ? 'bg-primary text-white' : 'text-[var(--text-muted)]'}`}>List</button>
          </div>
          <button onClick={() => setModal({ presetDate: '' })} className="btn btn-primary btn-sm">+ New Post</button>
        </div>
      </div>

      {/* Toolbar */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1">
          <button onClick={() => move(-1)} className="btn btn-ghost btn-sm">‹</button>
          <div className="min-w-[150px] text-center text-[15px] font-bold text-[var(--text)]">{monthLabel}</div>
          <button onClick={() => move(1)} className="btn btn-ghost btn-sm">›</button>
          <button onClick={() => setCursor(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); })} className="btn btn-outline btn-sm ml-1">Today</button>
        </div>
        <div className="ml-auto flex flex-wrap gap-2">
          <select className="input !h-9 !py-0 text-xs" value={filters.client_id} onChange={(e) => setFilters((f) => ({ ...f, client_id: e.target.value }))}>
            <option value="">All clients</option>
            {clients.map((c) => <option key={c.id} value={c.id}>{c.company_name}</option>)}
          </select>
          <select className="input !h-9 !py-0 text-xs" value={filters.channel} onChange={(e) => setFilters((f) => ({ ...f, channel: e.target.value }))}>
            <option value="">All channels</option>
            {meta.channels.map((c) => <option key={c} value={c}>{CHANNEL_ICON[c]} {c}</option>)}
          </select>
          <select className="input !h-9 !py-0 text-xs" value={filters.status} onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))}>
            <option value="">All statuses</option>
            {meta.statuses.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
      </div>

      {/* Status legend */}
      <div className="mb-3 flex flex-wrap gap-3 text-[11px] text-[var(--text-muted)]">
        {meta.statuses.map((s) => (
          <span key={s} className="flex items-center gap-1.5"><span style={{ width: 9, height: 9, borderRadius: 5, background: STATUS_COLOR[s] }} />{s}</span>
        ))}
      </div>

      {view === 'month' ? (
        <div className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)]">
          <div className="grid grid-cols-7 border-b border-[var(--border)] bg-[var(--surface-2)]">
            {WEEK.map((w) => <div key={w} className="px-2 py-2 text-center text-[11px] font-bold uppercase tracking-wide text-[var(--text-muted)]">{w}</div>)}
          </div>
          <div className="grid grid-cols-7">
            {cells.map((d, i) => {
              const iso = d ? ymd(d) : null;
              const dayPosts = iso ? (byDate[iso] || []) : [];
              return (
                <div key={i} className={`min-h-[112px] border-b border-r border-[var(--border)] p-1.5 ${!d ? 'bg-[var(--surface-2)]/40' : ''}`}>
                  {d && (
                    <>
                      <div className="mb-1 flex items-center justify-between">
                        <span className={`flex h-6 w-6 items-center justify-center rounded-full text-[12px] font-semibold ${iso === todayIso ? 'bg-primary text-white' : 'text-[var(--text-muted)]'}`}>{d.getDate()}</span>
                        <button onClick={() => setModal({ presetDate: iso })} className="text-[14px] leading-none text-[var(--text-muted)] hover:text-primary" title="Add post">＋</button>
                      </div>
                      {dayPosts.map((p) => <Chip key={p.id} p={p} />)}
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)]">
          {posts.length === 0 ? (
            <div className="p-8 text-center text-[13px] text-[var(--text-muted)]">No posts this month.</div>
          ) : posts.map((p) => (
            <button key={p.id} onClick={() => setModal({ post: p })} className="flex w-full items-center gap-3 border-b border-[var(--border)] px-4 py-3 text-left hover:bg-[var(--surface-2)]">
              <span className="text-lg">{CHANNEL_ICON[p.channel] || '📌'}</span>
              <div className="min-w-0 flex-1">
                <div className="text-[14px] font-semibold text-[var(--text)]">{p.title}</div>
                <div className="text-[11px] text-[var(--text-muted)]">{p.client_name || 'No client'} · {p.scheduled_date || 'no date'} {p.assigned_to_name ? `· ${p.assigned_to_name}` : ''}</div>
              </div>
              <span className="rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase" style={{ background: `${STATUS_COLOR[p.status]}22`, color: STATUS_COLOR[p.status] }}>{p.status}</span>
            </button>
          ))}
        </div>
      )}

      {modal && (
        <PostModal
          post={modal.post}
          presetDate={modal.presetDate}
          clients={clients}
          users={users}
          meta={meta}
          canEdit={canEdit}
          onClose={() => setModal(null)}
          onSaved={() => { setModal(null); fetchPosts(); }}
          onDeleted={() => { setModal(null); fetchPosts(); }}
        />
      )}
    </div>
  );
}
