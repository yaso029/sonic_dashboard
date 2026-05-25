import { useEffect, useRef, useState } from 'react';
import api from '../api';

const playNotifSound = () => {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    osc.frequency.setValueAtTime(1100, ctx.currentTime + 0.12);
    gain.gain.setValueAtTime(0.2, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.5);
  } catch {}
};

/**
 * Self-contained notification bell: polls the unread count every 15s, opens a
 * dropdown of recent notifications, and marks all read. Drop it into any header.
 */
export default function NotificationBell({ panelClass = 'absolute right-0 top-11 w-[340px]' }) {
  const [unread, setUnread] = useState(0);
  const [notifs, setNotifs] = useState([]);
  const [open, setOpen] = useState(false);
  const prev = useRef(0);
  const boxRef = useRef(null);

  const fetchUnread = async () => {
    try {
      const { data } = await api.get('/api/notifications/unread-count');
      if (data.count > prev.current) playNotifSound();
      prev.current = data.count;
      setUnread(data.count);
    } catch {}
  };

  useEffect(() => {
    fetchUnread();
    const iv = setInterval(fetchUnread, 15000);
    return () => clearInterval(iv);
  }, []);

  // Close on outside click
  useEffect(() => {
    const onDoc = (e) => { if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const toggle = async () => {
    const next = !open;
    setOpen(next);
    if (next) {
      try { const { data } = await api.get('/api/notifications'); setNotifs(data); } catch {}
    }
  };

  const markAllRead = async () => {
    try {
      await api.patch('/api/notifications/read-all');
      setUnread(0);
      prev.current = 0;
      setNotifs(p => p.map(n => ({ ...n, is_read: true })));
    } catch {}
  };

  return (
    <div className="relative" ref={boxRef}>
      <button onClick={toggle} className="relative rounded-lg p-1.5 text-xl text-[var(--text-muted)] transition hover:bg-[var(--surface-2)]" title="Notifications">
        🔔
        {unread > 0 && (
          <span className="absolute right-0 top-0 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>
      {open && (
        <div className={`overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)] shadow-pop z-[200] ${panelClass}`}>
          <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3.5">
            <span className="text-sm font-semibold text-[var(--text)]">Notifications</span>
            {unread > 0 && <button onClick={markAllRead} className="text-xs font-semibold text-accent">Mark all read</button>}
          </div>
          <div className="max-h-80 overflow-y-auto">
            {notifs.length === 0 ? (
              <div className="p-5 text-center text-[13px] text-[var(--text-muted)]">No notifications</div>
            ) : notifs.map(n => (
              <div key={n.id} className={'notif-item' + (n.is_read ? '' : ' notif-item-unread')}>
                <div className="text-[var(--text)] text-[13px]">{n.message}</div>
                <div className="mt-0.5 text-[11px] text-[var(--text-muted)]">{new Date(n.created_at).toLocaleString()}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
