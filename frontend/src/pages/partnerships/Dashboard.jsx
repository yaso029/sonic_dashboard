import { useEffect, useState } from 'react';
import api from '../../api';

const SUGGESTION_LABELS = { interested: 'Interested', not_interested: 'Not Interested', has_client: 'Has Client' };
// Data-driven AI-suggestion hues (applied inline below).
const SUGGESTION_COLORS = { interested: '#10b981', not_interested: '#ef4444', has_client: '#f59e0b' };

export default function PartnershipsDashboard() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/api/partnerships/dashboard')
      .then(r => setStats(r.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="p-10 text-center text-[var(--text-muted)]">Loading dashboard...</div>;
  if (!stats) return <div className="p-10 text-center text-[var(--text-muted)]">Failed to load</div>;

  const statCards = [
    { label: 'Total Partners', value: stats.total_partners, icon: '👥' },
    { label: 'Active Partners', value: stats.active_partners, icon: '✅' },
    { label: 'Messages Today', value: stats.messages_sent_today, icon: '📤', sub: `${stats.whatsapp_sent_today} WA · ${stats.email_sent_today} Email` },
    { label: 'Replies Today', value: stats.replies_today, icon: '💬' },
    { label: 'Leads This Month', value: stats.leads_this_month, icon: '🎯' },
    { label: 'Commission Owed', value: `AED ${Number(stats.commission_owed).toLocaleString()}`, icon: '💰' },
    { label: 'Commission Paid', value: `AED ${Number(stats.commission_paid).toLocaleString()}`, icon: '💵' },
    { label: 'This Month Revenue', value: `AED ${Number(stats.commission_this_month).toLocaleString()}`, icon: '📈' },
  ];

  return (
    <div>
      <div className="mb-7">
        <h1 className="page-title">Partnerships Dashboard</h1>
        <p className="page-subtitle">Overview of your referral partner program</p>
      </div>

      {/* Stats grid */}
      <div className="mb-8 grid grid-cols-2 gap-4 md:grid-cols-4">
        {statCards.map(s => (
          <div key={s.label} className="stat-card border-t-4 border-t-accent">
            <div className="mb-2 text-2xl">{s.icon}</div>
            <div className="stat-label">{s.label}</div>
            <div className="stat-value">{s.value}</div>
            {s.sub && <div className="mt-1 text-[11px] text-[var(--text-muted)]">{s.sub}</div>}
          </div>
        ))}
      </div>

      {/* Recent Activity */}
      <div className="card overflow-hidden">
        <div className="border-b border-[var(--border)] px-6 py-[18px] text-base font-bold text-[var(--text)]">
          Recent Activity
        </div>
        <div className="max-h-[400px] overflow-y-auto">
          {stats.recent_activity.length === 0 ? (
            <div className="p-[30px] text-center text-[var(--text-muted)]">No recent activity</div>
          ) : stats.recent_activity.map((a, i) => (
            <div key={i} className="flex items-center gap-3.5 border-b border-[var(--border)] px-6 py-3.5">
              <div className="text-[22px]">
                {a.type === 'message_sent' ? (a.channel === 'whatsapp' ? '📱' : '📧') : '💬'}
              </div>
              <div className="flex-1">
                <div className="text-[13px] font-semibold text-[var(--text)]">
                  {a.type === 'message_sent'
                    ? `${a.channel === 'whatsapp' ? 'WhatsApp' : 'Email'} sent to ${a.partner_name}`
                    : `Reply from ${a.partner_name}`}
                </div>
                {a.message && <div className="mt-0.5 text-xs text-[var(--text-muted)]">"{a.message}"</div>}
                {a.ai_suggestion && (
                  <span className="mt-1 inline-block rounded-full px-2 py-px text-[10px] font-semibold"
                    style={{ background: `${SUGGESTION_COLORS[a.ai_suggestion]}20`, color: SUGGESTION_COLORS[a.ai_suggestion] }}>
                    {SUGGESTION_LABELS[a.ai_suggestion]}
                  </span>
                )}
              </div>
              <div className="whitespace-nowrap text-[11px] text-[var(--text-muted)]">
                {a.time ? new Date(a.time).toLocaleString() : ''}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
