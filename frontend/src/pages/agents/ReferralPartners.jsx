import { useState, useEffect } from 'react';
import api from '../../api';
import { useAuth } from '../../AuthContext';
import toast from 'react-hot-toast';

// Data-driven status hues (per application status).
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

function ApplicationCard({ app, onStatusChange }) {
  const [open, setOpen] = useState(false);
  const langLabel = app.language === 'ar' ? '🇦🇪 Arabic' : '🇬🇧 English';

  return (
    <div className="card mb-3 overflow-hidden p-0">
      <div onClick={() => setOpen(o => !o)} className="flex cursor-pointer items-center gap-4 px-5 py-4">
        <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full bg-primary text-lg font-bold text-white">
          {app.full_name?.[0]?.toUpperCase() || '?'}
        </div>
        <div className="flex-1">
          <div className="text-[15px] font-bold text-[var(--text)]">{app.full_name}</div>
          <div className="mt-0.5 text-xs text-[var(--text-muted)]">{app.phone} {app.job ? `· ${app.job}` : ''}</div>
        </div>
        <StatusBadge status={app.status} />
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

          <div>
            <div className="mb-2 text-[11px] font-bold uppercase tracking-wide text-[var(--text-muted)]">Update Status</div>
            <div className="flex flex-wrap gap-2">
              {STATUSES.map(s => {
                const active = app.status === s.value;
                return (
                  <button key={s.value} onClick={() => onStatusChange(app.id, s.value)}
                    className={`rounded-lg border-[1.5px] px-4 py-1.5 text-xs font-bold ${active ? '' : 'border-[var(--border)] bg-[var(--surface)] text-[var(--text-muted)]'}`}
                    style={active ? { borderColor: s.color, background: s.bg, color: s.color } : undefined}>
                    {s.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function ReferralPartners() {
  const { user } = useAuth();
  const [apps, setApps] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');

  useEffect(() => {
    api.get('/api/referral-applications')
      .then(r => setApps(r.data))
      .catch(() => toast.error('Failed to load referral partners'))
      .finally(() => setLoading(false));
  }, []);

  async function handleStatusChange(id, status) {
    try {
      const { data } = await api.patch(`/api/referral-applications/${id}`, { status });
      setApps(prev => prev.map(a => a.id === id ? data : a));
      toast.success('Status updated');
    } catch {
      toast.error('Failed to update status');
    }
  }

  const filtered = apps.filter(a =>
    !filter || a.status === filter
  );

  if (loading) return <div className="p-10 text-center text-[var(--text-muted)]">Loading...</div>;

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="page-title">Referral Partners</h1>
          <p className="page-subtitle">Partners assigned to you from the referral form</p>
        </div>
        <div className="rounded-[10px] bg-primary px-3.5 py-1.5 text-center">
          <div className="text-[22px] font-black text-white">{apps.length}</div>
          <div className="text-[9px] uppercase tracking-widest text-white/50">Assigned</div>
        </div>
      </div>

      {/* Status filter */}
      <div className="mb-5 flex flex-wrap gap-2">
        {[{ value: '', label: 'All' }, ...STATUSES].map(s => {
          const active = filter === s.value;
          return (
            <button key={s.value} onClick={() => setFilter(s.value)}
              className={`rounded-lg border-[1.5px] px-4 py-1.5 text-xs font-bold ${active ? 'border-primary bg-primary text-white dark:border-accent-light dark:bg-accent-light dark:text-primary' : 'border-[var(--border)] bg-[var(--surface)] text-[var(--text-muted)]'}`}>
              {s.label}
            </button>
          );
        })}
      </div>

      {filtered.length === 0 ? (
        <div className="px-5 py-16 text-center text-[var(--text-muted)]">
          <div className="mb-3 text-[40px]">🤝</div>
          <div className="text-[15px] font-semibold text-[var(--text)]">No referral partners yet</div>
          <div className="mt-1 text-[13px]">Partners assigned to you will appear here</div>
        </div>
      ) : (
        filtered.map(app => (
          <ApplicationCard key={app.id} app={app} onStatusChange={handleStatusChange} />
        ))
      )}
    </div>
  );
}
