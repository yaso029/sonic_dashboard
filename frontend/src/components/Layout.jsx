import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../AuthContext';
import { useEffect, useState } from 'react';
import api from '../api';
import useIsMobile from '../hooks/useIsMobile';
import { ThemeToggle } from '../ThemeContext';

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
    gain.gain.setValueAtTime(0.25, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.5);
  } catch {}
};

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const [unread, setUnread] = useState(0);
  const [notifs, setNotifs] = useState([]);
  const [showNotifs, setShowNotifs] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    fetchUnread();
    const iv = setInterval(fetchUnread, 15000);
    return () => clearInterval(iv);
  }, []);

  const fetchUnread = async () => {
    try {
      const { data } = await api.get('/api/notifications/unread-count');
      setUnread(prev => {
        if (data.count > prev) playNotifSound();
        return data.count;
      });
    } catch {}
  };

  const openNotifs = async () => {
    setShowNotifs(v => !v);
    if (!showNotifs) {
      const { data } = await api.get('/api/notifications');
      setNotifs(data);
    }
  };

  const markAllRead = async () => {
    await api.patch('/api/notifications/read-all');
    setUnread(0);
    setNotifs(prev => prev.map(n => ({ ...n, is_read: true })));
  };

  const handleLogout = async () => {
    await api.post('/api/auth/logout');
    logout();
    navigate('/login');
  };

  const navItems = [
    { to: '/crm', label: '← Back to CRM', icon: '◄', exact: false },
  ];

  const NotifBell = ({ panelClass }) => (
    <div className="relative">
      <button
        onClick={openNotifs}
        className="relative rounded-lg p-1.5 text-xl text-[var(--text-muted)] transition hover:bg-[var(--surface-2)]"
      >
        🔔
        {unread > 0 && (
          <span className="absolute right-0.5 top-0.5 flex h-[18px] w-[18px] items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>
      {showNotifs && (
        <div className={`overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)] shadow-pop z-[200] ${panelClass}`}>
          <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3.5">
            <span className="text-sm font-semibold text-[var(--text)]">Notifications</span>
            {unread > 0 && (
              <button onClick={markAllRead} className="text-xs font-semibold text-accent">Mark all read</button>
            )}
          </div>
          <div className="max-h-80 overflow-y-auto">
            {notifs.length === 0 ? (
              <div className="p-5 text-center text-[13px] text-[var(--text-muted)]">No notifications</div>
            ) : notifs.map(n => (
              <div key={n.id} className={'notif-item' + (n.is_read ? '' : ' notif-item-unread')}>
                <div className="text-[var(--text)]">{n.message}</div>
                <div className="mt-0.5 text-[11px] text-[var(--text-muted)]">{new Date(n.created_at).toLocaleString()}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );

  if (isMobile) {
    return (
      <div className="flex min-h-screen flex-col bg-page dark:bg-surface-dark">
        {/* Mobile top bar */}
        <header className="sticky top-0 z-[100] flex h-14 items-center justify-between bg-primary px-4 text-white shadow-md">
          <div>
            <div className="text-base font-extrabold">Sonic</div>
            <div className="text-[9px] uppercase tracking-[0.2em] text-accent-light">Marketing CRM</div>
          </div>
          <div className="flex items-center gap-1">
            <NotifBell panelClass="fixed right-2 top-16 w-[calc(100vw-16px)] max-w-[360px]" />
            <button
              onClick={() => setMenuOpen(v => !v)}
              className="rounded-lg bg-white/15 px-2.5 py-1.5 text-[13px] font-semibold text-white"
            >
              {user?.full_name?.split(' ')[0]} ▾
            </button>
          </div>
        </header>

        {/* User dropdown menu */}
        {menuOpen && (
          <div className="fixed right-2 top-14 z-[200] min-w-[180px] overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)] shadow-pop">
            <div className="border-b border-[var(--border)] px-4 py-3">
              <div className="text-[13px] font-semibold text-[var(--text)]">{user?.full_name}</div>
              <div className="text-[11px] uppercase text-[var(--text-muted)]">{user?.role?.replace('_', ' ')}</div>
            </div>
            <button
              onClick={() => { navigate('/'); setMenuOpen(false); }}
              className="block w-full border-b border-[var(--border)] px-4 py-3 text-left text-[13px] text-[var(--text)] hover:bg-[var(--surface-2)]"
            >
              ← Home
            </button>
            <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3 text-[13px] text-[var(--text)]">
              <span>Theme</span>
              <ThemeToggle className="rounded-lg px-2 py-1 text-base hover:bg-[var(--surface-2)]" />
            </div>
            <button
              onClick={handleLogout}
              className="block w-full px-4 py-3 text-left text-[13px] text-red-600 hover:bg-red-50 dark:hover:bg-red-500/10"
            >
              Logout
            </button>
          </div>
        )}

        {/* Page content */}
        <main className="flex-1 p-4 pb-20" onClick={() => { setMenuOpen(false); setShowNotifs(false); }}>
          <Outlet />
        </main>

        {/* Bottom navigation */}
        <nav className="fixed bottom-0 left-0 right-0 z-[100] flex h-16 bg-primary shadow-[0_-2px_12px_rgba(0,0,0,0.2)]">
          {navItems.map(item => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.exact}
              className={({ isActive }) =>
                `flex flex-1 flex-col items-center justify-center gap-0.5 border-t-2 text-[9px] font-semibold transition ${
                  isActive ? 'border-accent-light text-accent-light' : 'border-transparent text-white/55'
                }`
              }
            >
              <span className="text-xl">{item.icon}</span>
              {item.label}
            </NavLink>
          ))}
        </nav>
      </div>
    );
  }

  // Desktop layout
  return (
    <div className="flex min-h-screen bg-page dark:bg-surface-dark">
      <aside className="fixed top-0 left-0 z-[100] flex h-screen w-60 flex-col bg-gradient-to-b from-primary to-primary-dark text-white">
        <div className="border-b border-white/10 px-6 pt-7 pb-5">
          <div className="text-[22px] font-extrabold tracking-tight">Sonic</div>
          <div className="mt-0.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-accent-light">
            Marketing CRM
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4">
          {navItems.map(item => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.exact}
              className={({ isActive }) => 'nav-link' + (isActive ? ' nav-link-active' : '')}
            >
              <span className="text-base">{item.icon}</span>
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="border-t border-white/10 px-3 py-4">
          <div className="px-3.5 text-[11px] uppercase tracking-wide text-white/45">
            {user?.role?.replace('_', ' ')}
          </div>
          <div className="mb-3 truncate px-3.5 text-sm font-medium text-white">{user?.full_name}</div>
          <button
            onClick={() => navigate('/')}
            className="w-full rounded-lg bg-white/10 px-3 py-2 text-[13px] text-white/75 transition hover:bg-white/20"
          >
            ← Home
          </button>
        </div>
      </aside>

      <div className="ml-60 flex min-h-screen flex-1 min-w-0 flex-col overflow-hidden">
        <header className="sticky top-0 z-50 flex h-[60px] items-center justify-end gap-1 border-b border-[var(--border)] bg-[var(--surface)] px-7 shadow-soft">
          <ThemeToggle className="rounded-lg px-2 py-1.5 text-base text-[var(--text-muted)] transition hover:bg-[var(--surface-2)]" />
          <NotifBell panelClass="absolute right-0 top-11 w-[340px]" />
        </header>

        <main className="flex-1 overflow-hidden p-7">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
