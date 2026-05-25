import { useEffect, useState } from 'react';
import { useAuth } from '../AuthContext';
import api from '../api';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import useIsMobile from '../hooks/useIsMobile';

// Chart series colours (data-driven — one hue per pipeline stage).
const STAGE_COLORS = {
  inquiry: '#6366f1', discovery_call: '#3b82f6', documents_requested: '#f59e0b',
  documents_received: '#8b5cf6', in_progress: '#06b6d4', review: '#7c3aed',
  completed: '#10b981', monthly_retainer: '#0d7377', lost: '#ef4444',
};

const STAGE_LABELS = {
  inquiry: 'Inquiry', discovery_call: 'Discovery Call', documents_requested: 'Docs Requested',
  documents_received: 'Docs Received', in_progress: 'In Progress', review: 'Review',
  completed: 'Completed', monthly_retainer: 'Monthly Retainer', lost: 'Lost',
};

// Top-accent tones for the KPI cards (Tailwind classes, no inline colour).
const TONES = {
  primary: 'border-t-primary',
  indigo: 'border-t-indigo-500',
  blue: 'border-t-blue-500',
  emerald: 'border-t-emerald-500',
  red: 'border-t-red-500',
};

function StatCard({ label, value, tone = 'primary', icon }) {
  return (
    <div className={`stat-card min-w-[140px] flex-1 border-t-[3px] ${TONES[tone]}`}>
      <div className="text-[26px] leading-none">{icon}</div>
      <div className="stat-value">{value}</div>
      <div className="text-[13px] text-[var(--text-muted)]">{label}</div>
    </div>
  );
}

function ChartCard({ title, children }) {
  return (
    <div className="card p-6">
      <h3 className="mb-4 text-[15px] font-semibold text-[var(--text)]">{title}</h3>
      {children}
    </div>
  );
}

export default function DashboardPage() {
  const { user } = useAuth();
  const isMobile = useIsMobile();
  const [stats, setStats] = useState(null);
  const [adminData, setAdminData] = useState(null);

  useEffect(() => {
    api.get('/api/dashboard/stats').then(r => setStats(r.data)).catch(() => {});
    if (user?.role === 'admin') {
      api.get('/api/dashboard/admin').then(r => setAdminData(r.data)).catch(() => {});
    }
  }, [user]);

  if (!stats) return <div className="p-10 text-[var(--text-muted)]">Loading…</div>;

  const stageData = (stats.stage_breakdown || []).map(s => ({
    name: STAGE_LABELS[s.stage] || s.stage,
    value: s.count,
    color: STAGE_COLORS[s.stage] || '#ccc',
  }));

  return (
    <div>
      <div className="mb-7">
        <h1 className="page-title">Welcome back, {user?.full_name?.split(' ')[0]} 👋</h1>
        <p className="page-subtitle">Here's what's happening with your leads today.</p>
      </div>

      {/* KPI cards */}
      <div className="mb-7 flex flex-wrap gap-4">
        <StatCard label="Total Inquiries" value={stats.total_leads} tone="primary" icon="📋" />
        <StatCard label="New" value={stats.new_leads} tone="indigo" icon="✨" />
        <StatCard label="Active Engagements" value={stats.active_leads} tone="blue" icon="🔥" />
        <StatCard label="Won / Retainer" value={stats.closed_won || 0} tone="emerald" icon="✅" />
        <StatCard label="Lost" value={stats.closed_lost || 0} tone="red" icon="❌" />
      </div>

      <div className={`mb-7 grid gap-5 ${isMobile ? 'grid-cols-1' : 'grid-cols-2'}`}>
        <ChartCard title="Leads by Stage">
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={stageData}>
              <XAxis dataKey="name" tick={{ fontSize: isMobile ? 9 : 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip cursor={{ fill: 'rgba(0,0,0,0.06)' }} />
              <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                {stageData.map((entry, i) => (
                  <Cell key={i} fill={entry.color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Stage Distribution">
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie data={stageData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={70} label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                {stageData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* Admin section */}
      {adminData && (
        <div className={`grid gap-5 ${isMobile ? 'grid-cols-1' : 'grid-cols-2'}`}>
          <div className="card p-6">
            <h3 className="mb-4 text-[15px] font-semibold text-[var(--text)]">Marketing Specialist Performance</h3>
            {adminData.specialist_performance?.map(a => (
              <div key={a.id} className="flex items-center justify-between border-b border-[var(--border)] py-2.5 last:border-0">
                <span className="text-sm text-[var(--text)]">{a.name}</span>
                <span className="rounded-full bg-primary px-2.5 py-0.5 text-xs font-semibold text-white">
                  {a.lead_count} inquiries
                </span>
              </div>
            ))}
          </div>
          <div className="card p-6">
            <h3 className="mb-4 text-[15px] font-semibold text-[var(--text)]">Lead Sources</h3>
            {adminData.source_breakdown?.map(s => (
              <div key={s.source} className="flex items-center justify-between border-b border-[var(--border)] py-2.5 last:border-0">
                <span className="text-sm text-[var(--text)]">{s.source}</span>
                <span className="rounded-full bg-accent-soft px-2.5 py-0.5 text-xs font-semibold text-accent dark:bg-accent/15">
                  {s.count}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
