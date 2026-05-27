import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../api';
import toast from 'react-hot-toast';
import { useAuth } from '../../AuthContext';
import { useMessages } from '../../MessagesContext';
import useIsMobile from '../../hooks/useIsMobile';

const ROLE_LABELS = {
  admin: 'Admin', marketing_manager: 'Marketing Manager', marketing_specialist: 'Marketing Specialist',
  analyst: 'Marketing Analyst', social_media_specialist: 'Social Media Specialist', seo_specialist: 'SEO Specialist',
  wordpress_developer: 'WordPress Developer', graphic_designer: 'Graphic Designer', video_editor: 'Video Editor', hr_admin: 'HR Admin',
};

const initials = (name) => (name || '?').trim().split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase();
const fmtTime = (ts) => { try { return new Date(ts).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' }); } catch { return ''; } };

export default function MessagesPage() {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const { user } = useAuth();
  const { subscribe, setActivePeer, refreshUnread } = useMessages();

  const [contacts, setContacts] = useState([]);
  const [peer, setPeer] = useState(null);            // selected contact
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showList, setShowList] = useState(true);    // mobile pane toggle
  const peerRef = useRef(null);
  const scrollRef = useRef(null);

  const loadContacts = () => api.get('/api/messages/contacts').then(r => setContacts(r.data)).catch(() => {});

  useEffect(() => {
    loadContacts().finally(() => setLoading(false));
    return () => setActivePeer(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Live incoming messages for the open conversation.
  useEffect(() => {
    const off = subscribe((m) => {
      const p = peerRef.current;
      const involvesPeer = p && (m.sender_id === p.id || m.recipient_id === p.id);
      if (involvesPeer) {
        setMessages(prev => prev.some(x => x.id === m.id) ? prev : [...prev, m]);
        if (m.sender_id === p.id) api.get(`/api/messages/with/${p.id}`).then(() => refreshUnread()).catch(() => {});
      }
      loadContacts();  // refresh unread badges in the list
    });
    return off;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  const openConversation = async (c) => {
    setPeer(c); peerRef.current = c; setActivePeer(c.id);
    if (isMobile) setShowList(false);
    try {
      const { data } = await api.get(`/api/messages/with/${c.id}`);
      setMessages(data);
      setContacts(prev => prev.map(x => x.id === c.id ? { ...x, unread: 0 } : x));
      refreshUnread();
    } catch { toast.error('Could not load conversation'); }
  };

  const send = async (e) => {
    e?.preventDefault();
    const body = text.trim();
    if (!body || !peer) return;
    setSending(true);
    try {
      const { data } = await api.post('/api/messages', { recipient_id: peer.id, body });
      setMessages(prev => prev.some(x => x.id === data.id) ? prev : [...prev, data]);
      setText('');
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Send failed');
    } finally { setSending(false); }
  };

  const ContactList = (
    <div className="flex h-full flex-col">
      <div className="border-b border-[var(--border)] px-4 py-3 text-[13px] font-bold uppercase tracking-wide text-[var(--text-muted)]">
        Team ({contacts.length})
      </div>
      <div className="flex-1 overflow-y-auto">
        {contacts.length === 0 ? (
          <div className="p-6 text-center text-[13px] text-[var(--text-muted)]">No other users yet.</div>
        ) : contacts.map(c => (
          <button key={c.id} onClick={() => openConversation(c)}
            className={`flex w-full items-center gap-3 border-b border-[var(--border)] px-4 py-3 text-left transition ${peer?.id === c.id ? 'bg-accent-soft dark:bg-accent/15' : 'hover:bg-[var(--surface-2)]'}`}>
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-[12px] font-bold text-white">{initials(c.full_name)}</div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="line-clamp-1 text-[14px] font-semibold text-[var(--text)]">{c.full_name}</span>
                {c.unread > 0 && <span className="ml-auto flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">{c.unread}</span>}
              </div>
              <div className="line-clamp-1 text-[11px] text-[var(--text-muted)]">{ROLE_LABELS[c.role] || c.role}</div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );

  const Chat = peer ? (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 border-b border-[var(--border)] px-4 py-3">
        {isMobile && <button onClick={() => { setShowList(true); setActivePeer(null); }} className="btn btn-ghost btn-sm">←</button>}
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-[11px] font-bold text-white">{initials(peer.full_name)}</div>
        <div>
          <div className="text-[14px] font-bold text-[var(--text)]">{peer.full_name}</div>
          <div className="text-[11px] text-[var(--text-muted)]">{ROLE_LABELS[peer.role] || peer.role}</div>
        </div>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto bg-page px-4 py-4">
        {messages.length === 0 ? (
          <div className="mt-10 text-center text-[13px] text-[var(--text-muted)]">No messages yet — say hello 👋</div>
        ) : messages.map(m => {
          const mine = m.sender_id === user.id;
          return (
            <div key={m.id} className={`mb-2.5 flex ${mine ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[75%] rounded-2xl px-3.5 py-2 text-[14px] leading-snug ${mine ? 'bg-primary text-white' : 'bg-[var(--surface)] text-[var(--text)] border border-[var(--border)]'}`}>
                <div className="whitespace-pre-wrap break-words">{m.body}</div>
                <div className={`mt-0.5 text-[10px] ${mine ? 'text-white/60' : 'text-[var(--text-muted)]'}`}>{fmtTime(m.created_at)}</div>
              </div>
            </div>
          );
        })}
      </div>

      <form onSubmit={send} className="flex items-center gap-2 border-t border-[var(--border)] bg-[var(--surface)] px-3 py-2.5">
        <input value={text} onChange={e => setText(e.target.value)} placeholder="Type a message…"
          className="input flex-1" />
        <button type="submit" disabled={sending || !text.trim()} className="btn btn-primary">Send</button>
      </form>
    </div>
  ) : (
    <div className="flex h-full items-center justify-center text-[13px] text-[var(--text-muted)]">Select a teammate to start chatting.</div>
  );

  return (
    <div className="flex min-h-screen flex-col bg-page">
      <div className="flex items-center gap-3 border-b border-[var(--border)] bg-[var(--surface)] px-5 py-3">
        <button onClick={() => navigate('/')} className="rounded-md border-[1.5px] border-gray-200 bg-white px-3 py-1.5 text-xs text-gray-600">← Home</button>
        <div className="text-[16px] font-black text-[var(--text)]">💬 Messages</div>
      </div>
      {loading ? (
        <div className="p-10 text-[var(--text-muted)]">Loading…</div>
      ) : isMobile ? (
        <div className="flex-1 overflow-hidden">{showList ? ContactList : Chat}</div>
      ) : (
        <div className="flex flex-1 overflow-hidden">
          <div className="w-[300px] shrink-0 border-r border-[var(--border)] bg-[var(--surface)]">{ContactList}</div>
          <div className="flex-1">{Chat}</div>
        </div>
      )}
    </div>
  );
}
