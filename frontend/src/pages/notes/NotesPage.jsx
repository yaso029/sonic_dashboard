import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../api';
import toast from 'react-hot-toast';
import useIsMobile from '../../hooks/useIsMobile';

function preview(content) {
  const t = (content || '').trim().replace(/\s+/g, ' ');
  return t ? t.slice(0, 60) : 'No additional text';
}

function fmt(ts) {
  if (!ts) return '';
  try { return new Date(ts).toLocaleString(); } catch { return ''; }
}

export default function NotesPage() {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const [notes, setNotes] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('idle'); // idle | saving | saved
  const [showList, setShowList] = useState(true); // mobile: list vs editor
  const dirty = useRef(false);
  const saveTimer = useRef(null);

  const active = notes.find(n => n.id === activeId) || null;

  useEffect(() => {
    api.get('/api/notes')
      .then(r => {
        setNotes(r.data);
        if (r.data.length) selectNote(r.data[0], false);
      })
      .catch(() => toast.error('Failed to load notes'))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function selectNote(n, goEditorOnMobile = true) {
    flushSave();
    setActiveId(n.id);
    setTitle(n.title);
    setContent(n.content || '');
    dirty.current = false;
    setStatus('idle');
    if (goEditorOnMobile && isMobile) setShowList(false);
  }

  async function createNote() {
    flushSave();
    try {
      const { data } = await api.post('/api/notes', { title: 'Untitled note', content: '' });
      setNotes(prev => [data, ...prev]);
      setActiveId(data.id);
      setTitle(data.title);
      setContent('');
      dirty.current = false;
      setStatus('idle');
      if (isMobile) setShowList(false);
    } catch {
      toast.error('Could not create note');
    }
  }

  async function save() {
    if (!activeId || !dirty.current) return;
    const id = activeId;
    const payload = { title: title.trim() || 'Untitled note', content };
    setStatus('saving');
    try {
      const { data } = await api.put(`/api/notes/${id}`, payload);
      dirty.current = false;
      setStatus('saved');
      setNotes(prev => prev
        .map(n => (n.id === id ? { ...n, ...data } : n))
        .sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at)));
    } catch {
      setStatus('idle');
      toast.error('Save failed');
    }
  }

  function flushSave() {
    if (saveTimer.current) { clearTimeout(saveTimer.current); saveTimer.current = null; }
    if (dirty.current) save();
  }

  // Debounced autosave whenever title/content change.
  useEffect(() => {
    if (!activeId || !dirty.current) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(save, 1000);
    return () => saveTimer.current && clearTimeout(saveTimer.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, content]);

  // Save on page leave.
  useEffect(() => () => flushSave(), []); // eslint-disable-line react-hooks/exhaustive-deps

  const onTitle = (e) => { dirty.current = true; setStatus('idle'); setTitle(e.target.value); };
  const onContent = (e) => { dirty.current = true; setStatus('idle'); setContent(e.target.value); };

  async function remove(n) {
    if (!window.confirm(`Delete "${n.title}"? This cannot be undone.`)) return;
    try {
      await api.delete(`/api/notes/${n.id}`);
      const rest = notes.filter(x => x.id !== n.id);
      setNotes(rest);
      if (activeId === n.id) {
        if (rest.length) selectNote(rest[0], false);
        else { setActiveId(null); setTitle(''); setContent(''); }
      }
    } catch {
      toast.error('Delete failed');
    }
  }

  const statusLabel = status === 'saving' ? 'Saving…' : status === 'saved' ? 'Saved ✓' : '';

  const List = (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
        <span className="text-[13px] font-bold uppercase tracking-wide text-[var(--text-muted)]">My Notes</span>
        <button onClick={createNote} className="btn btn-primary btn-sm">+ New</button>
      </div>
      <div className="flex-1 overflow-y-auto">
        {notes.length === 0 ? (
          <div className="p-6 text-center text-[13px] text-[var(--text-muted)]">No notes yet. Click <b>+ New</b> to start.</div>
        ) : notes.map(n => (
          <button key={n.id} onClick={() => selectNote(n)}
            className={`flex w-full flex-col items-start border-b border-[var(--border)] px-4 py-3 text-left transition ${n.id === activeId ? 'bg-accent-soft dark:bg-accent/15' : 'hover:bg-[var(--surface-2)]'}`}>
            <span className="line-clamp-1 text-[14px] font-semibold text-[var(--text)]">{n.title}</span>
            <span className="mt-0.5 line-clamp-1 text-[12px] text-[var(--text-muted)]">{preview(n.content)}</span>
            <span className="mt-1 text-[10.5px] text-[var(--text-muted)]/70">{fmt(n.updated_at)}</span>
          </button>
        ))}
      </div>
    </div>
  );

  const Editor = active ? (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-[var(--border)] px-4 py-2.5">
        {isMobile && <button onClick={() => setShowList(true)} className="btn btn-ghost btn-sm">← List</button>}
        <input value={title} onChange={onTitle} placeholder="Note title…"
          className="flex-1 bg-transparent text-[16px] font-bold text-[var(--text)] outline-none" />
        <span className="text-[11px] text-[var(--text-muted)]">{statusLabel}</span>
        <button onClick={() => remove(active)} className="btn btn-sm border border-red-300 bg-white text-red-600 hover:bg-red-50">🗑</button>
      </div>
      <textarea value={content} onChange={onContent} placeholder="Write your note here…"
        className="flex-1 resize-none bg-transparent px-5 py-4 text-[14px] leading-relaxed text-[var(--text)] outline-none" />
    </div>
  ) : (
    <div className="flex h-full items-center justify-center text-[13px] text-[var(--text-muted)]">
      Select a note or create a new one.
    </div>
  );

  return (
    <div className="flex min-h-screen flex-col bg-page">
      <div className="flex items-center gap-3 border-b border-[var(--border)] bg-[var(--surface)] px-5 py-3">
        <button onClick={() => navigate('/')} className="rounded-md border-[1.5px] border-gray-200 bg-white px-3 py-1.5 text-xs text-gray-600">← Home</button>
        <div className="text-[16px] font-black text-[var(--text)]">📝 Notes</div>
      </div>

      {loading ? (
        <div className="p-10 text-[var(--text-muted)]">Loading…</div>
      ) : isMobile ? (
        <div className="flex-1 overflow-hidden">{showList ? List : Editor}</div>
      ) : (
        <div className="flex flex-1 overflow-hidden">
          <div className="w-[320px] shrink-0 border-r border-[var(--border)] bg-[var(--surface)]">{List}</div>
          <div className="flex-1 bg-[var(--surface)]">{Editor}</div>
        </div>
      )}
    </div>
  );
}
