import { useState, useEffect } from 'react';
import api from '../../api';
import toast from 'react-hot-toast';

// Per-status hues (data-driven: applied inline on badges / cards / buttons below).
const STATUSES = [
  { value: 'interested', label: 'Interested', color: '#F59E0B', bg: '#FEF3C7' },
  { value: 'registered', label: 'Registered', color: '#3B82F6', bg: '#EFF6FF' },
  { value: 'signed_agreement', label: 'Signed Agreement', color: '#8B5CF6', bg: '#F5F3FF' },
  { value: 'start_referring', label: 'Start Referring', color: '#10B981', bg: '#ECFDF5' },
];

const NATIONALITY_LABELS = {
  AE: '🇦🇪 UAE', SA: '🇸🇦 Saudi Arabia', KW: '🇰🇼 Kuwait', QA: '🇶🇦 Qatar',
  BH: '🇧🇭 Bahrain', OM: '🇴🇲 Oman', EG: '🇪🇬 Egypt', LB: '🇱🇧 Lebanon',
  JO: '🇯🇴 Jordan', IN: '🇮🇳 India', PK: '🇵🇰 Pakistan', PH: '🇵🇭 Philippines',
  CN: '🇨🇳 China', TR: '🇹🇷 Turkey', RU: '🇷🇺 Russia', GB: '🇬🇧 UK',
  FR: '🇫🇷 France', DE: '🇩🇪 Germany', US: '🇺🇸 USA', AU: '🇦🇺 Australia',
  NG: '🇳🇬 Nigeria', OTHER: '🌍 Other',
};

function StatusBadge({ status }) {
  const s = STATUSES.find(x => x.value === status) || STATUSES[0];
  return (
    <span className="rounded-full px-3 py-1 text-[11px] font-bold" style={{ background: s.bg, color: s.color }}>
      {s.label}
    </span>
  );
}

