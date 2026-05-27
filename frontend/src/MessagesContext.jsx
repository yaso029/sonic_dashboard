import { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import toast from 'react-hot-toast';
import { useAuth } from './AuthContext';
import api from './api';

const MessagesContext = createContext(null);
const WS_BASE = (import.meta.env.VITE_API_URL || 'http://localhost:8000').replace(/^http/, 'ws');

function ding() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.connect(g); g.connect(ctx.destination);
    o.type = 'sine'; o.frequency.setValueAtTime(660, ctx.currentTime);
    o.frequency.setValueAtTime(880, ctx.currentTime + 0.1);
    g.gain.setValueAtTime(0.18, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
    o.start(); o.stop(ctx.currentTime + 0.4);
  } catch {}
}

const strip = (html) => (html || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();

/**
 * App-wide messaging state: a single WebSocket connection that delivers messages
 * in real time, maintains unread counts, fires a toast + sound for messages that
 * arrive while you're not looking at that conversation, and lets MessagesPage
 * subscribe to live messages.
 */
export function MessagesProvider({ children }) {
  const { user } = useAuth();
  const [totalUnread, setTotalUnread] = useState(0);
  const [byUser, setByUser] = useState({});
  const listeners = useRef(new Set());   // MessagesPage live-message handlers
  const activePeer = useRef(null);        // conversation currently open (peer id)
  const wsRef = useRef(null);
  const retryRef = useRef(null);

  const refreshUnread = useCallback(() => {
    api.get('/api/messages/unread-count')
      .then(r => { setTotalUnread(r.data.total || 0); setByUser(r.data.by_user || {}); })
      .catch(() => {});
  }, []);

  const subscribe = useCallback((fn) => { listeners.current.add(fn); return () => listeners.current.delete(fn); }, []);
  const setActivePeer = useCallback((id) => { activePeer.current = id; }, []);

  useEffect(() => {
    if (!user) return undefined;
    let closed = false;
    refreshUnread();
    const poll = setInterval(refreshUnread, 20000);  // safety net if WS drops

    const connect = () => {
      const token = localStorage.getItem('token');
      if (!token || closed) return;
      let ws;
      try { ws = new WebSocket(`${WS_BASE}/api/messages/ws?token=${encodeURIComponent(token)}`); }
      catch { return; }
      wsRef.current = ws;

      ws.onmessage = (ev) => {
        let data; try { data = JSON.parse(ev.data); } catch { return; }
        if (data.type !== 'message') return;
        const m = data.message;
        listeners.current.forEach(fn => { try { fn(m); } catch {} });
        const fromMe = m.sender_id === user.id;
        if (!fromMe && activePeer.current !== m.sender_id) {
          ding();
          toast(`💬 ${m.sender_name}: ${strip(m.body).slice(0, 60)}`, { icon: '✉️' });
        }
        refreshUnread();
      };
      ws.onclose = () => {
        if (closed) return;
        retryRef.current = setTimeout(connect, 3000);  // auto-reconnect
      };
      ws.onerror = () => { try { ws.close(); } catch {} };
    };
    connect();

    return () => {
      closed = true;
      clearInterval(poll);
      if (retryRef.current) clearTimeout(retryRef.current);
      try { wsRef.current && wsRef.current.close(); } catch {}
    };
  }, [user?.id, refreshUnread]);

  return (
    <MessagesContext.Provider value={{ totalUnread, byUser, refreshUnread, subscribe, setActivePeer }}>
      {children}
    </MessagesContext.Provider>
  );
}

export const useMessages = () => useContext(MessagesContext) || {
  totalUnread: 0, byUser: {}, refreshUnread: () => {}, subscribe: () => () => {}, setActivePeer: () => {},
};
