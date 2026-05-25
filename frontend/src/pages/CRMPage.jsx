import { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api';
import toast from 'react-hot-toast';
import { useAuth } from '../AuthContext';
import usePermissions from '../hooks/usePermissions';
import ImportModal from '../components/ImportModal';
import useIsMobile from '../hooks/useIsMobile';

const STAGE_COLORS = {
  inquiry: '#6366f1',
  discovery_call: '#3b82f6',
  documents_requested: '#f59e0b',
  documents_received: '#8b5cf6',
  in_progress: '#06b6d4',
  review: '#7c3aed',
  completed: '#10b981',
  monthly_retainer: '#0d7377',
  lost: '#ef4444',
};

const STAGE_LABELS = {
  inquiry: 'Inquiry',
  discovery_call: 'Discovery Call',
  documents_requested: 'Docs Requested',
  documents_received: 'Docs Received',
  in_progress: 'In Progress',
  review: 'Review',
  completed: 'Completed',
  monthly_retainer: 'Monthly Retainer',
  lost: 'Lost',
};

const STAGES = Object.keys(STAGE_LABELS);
const SOURCES = ['Website', 'WhatsApp', 'Referral', 'LinkedIn', 'Walk-in', 'Email', 'Phone', 'Other'];

function StageBadge({ stage }) {
  const color = STAGE_COLORS[stage] || '#888';
  return (
    <span style={{ background: `${color}20`, color, padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap' }}>
      {STAGE_LABELS[stage] || stage}
    </span>
  );
}

// ── ADD LEAD MODAL ────────────────────────────────────────────
function AddLeadModal({ onClose, onAdded, teamMembers }) {
  const { user } = useAuth();
  const [form, setForm] = useState({ full_name: '', phone: '', email: '', company: '', source: 'Other', estimated_value: '', notes: '', assigned_to: '' });
  const [loading, setLoading] = useState(false);
  const [customSource, setCustomSource] = useState('');
  const [isCustomSource, setIsCustomSource] = useState(false);

  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }));

  const handleSourceChange = e => {
    if (e.target.value === '__custom__') {
      setIsCustomSource(true);
      setForm(f => ({ ...f, source: '' }));
    } else {
      setIsCustomSource(false);
      setCustomSource('');
      setForm(f => ({ ...f, source: e.target.value }));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const resolvedSource = isCustomSource ? customSource.trim() || 'Other' : form.source;
      const payload = { ...form, source: resolvedSource, assigned_to: form.assigned_to ? parseInt(form.assigned_to) : undefined };
      const { data } = await api.post('/api/leads', payload);
      onAdded(data);
      toast.success('Lead added!');
      onClose();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to add lead');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal w-[480px] max-h-[85vh] overflow-y-auto p-7">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-lg font-bold text-[var(--text)]">Add New Lead</h2>
          <button onClick={onClose} className="text-xl text-[var(--text-muted)] hover:text-[var(--text)]">×</button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="grid grid-cols-2 gap-x-4">
            <div className="mb-3"><label className="label">Full Name *</label><input className="input" value={form.full_name} onChange={set('full_name')} required /></div>
            <div className="mb-3"><label className="label">Phone *</label><input className="input" value={form.phone} onChange={set('phone')} required /></div>
            <div className="mb-3"><label className="label">Email</label><input className="input" type="email" value={form.email} onChange={set('email')} /></div>
            <div className="mb-3">
              <label className="label">Source</label>
              <select className="input" value={isCustomSource ? '__custom__' : form.source} onChange={handleSourceChange}>
                {SOURCES.map(s => <option key={s} value={s}>{s}</option>)}
                <option value="__custom__">＋ Add new source...</option>
              </select>
              {isCustomSource && (
                <input className="input mt-2 border-accent" placeholder="Type source name..." value={customSource} onChange={e => setCustomSource(e.target.value)} autoFocus />
              )}
            </div>
            <div className="mb-3"><label className="label">Company</label><input className="input" value={form.company} onChange={set('company')} placeholder="Company name" /></div>
            <div className="mb-3"><label className="label">Estimated Value</label><input className="input" value={form.estimated_value} onChange={set('estimated_value')} placeholder="e.g. AED 30,000/year" /></div>
            {(user?.role === 'admin' || user?.role === 'marketing_manager') && teamMembers.length > 0 && (
              <div className="col-span-2 mb-3">
                <label className="label">Assign To</label>
                <select className="input" value={form.assigned_to} onChange={set('assigned_to')}>
                  <option value="">Self</option>
                  {teamMembers.map(m => <option key={m.id} value={m.id}>{m.full_name}</option>)}
                </select>
              </div>
            )}
            <div className="col-span-2 mb-3"><label className="label">Notes</label><textarea className="input min-h-[70px] resize-y" value={form.notes} onChange={set('notes')} /></div>
          </div>
          <div className="mt-1 flex justify-end gap-2.5">
            <button type="button" onClick={onClose} className="btn btn-ghost">Cancel</button>
            <button type="submit" disabled={loading} className="btn btn-primary">{loading ? 'Adding...' : 'Add Lead'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── DASHBOARD TAB ─────────────────────────────────────────────
function DashboardTab({ leads, dashStats }) {
  const navigate = useNavigate();

  const kpis = useMemo(() => {
    const active = leads.filter(l => !['completed', 'lost', 'monthly_retainer'].includes(l.stage)).length;
    const completed = leads.filter(l => l.stage === 'completed').length;
    const retainers = leads.filter(l => l.stage === 'monthly_retainer').length;
    return [
      { label: 'Total Leads', value: leads.length, icon: '📋', color: '#6366f1' },
      { label: 'Active Pipeline', value: active, icon: '🔥', color: '#06b6d4' },
      { label: 'Completed', value: completed, icon: '✅', color: '#10b981' },
      { label: 'Retainers', value: retainers, icon: '🔄', color: '#0d7377' },
    ];
  }, [leads]);

  const stageBreakdown = useMemo(() => {
    const counts = {};
    leads.forEach(l => { counts[l.stage] = (counts[l.stage] || 0) + 1; });
    return STAGES.filter(s => counts[s]).map(s => ({
      stage: s,
      label: STAGE_LABELS[s],
      count: counts[s],
      color: STAGE_COLORS[s],
      pct: Math.round((counts[s] / leads.length) * 100),
    }));
  }, [leads]);

  const recentLeads = useMemo(() =>
    [...leads].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 6),
    [leads]
  );

  return (
    <div>
      {/* KPI strip */}
      <div style={{ background: 'linear-gradient(135deg,#161616,#000000)', borderRadius: 16, padding: '28px 32px', marginBottom: 24, display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 20 }}>
        {kpis.map(k => (
          <div key={k.label} style={{ borderLeft: '3px solid rgba(255,255,255,0.07)', paddingLeft: 20 }}>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
              <span>{k.icon}</span>{k.label}
            </div>
            <div style={{ fontSize: 32, fontWeight: 900, color: k.color, lineHeight: 1 }}>{k.value}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 24 }}>
        {/* Pipeline breakdown */}
        <div className="card p-6">
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 18 }}>Pipeline Breakdown</div>
          {stageBreakdown.length === 0 ? (
            <div style={{ color: 'var(--text-muted)', fontSize: 13, textAlign: 'center', padding: '20px 0' }}>No leads yet</div>
          ) : stageBreakdown.map(s => (
            <div key={s.stage} style={{ marginBottom: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                <span style={{ fontSize: 12, color: 'var(--text)', fontWeight: 600 }}>{s.label}</span>
                <span style={{ fontSize: 12, fontWeight: 700, color: s.color }}>{s.count} <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>({s.pct}%)</span></span>
              </div>
              <div style={{ height: 6, borderRadius: 4, background: 'var(--surface-2, #F3F6F4)', overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${s.pct}%`, background: s.color, borderRadius: 4, transition: 'width 0.6s ease' }} />
              </div>
            </div>
          ))}
        </div>

        {/* Stage counts grid */}
        <div className="card p-6">
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 18 }}>By Stage</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            {STAGES.map(s => {
              const count = leads.filter(l => l.stage === s).length;
              const color = STAGE_COLORS[s];
              return (
                <div key={s} style={{ background: `${color}10`, border: `1px solid ${color}30`, borderRadius: 10, padding: '10px 12px' }}>
                  <div style={{ fontSize: 20, fontWeight: 900, color }}>{count}</div>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>{STAGE_LABELS[s]}</div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Recent leads */}
      <div className="card overflow-hidden">
        <div style={{ padding: '18px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: 1.5, textTransform: 'uppercase' }}>Recent Leads</div>
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Last {recentLeads.length}</span>
        </div>
        {recentLeads.length === 0 ? (
          <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>No leads yet</div>
        ) : recentLeads.map((lead, i) => (
          <div key={lead.id}
            onClick={() => navigate(`/crm/leads/${lead.id}`)}
            style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '13px 20px', borderBottom: i < recentLeads.length - 1 ? '1px solid var(--border)' : 'none', cursor: 'pointer', transition: 'background 0.12s' }}
            onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-2, #F8FAF9)'}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
          >
            <div style={{ width: 36, height: 36, borderRadius: 10, background: `${STAGE_COLORS[lead.stage] || '#888'}20`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 800, color: STAGE_COLORS[lead.stage] || '#888', flexShrink: 0 }}>
              {lead.full_name?.[0]?.toUpperCase()}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>{lead.full_name}</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{lead.phone} {lead.company ? `· ${lead.company}` : ''}</div>
            </div>
            <StageBadge stage={lead.stage} />
            {lead.estimated_value && (
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)', whiteSpace: 'nowrap' }}>{lead.estimated_value}</div>
            )}
            <div style={{ fontSize: 11, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{new Date(lead.created_at).toLocaleDateString()}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── PIPELINE TAB (KANBAN) ─────────────────────────────────────
function PipelineTab({ leads }) {
  const navigate = useNavigate();

  const columns = useMemo(() => {
    const groups = {};
    STAGES.forEach(s => { groups[s] = []; });
    leads.forEach(l => { if (groups[l.stage]) groups[l.stage].push(l); });
    return STAGES.map(s => ({ stage: s, label: STAGE_LABELS[s], color: STAGE_COLORS[s], leads: groups[s] }));
  }, [leads]);

  return (
    <div style={{ overflowX: 'auto', paddingBottom: 16 }}>
      <div style={{ display: 'flex', gap: 12, minWidth: 'max-content' }}>
        {columns.map(col => (
          <div key={col.stage} style={{ width: 240, flexShrink: 0, background: 'var(--surface-2, #E8EDE9)', borderRadius: 14, padding: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, padding: '0 2px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: col.color, flexShrink: 0 }} />
                <span style={{ fontSize: 11, fontWeight: 800, color: 'var(--text-muted)', letterSpacing: 0.5, textTransform: 'uppercase' }}>{col.label}</span>
              </div>
              <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', background: 'var(--surface, #fff)', borderRadius: 20, padding: '1px 8px' }}>{col.leads.length}</span>
            </div>
            {col.leads.length === 0 && (
              <div style={{ padding: '20px 0', textAlign: 'center', fontSize: 11, color: 'var(--text-muted)', opacity: 0.6 }}>Empty</div>
            )}
            {col.leads.map(lead => (
              <div key={lead.id}
                onClick={() => navigate(`/crm/leads/${lead.id}`)}
                style={{ background: 'var(--surface, #fff)', borderRadius: 10, padding: 14, marginBottom: 8, cursor: 'pointer', border: '1px solid rgba(0,0,0,0.05)', boxShadow: '0 1px 4px rgba(0,0,0,0.04)', transition: 'transform 0.15s, box-shadow 0.15s' }}
                onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 6px 16px rgba(0,0,0,0.09)'; }}
                onMouseLeave={e => { e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = '0 1px 4px rgba(0,0,0,0.04)'; }}
              >
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', marginBottom: 3 }}>{lead.full_name}</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 8 }}>{lead.phone}</div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 10, background: 'var(--surface-2, #F3F6F4)', color: 'var(--text-muted)', padding: '2px 7px', borderRadius: 6, fontWeight: 600 }}>{lead.source || '—'}</span>
                  {lead.estimated_value && <span style={{ fontSize: 11, fontWeight: 800, color: 'var(--text)' }}>{lead.estimated_value}</span>}
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── LEADS TAB (TABLE) ─────────────────────────────────────────
function LeadsTab({ leads, teamMembers, onLeadUpdated }) {
  const navigate = useNavigate();
  const { can } = usePermissions();
  const isMobile = useIsMobile();
  const [search, setSearch] = useState('');
  const [stageFilter, setStageFilter] = useState('');
  const [assigneeFilter, setAssigneeFilter] = useState('');
  const [selected, setSelected] = useState(new Set());
  const [bulkStage, setBulkStage] = useState('');
  const [bulkAssign, setBulkAssign] = useState('');
  const [bulkLoading, setBulkLoading] = useState(false);

  const filtered = useMemo(() => leads.filter(l => {
    if (stageFilter && l.stage !== stageFilter) return false;
    if (assigneeFilter && String(l.assigned_to) !== String(assigneeFilter)) return false;
    if (search && !l.full_name.toLowerCase().includes(search.toLowerCase()) &&
        !l.phone?.includes(search) && !l.email?.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  }), [leads, search, stageFilter, assigneeFilter]);

  const allSelected = filtered.length > 0 && filtered.every(l => selected.has(l.id));

  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(filtered.map(l => l.id)));
  const toggleOne = (id, e) => {
    e.stopPropagation();
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const applyBulk = async (action, value) => {
    if (!selected.size) return;
    setBulkLoading(true);
    try {
      const payload = { lead_ids: [...selected], action };
      if (action === 'stage') payload.stage = value;
      if (action === 'assign') payload.assigned_to = parseInt(value);
      const { data } = await api.post('/api/leads/bulk', payload);
      toast.success(`${data.updated} leads updated`);
      setBulkStage(''); setBulkAssign('');
      onLeadUpdated();
      setSelected(new Set());
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Bulk action failed');
    } finally {
      setBulkLoading(false);
    }
  };

  const selCount = selected.size;

  return (
    <div>
      {/* Filters */}
      <div style={{ display: 'flex', gap: 10, marginBottom: selCount > 0 ? 10 : 16, flexWrap: 'wrap' }}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name, phone, email..."
          className="input" style={{ flex: 1, minWidth: 160 }} />
        <select value={stageFilter} onChange={e => setStageFilter(e.target.value)} className="input" style={{ minWidth: 150 }}>
          <option value="">All Stages</option>
          {STAGES.map(s => <option key={s} value={s}>{STAGE_LABELS[s]}</option>)}
        </select>
        {!isMobile && teamMembers.length > 0 && (
          <select value={assigneeFilter} onChange={e => setAssigneeFilter(e.target.value)} className="input" style={{ minWidth: 160 }}>
            <option value="">All Agents</option>
            {teamMembers.map(m => <option key={m.id} value={m.id}>{m.full_name}</option>)}
          </select>
        )}
      </div>

      {/* Bulk toolbar */}
      {selCount > 0 && (
        <div style={{ marginBottom: 12, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10, borderRadius: 10, background: '#111111', padding: '10px 16px' }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: '#fff' }}>{selCount} selected</span>
          <select value={bulkStage} onChange={e => { setBulkStage(e.target.value); if (e.target.value) applyBulk('stage', e.target.value); }}
            disabled={bulkLoading} className="rounded-md border-0 px-2.5 py-1.5 text-xs text-[var(--text)]" style={{ background: 'var(--surface)' }}>
            <option value="">Change Stage...</option>
            {STAGES.map(s => <option key={s} value={s}>{STAGE_LABELS[s]}</option>)}
          </select>
          {teamMembers.length > 0 && (
            <select value={bulkAssign} onChange={e => { setBulkAssign(e.target.value); if (e.target.value) applyBulk('assign', e.target.value); }}
              disabled={bulkLoading} className="rounded-md border-0 px-2.5 py-1.5 text-xs text-[var(--text)]" style={{ background: 'var(--surface)' }}>
              <option value="">Assign To...</option>
              {teamMembers.map(m => <option key={m.id} value={m.id}>{m.full_name}</option>)}
            </select>
          )}
          <button onClick={() => setSelected(new Set())} style={{ marginLeft: 'auto', borderRadius: 6, background: 'rgba(255,255,255,0.15)', border: 'none', padding: '6px 12px', fontSize: 12, color: '#fff', cursor: 'pointer' }}>
            Clear
          </button>
        </div>
      )}

      {/* Mobile cards */}
      {isMobile ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {filtered.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>No leads found</div>
          ) : filtered.map(lead => {
            const isSelected = selected.has(lead.id);
            return (
              <div key={lead.id} onClick={() => navigate(`/crm/leads/${lead.id}`)}
                className="card cursor-pointer p-4"
                style={{ borderLeft: isSelected ? '3px solid var(--text)' : '3px solid transparent' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 8 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>{lead.full_name}</div>
                    <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 2 }}>{lead.phone}</div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <StageBadge stage={lead.stage} />
                    <input type="checkbox" checked={isSelected} onChange={() => {}} onClick={e => toggleOne(lead.id, e)} style={{ width: 16, height: 16, cursor: 'pointer' }} />
                  </div>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                  <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{lead.source}</span>
                  {lead.estimated_value && <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)' }}>{lead.estimated_value}</span>}
                  <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--text-muted)' }}>{new Date(lead.created_at).toLocaleDateString()}</span>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* Desktop table */
        <div className="card overflow-hidden">
          <table className="data-table">
            <thead>
              <tr>
                <th className="th w-10"><input type="checkbox" checked={allSelected} onChange={toggleAll} className="h-[15px] w-[15px] cursor-pointer accent-[var(--color-primary)]" /></th>
                {['Name', 'Phone', 'Source', 'Est. Value', 'Stage', 'Assigned To', 'Date'].map(h => <th key={h} className="th">{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={8} className="td p-10 text-center text-[var(--text-muted)]">No leads found</td></tr>
              ) : filtered.map(lead => {
                const isSelected = selected.has(lead.id);
                return (
                  <tr key={lead.id} onClick={() => navigate(`/crm/leads/${lead.id}`)}
                    className={`cursor-pointer ${isSelected ? 'bg-accent-soft dark:bg-accent/15' : ''}`}>
                    <td className="td" onClick={e => toggleOne(lead.id, e)}>
                      <input type="checkbox" checked={isSelected} onChange={() => {}} className="h-[15px] w-[15px] cursor-pointer accent-[var(--color-primary)]" />
                    </td>
                    <td className="td">
                      <div className="font-semibold text-[var(--text)]">{lead.full_name}</div>
                      {lead.email && <div className="mt-0.5 text-[11px] text-[var(--text-muted)]">{lead.email}</div>}
                    </td>
                    <td className="td text-[var(--text-muted)]">{lead.phone}</td>
                    <td className="td text-[var(--text-muted)]">{lead.source}</td>
                    <td className="td font-semibold text-accent">{lead.estimated_value || '—'}</td>
                    <td className="td"><StageBadge stage={lead.stage} /></td>
                    <td className="td text-[var(--text-muted)]">{lead.assigned_to_name || '—'}</td>
                    <td className="td text-xs text-[var(--text-muted)]/70">{new Date(lead.created_at).toLocaleDateString()}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── MAIN CRM PAGE ─────────────────────────────────────────────
const TABS = [
  { id: 'dashboard', label: 'Dashboard', icon: '📊' },
  { id: 'pipeline', label: 'Pipeline', icon: '🔀' },
  { id: 'leads', label: 'Leads', icon: '📋' },
];

export default function CRMPage() {
  const navigate = useNavigate();
  const { can } = usePermissions();
  const [activeTab, setActiveTab] = useState('dashboard');
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [teamMembers, setTeamMembers] = useState([]);
  const [showAdd, setShowAdd] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [dashStats, setDashStats] = useState(null);

  useEffect(() => {
    fetchLeads();
    api.get('/api/users/team').then(r => setTeamMembers(r.data)).catch(() => {});
    api.get('/api/dashboard/stats').then(r => setDashStats(r.data)).catch(() => {});
  }, []);

  const fetchLeads = async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/api/leads');
      setLeads(data);
    } catch {
      toast.error('Failed to load leads');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ minHeight: '100vh', background: 'var(--page-bg, #F0F4F2)', display: 'flex', flexDirection: 'column' }}>
      {/* Top bar */}
      <div style={{ background: 'var(--surface, #fff)', borderBottom: '1px solid var(--border, #E2E8E4)', padding: '0 28px', height: 56, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0, boxShadow: '0 1px 6px rgba(0,0,0,0.04)', position: 'sticky', top: 0, zIndex: 50 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button onClick={() => navigate('/')} style={{ padding: '5px 12px', background: 'var(--surface-2, #F3F6F4)', border: 'none', borderRadius: 7, fontSize: 12, color: 'var(--text-muted, #6B7280)', cursor: 'pointer', fontWeight: 600 }}>← Home</button>
          <div style={{ fontSize: 16, fontWeight: 900, color: 'var(--text, #141414)' }}>
            CRM {!loading && <span style={{ fontWeight: 400, color: 'var(--text-muted)', fontSize: 13 }}>— {leads.length} Leads</span>}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {can('leads', 'create') && (
            <button onClick={() => setShowImport(true)} style={{ padding: '7px 14px', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer', background: 'var(--surface-2, #F3F6F4)', color: 'var(--text)', border: '1px solid var(--border, #E2E8E4)' }}>Import</button>
          )}
          {can('leads', 'create') && (
            <button onClick={() => setShowAdd(true)} style={{ padding: '7px 14px', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer', background: '#111111', color: '#fff', border: 'none' }}>+ Add Lead</button>
          )}
        </div>
      </div>

      {/* Tab nav */}
      <div style={{ background: 'var(--surface, #fff)', borderBottom: '1px solid var(--border, #E2E8E4)', padding: '0 28px', display: 'flex', alignItems: 'center', gap: 4 }}>
        {TABS.map(tab => {
          const isActive = activeTab === tab.id;
          const count = tab.id !== 'dashboard' ? leads.length : null;
          return (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              style={{
                padding: '14px 16px', background: 'none', border: 'none', cursor: 'pointer',
                fontSize: 13, fontWeight: isActive ? 700 : 500,
                color: isActive ? 'var(--text)' : 'var(--text-muted, #6B7280)',
                borderBottom: isActive ? '2px solid var(--text)' : '2px solid transparent',
                marginBottom: -1, display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap',
                transition: 'color 0.15s',
              }}
            >
              <span>{tab.icon}</span>
              {tab.label}
              {count !== null && !loading && (
                <span style={{ background: isActive ? '#111111' : 'var(--surface-2, #E8EDE9)', color: isActive ? '#fff' : 'var(--text-muted)', borderRadius: 20, padding: '1px 8px', fontSize: 11, fontWeight: 700 }}>
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Content */}
      <div style={{ flex: 1, padding: 28, overflow: 'auto' }}>
        {loading ? (
          <div style={{ padding: 60, textAlign: 'center', color: 'var(--text-muted)' }}>Loading...</div>
        ) : (
          <>
            {activeTab === 'dashboard' && <DashboardTab leads={leads} dashStats={dashStats} />}
            {activeTab === 'pipeline' && <PipelineTab leads={leads} />}
            {activeTab === 'leads' && <LeadsTab leads={leads} teamMembers={teamMembers} onLeadUpdated={fetchLeads} />}
          </>
        )}
      </div>

      {showImport && <ImportModal onClose={() => setShowImport(false)} onImported={fetchLeads} />}
      {showAdd && <AddLeadModal onClose={() => setShowAdd(false)} onAdded={lead => { setLeads(prev => [lead, ...prev]); }} teamMembers={teamMembers} />}
    </div>
  );
}