function ApplicationCard({ app, agents, onUpdate }) {
  const [open, setOpen] = useState(false);
  const langLabel = app.language === 'ar' ? '🇦🇪 Arabic' : '🇬🇧 English';

  async function changeStatus(status) {
    try {
      const { data } = await api.patch(`/api/referral-applications/${app.id}`, { status });
      onUpdate(data);
      toast.success('Status updated');
    } catch { toast.error('Failed'); }
  }

  async function assignTo(agentId) {
    try {
      const { data } = await api.patch(`/api/referral-applications/${app.id}`, { assigned_to: agentId ? parseInt(agentId) : null });
      onUpdate(data);
      toast.success('Assigned');
    } catch { toast.error('Failed to assign'); }
  }

  return (
    <div className="card mb-3 overflow-hidden">
      <div onClick={() => setOpen(o => !o)} className="flex cursor-pointer items-center gap-4 px-5 py-4">
        <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary to-secondary text-lg font-bold text-white">
          {app.full_name?.[0]?.toUpperCase() || '?'}
        </div>
        <div className="flex-1">
          <div className="text-[15px] font-bold text-[var(--text)]">{app.full_name}</div>
          <div className="mt-0.5 text-xs text-[var(--text-muted)]">{app.phone} {app.job ? `· ${app.job}` : ''}</div>
        </div>
        <div className="flex items-center gap-2">
          {app.assigned_to_name && (
            <span className="rounded-md bg-[var(--surface-2)] px-2.5 py-[3px] text-[11px] text-[var(--text-muted)]">
              👤 {app.assigned_to_name}
            </span>
          )}
          <StatusBadge status={app.status} />
        </div>
        <span className="text-sm text-[var(--text-muted)]">{open ? '▲' : '▼'}</span>
      </div>

      {open && (
        <div className="border-t border-[var(--border)] px-5 pb-5">
          <div className="mb-5 mt-4 grid grid-cols-2 gap-x-6 gap-y-2">
            {[
              ['Phone', app.phone],
              ['Email', app.email || '—'],
              ['Job', app.job || '—'],
              ['Nationality', NATIONALITY_LABELS[app.nationality] || app.nationality || '—'],
              ['Language', langLabel],
              ['Agreed to Terms', app.agreed_to_terms ? '✅ Yes' : '❌ No'],
              ['Submitted', app.created_at ? new Date(app.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'],
            ].map(([k, v]) => (
              <div key={k}>
                <div className="text-[10px] font-bold uppercase tracking-wide text-[var(--text-muted)]">{k}</div>
                <div className="mt-0.5 text-[13px] font-medium text-[var(--text)]">{v}</div>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="mb-2 text-[11px] font-bold uppercase tracking-wide text-[var(--text-muted)]">Status</div>
              <div className="flex flex-col gap-1.5">
                {STATUSES.map(s => {
                  const active = app.status === s.value;
                  return (
                    <button key={s.value} onClick={() => changeStatus(s.value)}
                      className="rounded-lg border-[1.5px] px-3.5 py-2 text-left text-xs font-bold"
                      style={active
                        ? { borderColor: s.color, background: s.bg, color: s.color }
                        : { borderColor: 'var(--border)', background: 'var(--surface)', color: 'var(--text-muted)' }}>
                      {active ? '● ' : '○ '}{s.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <div className="mb-2 text-[11px] font-bold uppercase tracking-wide text-[var(--text-muted)]">Assign to Agent</div>
              <select
                value={app.assigned_to || ''}
                onChange={e => assignTo(e.target.value)}
                className="input">
                <option value="">Unassigned</option>
                {agents.map(a => <option key={a.id} value={a.id}>{a.full_name}</option>)}
              </select>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function ReferralApplications() {
  const [apps, setApps] = useState([]);
  const [agents, setAgents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');

  useEffect(() => {
    Promise.all([
      api.get('/api/referral-applications'),
      api.get('/api/users'),
    ]).then(([appsRes, usersRes]) => {
      setApps(appsRes.data);
      setAgents((usersRes.data || []).filter(u => u.is_active));
    }).catch(() => toast.error('Failed to load applications'))
      .finally(() => setLoading(false));
  }, []);

  function handleUpdate(updated) {
    setApps(prev => prev.map(a => a.id === updated.id ? updated : a));
  }

  const filtered = filter ? apps.filter(a => a.status === filter) : apps;
  const counts = STATUSES.reduce((acc, s) => ({ ...acc, [s.value]: apps.filter(a => a.status === s.value).length }), {});

  if (loading) return <div className="p-10 text-center text-[var(--text-muted)]">Loading...</div>;

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="page-title">Referral Applications</h1>
          <p className="page-subtitle">People who applied through the referral partner form</p>
        </div>
        <div className="rounded-[10px] bg-primary px-3.5 py-1.5 text-center">
          <div className="text-[22px] font-black text-white">{apps.length}</div>
          <div className="text-[9px] uppercase tracking-widest text-white/50">Total</div>
        </div>
      </div>

      {/* Summary cards */}
      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        {STATUSES.map(s => {
          const active = filter === s.value;
          return (
            <div key={s.value} onClick={() => setFilter(active ? '' : s.value)}
              className="cursor-pointer rounded-xl border-[1.5px] p-4 transition-all"
              style={active
                ? { background: s.bg, borderColor: s.color }
                : { background: 'var(--surface)', borderColor: 'var(--border)' }}>
              <div className="text-[22px] font-black" style={{ color: s.color }}>{counts[s.value] || 0}</div>
              <div className="mt-0.5 text-xs font-bold text-[var(--text-muted)]">{s.label}</div>
            </div>
          );
        })}
      </div>

      {filtered.length === 0 ? (
        <div className="px-5 py-16 text-center text-[var(--text-muted)]">
          <div className="mb-3 text-4xl">🤝</div>
          <div className="text-[15px] font-semibold">No applications yet</div>
          <div className="mt-1 text-[13px]">Share your referral form link to start receiving applications</div>
        </div>
      ) : (
        filtered.map(app => (
          <ApplicationCard key={app.id} app={app} agents={agents} onUpdate={handleUpdate} />
        ))
      )}
    </div>
  );
}
