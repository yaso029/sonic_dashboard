import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api';
import toast from 'react-hot-toast';
import { useAuth } from '../AuthContext';
import usePermissions from '../hooks/usePermissions';
import ImportModal from '../components/ImportModal';
import useIsMobile from '../hooks/useIsMobile';

// Data-driven badge hues (one per stage).
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

const SOURCES = ['Website', 'WhatsApp', 'Referral', 'LinkedIn', 'Walk-in', 'Email', 'Phone', 'Other'];
const STAGES = Object.keys(STAGE_LABELS);

// Pill for a pipeline stage — hue from the data map, applied inline (data-driven).
function StageBadge({ stage }) {
  const color = STAGE_COLORS[stage] || '#888';
  return (
    <span className="badge" style={{ background: `${color}20`, color }}>
      {STAGE_LABELS[stage] || stage}
    </span>
  );
}

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
                <input
                  className="input mt-2 border-accent"
                  placeholder="Type source name..."
                  value={customSource}
                  onChange={e => setCustomSource(e.target.value)}
                  autoFocus
                />
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
            <button type="submit" disabled={loading} className="btn btn-primary">
              {loading ? 'Adding...' : 'Add Lead'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function LeadsPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { can } = usePermissions();
  const isMobile = useIsMobile();
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [stageFilter, setStageFilter] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [teamMembers, setTeamMembers] = useState([]);
  const [selected, setSelected] = useState(new Set());
  const [bulkStage, setBulkStage] = useState('');
  const [bulkAssign, setBulkAssign] = useState('');
  const [bulkLoading, setBulkLoading] = useState(false);
  const [assigneeFilter, setAssigneeFilter] = useState('');

  useEffect(() => {
    fetchLeads();
    api.get('/api/users/team').then(r => setTeamMembers(r.data)).catch(() => {});
  }, [stageFilter, assigneeFilter]);

  const fetchLeads = async () => {
    setLoading(true);
    try {
      const params = {};
      if (stageFilter) params.stage = stageFilter;
      if (assigneeFilter) params.assigned_to = assigneeFilter;
      const { data } = await api.get('/api/leads', { params });
      setLeads(data);
      setSelected(new Set());
    } catch {
      toast.error('Failed to load leads');
    } finally {
      setLoading(false);
    }
  };

  const filtered = leads.filter(l =>
    !search || l.full_name.toLowerCase().includes(search.toLowerCase()) ||
    l.phone?.includes(search) || l.email?.toLowerCase().includes(search.toLowerCase())
  );

  const allSelected = filtered.length > 0 && filtered.every(l => selected.has(l.id));

  const toggleAll = () => {
    if (allSelected) setSelected(new Set());
    else setSelected(new Set(filtered.map(l => l.id)));
  };

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
      setBulkStage('');
      setBulkAssign('');
      fetchLeads();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Bulk action failed');
    } finally {
      setBulkLoading(false);
    }
  };

  const selCount = selected.size;

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="page-title">All Leads</h1>
          <p className="page-subtitle">{leads.length} leads total</p>
        </div>
        <div className="flex gap-2">
          {!isMobile && can('leads', 'create') && (
            <button onClick={() => setShowImport(true)} className="btn btn-outline">Import</button>
          )}
          {can('leads', 'create') && (
            <button onClick={() => setShowAdd(true)} className="btn btn-primary">+ Add</button>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className={`flex flex-wrap gap-2 ${selCount > 0 ? 'mb-2.5' : 'mb-4'}`}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name, phone..."
          className="input min-w-[140px] flex-1" />
        <select value={stageFilter} onChange={e => setStageFilter(e.target.value)}
          className={`input ${isMobile ? 'min-w-[120px]' : 'min-w-[150px]'} max-w-[180px]`}>
          <option value="">All Stages</option>
          {STAGES.map(s => <option key={s} value={s}>{STAGE_LABELS[s]}</option>)}
        </select>
        {!isMobile && teamMembers.length > 0 && (
          <select value={assigneeFilter} onChange={e => setAssigneeFilter(e.target.value)}
            className="input min-w-[160px] max-w-[200px]">
            <option value="">All Agents</option>
            {teamMembers.map(m => <option key={m.id} value={m.id}>{m.full_name}</option>)}
          </select>
        )}
      </div>

      {/* Bulk action toolbar */}
      {selCount > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-2.5 rounded-[10px] bg-primary px-4 py-2.5">
          <span className="text-[13px] font-semibold text-white">{selCount} selected</span>
          <select
            value={bulkStage}
            onChange={e => { setBulkStage(e.target.value); if (e.target.value) applyBulk('stage', e.target.value); }}
            disabled={bulkLoading}
            className="rounded-md border-0 px-2.5 py-1.5 text-xs text-[var(--text)]"
            style={{ background: 'var(--surface)' }}
          >
            <option value="">Change Stage...</option>
            {STAGES.map(s => <option key={s} value={s}>{STAGE_LABELS[s]}</option>)}
          </select>
          {teamMembers.length > 0 && (
            <select
              value={bulkAssign}
              onChange={e => { setBulkAssign(e.target.value); if (e.target.value) applyBulk('assign', e.target.value); }}
              disabled={bulkLoading}
              className="rounded-md border-0 px-2.5 py-1.5 text-xs text-[var(--text)]"
              style={{ background: 'var(--surface)' }}
            >
              <option value="">Assign To...</option>
              {teamMembers.map(m => <option key={m.id} value={m.id}>{m.full_name}</option>)}
            </select>
          )}
          <button onClick={() => setSelected(new Set())} className="ml-auto rounded-md bg-white/15 px-3 py-1.5 text-xs text-white hover:bg-white/25">
            Clear
          </button>
        </div>
      )}

      {/* Mobile: cards */}
      {isMobile ? (
        <div className="flex flex-col gap-2.5">
          {loading ? (
            <div className="p-10 text-center text-[var(--text-muted)]">Loading...</div>
          ) : filtered.length === 0 ? (
            <div className="p-10 text-center text-[var(--text-muted)]">No leads found</div>
          ) : filtered.map(lead => {
            const isSelected = selected.has(lead.id);
            return (
              <div key={lead.id}
                onClick={() => navigate(`/crm/leads/${lead.id}`)}
                className={`card cursor-pointer border-[1.5px] p-4 ${isSelected ? 'border-primary bg-accent-soft dark:bg-accent/15' : 'border-transparent'}`}>
                <div className="mb-2 flex items-start justify-between">
                  <div className="flex-1">
                    <div className="text-[15px] font-bold text-[var(--text)]">{lead.full_name}</div>
                    <div className="mt-0.5 text-[13px] text-[var(--text-muted)]">{lead.phone}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <StageBadge stage={lead.stage} />
                    <input type="checkbox" checked={isSelected} onChange={() => {}} onClick={e => toggleOne(lead.id, e)} className="h-4 w-4 cursor-pointer accent-[var(--color-primary)]" />
                  </div>
                </div>
                <div className="flex flex-wrap gap-3">
                  <span className="text-xs text-[var(--text-muted)]">{lead.source}</span>
                  {lead.estimated_value && <span className="text-xs font-semibold text-accent">{lead.estimated_value}</span>}
                  {lead.assigned_to_name && <span className="text-xs text-[var(--text-muted)]">→ {lead.assigned_to_name}</span>}
                  <span className="ml-auto text-xs text-[var(--text-muted)]/70">{new Date(lead.created_at).toLocaleDateString()}</span>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* Desktop: table */
        <div className="card overflow-hidden">
          <table className="data-table">
            <thead>
              <tr>
                <th className="th w-10">
                  <input type="checkbox" checked={allSelected} onChange={toggleAll} className="h-[15px] w-[15px] cursor-pointer accent-[var(--color-primary)]" />
                </th>
                {['Name', 'Phone', 'Source', 'Est. Value', 'Stage', 'Assigned To', 'Date'].map(h => (
                  <th key={h} className="th">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={8} className="td p-10 text-center text-[var(--text-muted)]">Loading...</td></tr>
              ) : filtered.length === 0 ? (
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

      {showImport && (
        <ImportModal
          onClose={() => setShowImport(false)}
          onImported={fetchLeads}
        />
      )}

      {showAdd && (
        <AddLeadModal
          onClose={() => setShowAdd(false)}
          onAdded={lead => setLeads(prev => [lead, ...prev])}
          teamMembers={teamMembers}
        />
      )}
    </div>
  );
}
