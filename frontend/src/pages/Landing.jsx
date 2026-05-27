import { useNavigate } from 'react-router-dom';
import { useAuth } from '../AuthContext';
import { useState, useEffect } from 'react';
import api from '../api';
import useIsMobile from '../hooks/useIsMobile';
import NotificationBell from '../components/NotificationBell';
import usePermissions from '../hooks/usePermissions';

// Which permission resource controls each hub card (null => always visible).
const MODULE_RESOURCE = { crm: 'leads', tasks: 'team_tasks', calendar: 'calendar', hr: 'hr', video: 'video_studio', notes: null, settings: null };

const MODULES = [
  {
    key: 'crm', num: '01', icon: '📋', title: 'CRM',
    subtitle: 'Inquiries & Pipeline',
    desc: 'Manage client inquiries, track engagements through the pipeline and monitor your team.',
    bg: 'linear-gradient(145deg,#1c1c1c,#080808)', orbColor: '#cfcfcf', accentColor: '#e5e5e5',
    btnBg: 'rgba(255,255,255,0.10)',
    type: 'active', path: '/crm',
  },
  {
    key: 'tasks', num: '02', icon: '✅', title: 'Tasks',
    subtitle: 'Team Task Board',
    desc: 'Assign work to the team and track status, progress and deadlines to completion.',
    bg: 'linear-gradient(145deg,#202020,#0a0a0a)', orbColor: '#b5b5b5', accentColor: '#e5e5e5',
    btnBg: 'rgba(255,255,255,0.10)',
    type: 'active', path: '/team-tasks',
  },
  {
    key: 'calendar', num: '03', icon: '📅', title: 'Calendar',
    subtitle: 'Events & Deadlines',
    desc: 'Team events, client appointments and filing deadlines all in one place.',
    bg: 'linear-gradient(145deg,#232323,#0b0b0b)', orbColor: '#a8a8a8', accentColor: '#e0e0e0',
    btnBg: 'rgba(255,255,255,0.10)',
    type: 'active', path: '/calendar',
  },
  {
    key: 'hr', num: '04', icon: '👥', title: 'HR',
    subtitle: 'Human Resources',
    desc: 'Employee records, documents and full identity management for your team.',
    bg: 'linear-gradient(145deg,#171717,#000000)', orbColor: '#8f8f8f', accentColor: '#d8d8d8',
    btnBg: 'rgba(255,255,255,0.10)',
    type: 'restricted', path: '/hr',
  },
  {
    key: 'video', num: '05', icon: '🎬', title: 'Video Studio',
    subtitle: 'AI Video Generation',
    desc: 'Generate AI videos from text, an image, or first/last frames using Kling.',
    bg: 'linear-gradient(145deg,#1a1430,#0a0612)', orbColor: '#7c5cff', accentColor: '#c9b8ff',
    btnBg: 'rgba(124,92,255,0.18)',
    type: 'active', path: '/video-studio',
  },
  {
    key: 'notes', num: '06', icon: '📝', title: 'Notes',
    subtitle: 'Personal Notepad',
    desc: 'Create, name and edit your own note files — your private scratchpad.',
    bg: 'linear-gradient(145deg,#1e2417,#0a0d07)', orbColor: '#9ccc65', accentColor: '#d6e8c0',
    btnBg: 'rgba(156,204,101,0.16)',
    type: 'active', path: '/notes',
  },
  {
    key: 'settings', num: '07', icon: '⚙️', title: 'Settings',
    subtitle: 'Account & Management',
    desc: 'View your account, change your password and manage system users.',
    bg: 'linear-gradient(145deg,#2a2a2a,#0d0d0d)', orbColor: '#bdbdbd', accentColor: '#e5e5e5',
    btnBg: 'rgba(255,255,255,0.10)',
    type: 'active', path: '/settings',
  },
];

const ROLE_LABELS = {
  admin: 'Administrator',
  marketing_manager: 'Marketing Manager',
  marketing_specialist: 'Marketing Specialist',
  analyst: 'Marketing Analyst',
  social_media_specialist: 'Social Media Specialist',
  seo_specialist: 'SEO Specialist',
  wordpress_developer: 'WordPress Developer',
  graphic_designer: 'Graphic Designer',
  video_editor: 'Video Editor',
  hr_admin: 'HR Admin',
};

function Modal({ title, message, color, onClose }) {
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.5)', padding: 16 }}>
      <div onClick={e => e.stopPropagation()} style={{ maxWidth: 360, borderRadius: 20, borderTop: `4px solid ${color}`, background: 'var(--surface)', padding: '40px 48px', textAlign: 'center', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
        <div style={{ fontSize: 44, marginBottom: 16 }}>{title === 'No Permission' ? '🔒' : '🚧'}</div>
        <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--text)', marginBottom: 10 }}>{title}</div>
        <div style={{ fontSize: 14, color: 'var(--text-muted)', lineHeight: 1.6, marginBottom: 28 }}>{message}</div>
        <button onClick={onClose} style={{ background: color, color: '#fff', border: 'none', borderRadius: 10, padding: '10px 32px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>Got it</button>
      </div>
    </div>
  );
}

const signOut = () => { localStorage.removeItem('token'); localStorage.removeItem('user'); window.location.href = '/login'; };

function ModuleCard({ mod, onClick, user }) {
  const [hovered, setHovered] = useState(false);
  const isLocked = mod.type === 'restricted' && user?.role !== 'admin' && !(user?.role === 'hr_admin' && mod.key === 'hr');

  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        borderRadius: 20, padding: '28px 24px', cursor: 'pointer', position: 'relative', overflow: 'hidden',
        minHeight: 210, display: 'flex', flexDirection: 'column',
        background: mod.bg, border: '1px solid rgba(255,255,255,0.06)',
        transform: hovered ? 'translateY(-5px)' : 'none',
        boxShadow: hovered ? '0 24px 60px rgba(0,0,0,0.25)' : 'none',
        transition: 'transform 0.2s, box-shadow 0.2s',
      }}
    >
      <div style={{ position: 'absolute', bottom: -30, right: -30, width: 110, height: 110, borderRadius: '50%', background: mod.orbColor, opacity: 0.18, pointerEvents: 'none' }} />
      {isLocked && (
        <div style={{ position: 'absolute', top: 14, right: 14, fontSize: 9, fontWeight: 800, letterSpacing: 0.8, textTransform: 'uppercase', padding: '3px 9px', borderRadius: 8, background: 'rgba(217,119,6,0.15)', color: '#F59E0B' }}>Admin Only</div>
      )}
      <div style={{ fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,0.18)', letterSpacing: 3, marginBottom: 18 }}>{mod.num}</div>
      <div style={{ fontSize: 30, marginBottom: 14 }}>{mod.icon}</div>
      <div style={{ fontSize: 19, fontWeight: 900, color: '#fff', letterSpacing: -0.4, marginBottom: 4 }}>{mod.title}</div>
      <div style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 10, opacity: 0.55, color: mod.accentColor }}>{mod.subtitle}</div>
      <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', lineHeight: 1.65, flex: 1 }}>{mod.desc}</div>
      <div style={{ marginTop: 18, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <button style={{ fontSize: 11, fontWeight: 800, padding: '7px 14px', borderRadius: 8, border: 'none', cursor: 'pointer', background: mod.btnBg, color: mod.accentColor }}>
          Open {mod.title} →
        </button>
        <span style={{ fontSize: 16, color: 'rgba(255,255,255,0.25)' }}>›</span>
      </div>
    </div>
  );
}

export default function Landing() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { can, loading: permsLoading } = usePermissions();
  const isMobile = useIsMobile();
  const [modal, setModal] = useState(null);
  const [stats, setStats] = useState({ leads: '—', partners: '—', team: '—' });

  // Show only modules the user can access (settings always visible). While
  // permissions load, show all to avoid a flash of an empty hub.
  const canSeeModule = (mod) => {
    const res = MODULE_RESOURCE[mod.key];
    return !res || can(res, 'read');
  };
  const visibleModules = permsLoading ? MODULES : MODULES.filter(canSeeModule);

  useEffect(() => {
    Promise.allSettled([
      api.get('/api/dashboard/stats'),
      api.get('/api/partners'),
      api.get('/api/users'),
    ]).then(([dash, partners, users]) => {
      setStats({
        leads: dash.status === 'fulfilled' ? (dash.value.data?.total_leads ?? '—') : '—',
        partners: partners.status === 'fulfilled' ? (partners.value.data?.length ?? '—') : '—',
        team: users.status === 'fulfilled' ? (users.value.data?.length ?? '—') : '—',
      });
    });
  }, []);

  const handleClick = (mod) => {
    if (mod.type === 'active') { navigate(mod.path); return; }
    if (mod.type === 'restricted') {
      if (user?.role === 'admin') { navigate(mod.path); return; }
      if (user?.role === 'hr_admin' && mod.key === 'hr') { navigate(mod.path); return; }
      setModal({ title: 'No Permission', message: "You don't have permission to access this module. Contact your administrator.", color: '#111111' });
      return;
    }
    if (mod.type === 'coming_soon') {
      setModal({ title: 'Under Development', message: `The ${mod.title} module is currently being built and will be available soon.`, color: '#6366f1' });
    }
  };

  const heroStats = [
    { label: 'Active Inquiries', value: stats.leads },
    { label: 'Referral Partners', value: stats.partners },
    { label: 'Team Members', value: stats.team },
  ];

  // ── MOBILE ──────────────────────────────────────────────
  if (isMobile) {
    return (
      <div className="flex min-h-screen flex-col bg-page dark:bg-surface-dark">
        {modal && <Modal {...modal} onClose={() => setModal(null)} />}

        <div className="sticky top-0 z-50 border-b border-white/[0.06] bg-gradient-to-b from-primary to-primary-dark px-5 pb-4 pt-5">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white text-base font-black text-primary">S</div>
              <div>
                <div className="text-base font-black tracking-tight text-white">Sonic Marketing</div>
                <div className="text-[8px] uppercase tracking-[2px] text-accent-light">Marketing Agency CRM</div>
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              <NotificationBell panelClass="fixed right-2 top-16 w-[calc(100vw-16px)] max-w-[360px]" />
              <button onClick={signOut} className="rounded-lg border border-white/12 bg-white/[0.07] px-3 py-1.5 text-xs text-white/50">Sign out</button>
            </div>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <div className="mb-0.5 text-[13px] text-white/40">Welcome back</div>
              <div className="text-xl font-extrabold text-white">{user?.full_name}</div>
            </div>
            <span className="inline-block rounded-full border border-accent-light/30 bg-accent-light/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest text-accent-light">
              {ROLE_LABELS[user?.role] || user?.role}
            </span>
          </div>

          <div className="mt-3.5 flex gap-2.5">
            {[{ label: 'Inquiries', value: stats.leads }, { label: 'Partners', value: stats.partners }, { label: 'Team', value: stats.team }].map(s => (
              <div key={s.label} className="flex-1 rounded-xl border border-white/[0.07] bg-white/5 px-2 py-2.5 text-center">
                <div className="text-lg font-black text-accent-light">{s.value}</div>
                <div className="mt-0.5 text-[10px] text-white/40">{s.label}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-5">
          <div className="mb-3.5 text-[11px] font-bold uppercase tracking-[2px] text-[var(--text-muted)]">Select a module</div>
          <div className="flex flex-col gap-3">
            {visibleModules.map(mod => {
              const isLocked = mod.type === 'restricted' && user?.role !== 'admin' && !(user?.role === 'hr_admin' && mod.key === 'hr');
              return (
                <div key={mod.key} onClick={() => handleClick(mod)}
                  style={{ background: mod.bg }}
                  className="flex min-h-20 items-center gap-4 overflow-hidden rounded-2xl border border-white/[0.06] px-5 py-5 cursor-pointer">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-2xl">{mod.icon}</div>
                  <div className="min-w-0 flex-1">
                    <div className="text-base font-black tracking-tight text-white">{mod.title}</div>
                    <div className="mt-0.5 text-[10px] font-bold uppercase tracking-wide" style={{ color: mod.accentColor }}>{mod.subtitle}</div>
                  </div>
                  {isLocked ? (
                    <div className="shrink-0 text-base">🔒</div>
                  ) : (
                    <div className="shrink-0 text-lg text-white/30">›</div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  // ── DESKTOP ──────────────────────────────────────────────
  return (
    <div style={{ minHeight: '100vh', background: 'var(--page-bg, #FAFBFA)', fontFamily: "'Segoe UI', system-ui, sans-serif" }}>
      {modal && <Modal {...modal} onClose={() => setModal(null)} />}

      {/* Top Nav */}
      <nav style={{ background: 'var(--surface, #fff)', borderBottom: '1px solid var(--border, #E8EDE9)', padding: '0 48px', height: 64, display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, zIndex: 10, boxShadow: '0 1px 8px rgba(0,0,0,0.04)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ width: 36, height: 36, borderRadius: 9, background: '#111111', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: 900, color: '#fff' }}>S</div>
          <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--text, #141414)', letterSpacing: '-0.2px' }}>Sonic Marketing</div>
          <div style={{ width: 1, height: 20, background: 'var(--border, #E8EDE9)' }} />
          <div style={{ fontSize: 13, color: 'var(--text-muted, #9CA3AF)' }}>Dashboard</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <NotificationBell panelClass="absolute right-0 top-12 w-[360px]" />
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text, #141414)' }}>{user?.full_name}</div>
            <div style={{ fontSize: 10, color: '#6B6B6B', fontWeight: 600 }}>{ROLE_LABELS[user?.role] || user?.role}</div>
          </div>
          <div style={{ width: 34, height: 34, borderRadius: '50%', background: 'linear-gradient(135deg,#2b2b2b,#555555)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 800, color: '#fff' }}>
            {user?.full_name?.[0]?.toUpperCase() || 'U'}
          </div>
          <button onClick={signOut} style={{ padding: '7px 14px', background: 'var(--surface-2, #F3F6F4)', border: 'none', borderRadius: 8, fontSize: 12, color: 'var(--text-muted, #6B7280)', cursor: 'pointer', fontWeight: 600 }}>
            Sign out
          </button>
        </div>
      </nav>

      {/* Hero */}
      <div style={{ background: '#0A0A0A', padding: '48px 48px 0', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', top: -80, right: -80, width: 320, height: 320, borderRadius: '50%', background: 'rgba(255,255,255,0.06)', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', bottom: -60, left: '25%', width: 220, height: 220, borderRadius: '50%', background: 'rgba(255,255,255,0.04)', pointerEvents: 'none' }} />
        <div style={{ position: 'relative', zIndex: 1 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,0.55)', letterSpacing: '2.5px', textTransform: 'uppercase', marginBottom: 10 }}>
            Good morning, {user?.full_name?.split(' ')[0]}
          </div>
          <div style={{ fontSize: 32, fontWeight: 900, color: '#fff', letterSpacing: '-0.8px', marginBottom: 6 }}>Sonic CRM</div>
          <div style={{ fontSize: 13.5, color: 'rgba(255,255,255,0.38)', marginBottom: 40 }}>
            Your marketing agency management platform — all modules in one place.
          </div>
        </div>
        <div style={{ display: 'flex' }}>
          {heroStats.map((s, i) => (
            <div key={s.label} style={{
              padding: '18px 36px',
              borderTop: '1px solid rgba(255,255,255,0.07)',
              borderRight: '1px solid rgba(255,255,255,0.07)',
              ...(i === 0 ? { borderLeft: '1px solid rgba(255,255,255,0.07)' } : {}),
            }}>
              <div style={{ fontSize: 26, fontWeight: 900, color: '#e5e5e5' }}>{s.value}</div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', marginTop: 2 }}>{s.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Modules grid */}
      <div style={{ padding: '36px 48px 48px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted, #9CA3AF)', letterSpacing: 2, textTransform: 'uppercase' }}>Modules</div>
          <div style={{ fontSize: 11, color: 'var(--text-muted, #9CA3AF)' }}>{visibleModules.length} modules</div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 14 }}>
          {visibleModules.map(mod => (
            <ModuleCard key={mod.key} mod={mod} onClick={() => handleClick(mod)} user={user} />
          ))}
        </div>
      </div>
    </div>
  );
}
