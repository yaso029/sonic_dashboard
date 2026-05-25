import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../api';
import toast from 'react-hot-toast';
import { useAuth } from '../AuthContext';
import usePermissions from '../hooks/usePermissions';
import useIsMobile from '../hooks/useIsMobile';
import ConvertLeadModal from '../components/ConvertLeadModal';

// Data-driven stage hues — applied inline below (matches StageBadge pattern).
const STAGES = [
  { key: 'inquiry', label: 'Inquiry', color: '#6366f1' },
  { key: 'discovery_call', label: 'Discovery Call', color: '#3b82f6' },
  { key: 'documents_requested', label: 'Docs Requested', color: '#f59e0b' },
  { key: 'documents_received', label: 'Docs Received', color: '#8b5cf6' },
  { key: 'in_progress', label: 'In Progress', color: '#06b6d4' },
  { key: 'review', label: 'Review', color: '#7c3aed' },
  { key: 'completed', label: 'Completed', color: '#10b981' },
  { key: 'monthly_retainer', label: 'Monthly Retainer', color: '#0d7377' },
  { key: 'lost', label: 'Lost', color: '#ef4444' },
];

const ACTIVITY_ICONS = {
  call: '📞', email: '✉️', meeting: '🤝',
  note: '📝', whatsapp: '💬', stage_change: '🔄', assignment: '👤',
  document_request: '📋', document_received: '📥',
};

const ACTIVITY_TYPES = ['call', 'email', 'meeting', 'whatsapp', 'document_request', 'document_received', 'note'];

export default function LeadDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { can } = usePermissions();
  const isMobile = useIsMobile();
  const [lead, setLead] = useState(null);
  const [loading, setLoading] = useState(true);
  const [actText, setActText] = useState('');
  const [actType, setActType] = useState('note');
  const [addingAct, setAddingAct] = useState(false);
  const [teamMembers, setTeamMembers] = useState([]);
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState({});
  const [converting, setConverting] = useState(false);

  useEffect(() => {
    fetchLead();
    api.get('/api/users/team').then(r => setTeamMembers(r.data)).catch(() => {});
  }, [id]);

  const fetchLead = async () => {
    try {
      const { data } = await api.get(`/api/leads/${id}`);
      setLead(data);
      setEditForm({ notes: data.notes || '', estimated_value: data.estimated_value || '', company: data.company || '' });
    } catch {
      toast.error('Lead not found');
      navigate('/crm/leads');
    } finally {
      setLoading(false);
    }
  };

  const updateStage = async (stage) => {
    try {
      const { data } = await api.patch(`/api/leads/${id}/stage`, { stage });
      setLead(prev => ({ ...prev, stage: data.stage, activities: data.activities || prev.activities }));
      await fetchLead();
      toast.success('Stage updated');
    } catch { toast.error('Failed to update stage'); }
  };

  const addActivity = async (e) => {
    e.preventDefault();
    if (!actText.trim()) return;
    setAddingAct(true);
    try {
      const { data } = await api.post(`/api/leads/${id}/activities`, { type: actType, content: actText });
      setLead(prev => ({ ...prev, activities: [data, ...(prev.activities || [])] }));
      setActText('');
      toast.success('Activity logged');
    } catch { toast.error('Failed to log activity'); }
    finally { setAddingAct(false); }
  };

  const assignTo = async (userId) => {
    try {
      await api.patch(`/api/leads/${id}/assign`, { user_id: parseInt(userId) });
      await fetchLead();
      toast.success('Lead reassigned');
    } catch { toast.error('Failed to assign'); }
  };

  const saveEdit = async () => {
    try {
      await api.put(`/api/leads/${id}`, editForm);
      await fetchLead();
      setEditing(false);
      toast.success('Lead updated');
    } catch { toast.error('Failed to update'); }
  };

  const deleteLead = async () => {
    if (!window.confirm(`Delete "${lead.full_name}" permanently? This cannot be undone.`)) return;
    try {
      await api.delete(`/api/leads/${id}`);
      toast.success('Lead deleted');
      navigate('/crm/leads');
    } catch { toast.error('Failed to delete lead'); }
  };

  if (loading) return <div className="p-10 text-center text-[var(--text-muted)]">Loading...</div>;
  if (!lead) return null;

  const currentStage = STAGES.find(s => s.key === lead.stage) || STAGES[0];

  return (
    <div className="mx-auto max-w-[1100px]">
      {/* Header */}
      <div className="mb-5 flex items-center gap-2.5">
        <button onClick={() => navigate(-1)} className="flex-shrink-0 text-lg text-[var(--text-muted)] hover:text-[var(--text)]">←</button>
        <div className="min-w-0 flex-1">
          <h1 className={`truncate font-bold text-[var(--text)] ${isMobile ? 'text-[17px]' : 'text-[22px]'}`}>{lead.full_name}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <span
              className="badge"
              style={{ background: `${currentStage.color}20`, color: currentStage.color }}
            >
              {currentStage.label}
            </span>
            <span className="text-xs text-[var(--text-muted)]">Added {new Date(lead.created_at).toLocaleDateString()}</span>
          </div>
        </div>
        {can('leads', 'convert') && (
          <button
            onClick={() => setConverting(true)}
            className="btn btn-accent btn-sm flex-shrink-0"
          >
            → Convert to Client
          </button>
        )}
        {user?.email === 'yaso@sonic.com' && (
          <button
            onClick={deleteLead}
            className="btn btn-danger btn-sm flex-shrink-0"
          >
            🗑 Delete
          </button>
        )}
      </div>

      {converting && (
        <ConvertLeadModal
          lead={lead}
          onClose={() => setConverting(false)}
          onConverted={(clientId) => {
            setConverting(false);
            navigate(`/clients/${clientId}`);
          }}
        />
      )}

      <div className={`grid gap-4 ${isMobile ? 'grid-cols-1' : 'grid-cols-[1fr_380px]'}`}>
        {/* Left column */}
        <div className="flex flex-col gap-5">
          {/* Stage pipeline */}
          <div className="card p-5">
            <h3 className="mb-3.5 text-sm font-semibold text-[var(--text-muted)]">Move Stage</h3>
            <div className="flex flex-wrap gap-1.5">
              {STAGES.map(s => (
                <button
                  key={s.key}
                  onClick={() => s.key !== lead.stage && updateStage(s.key)}
                  className="rounded-full border-2 px-3.5 py-[7px] text-xs font-semibold transition"
                  style={{
                    borderColor: s.color,
                    background: lead.stage === s.key ? s.color : 'transparent',
                    color: lead.stage === s.key ? '#fff' : s.color,
                    cursor: lead.stage === s.key ? 'default' : 'pointer',
                  }}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          {/* Contact & details */}
          <div className="card p-5">
            <div className="mb-3.5 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-[var(--text-muted)]">Lead Details</h3>
              <button onClick={() => setEditing(!editing)} className="text-[13px] font-semibold text-accent hover:opacity-80">
                {editing ? 'Cancel' : 'Edit'}
              </button>
            </div>

            {editing ? (
              <div className={`grid gap-x-4 ${isMobile ? 'grid-cols-1' : 'grid-cols-2'}`}>
                {[['Company', 'company', 'Company name'], ['Estimated Value', 'estimated_value', 'e.g. AED 30,000/year']].map(([label, key, ph]) => (
                  <div key={key}>
                    <label className="label">{label}</label>
                    <input
                      value={editForm[key]}
                      onChange={e => setEditForm(f => ({ ...f, [key]: e.target.value }))}
                      placeholder={ph}
                      className="input mb-3"
                    />
                  </div>
                ))}
                <div className="col-span-2">
                  <label className="label">Notes</label>
                  <textarea
                    value={editForm.notes}
                    onChange={e => setEditForm(f => ({ ...f, notes: e.target.value }))}
                    className="input mb-3 min-h-[80px] resize-y"
                  />
                </div>
                <div className="col-span-2 flex gap-2">
                  <button onClick={saveEdit} className="btn btn-primary">Save</button>
                </div>
              </div>
            ) : (
              <div className={`grid gap-x-6 gap-y-3.5 ${isMobile ? 'grid-cols-1' : 'grid-cols-2'}`}>
                {[
                  ['Phone', lead.phone], ['Email', lead.email || '—'],
                  ['Company', lead.company || '—'], ['Source', lead.source],
                  ['Estimated Value', lead.estimated_value || '—'],
                  ['Assigned To', lead.assigned_to_name || '—'], ['Created By', lead.created_by_name || '—'],
                ].map(([k, v]) => (
                  <div key={k}>
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">{k}</div>
                    <div className="mt-0.5 text-sm text-[var(--text)]">{v}</div>
                  </div>
                ))}
                {lead.notes && (
                  <div className="col-span-2">
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">Notes</div>
                    <div className="mt-0.5 text-sm leading-normal text-[var(--text)]">{lead.notes}</div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Activity log form */}
          <div className="card p-5">
            <h3 className="mb-3.5 text-sm font-semibold text-[var(--text-muted)]">Log Activity</h3>
            <form onSubmit={addActivity} className="flex flex-col gap-2.5">
              <div className="flex flex-wrap gap-2">
                {ACTIVITY_TYPES.map(t => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setActType(t)}
                    className={`rounded-full border-[1.5px] px-3 py-1.5 text-xs font-medium transition ${
                      actType === t
                        ? 'border-primary bg-primary text-white'
                        : 'border-[var(--border)] bg-[var(--surface)] text-[var(--text-muted)] hover:bg-[var(--surface-2)]'
                    }`}
                  >
                    {ACTIVITY_ICONS[t]} {t}
                  </button>
                ))}
              </div>
              <textarea
                value={actText}
                onChange={e => setActText(e.target.value)}
                placeholder={`Add ${actType} note...`}
                required
                className="input min-h-[70px] resize-y"
              />
              <button
                type="submit"
                disabled={addingAct}
                className="btn btn-primary self-end"
              >
                {addingAct ? 'Logging...' : 'Log Activity'}
              </button>
            </form>
          </div>
        </div>

        {/* Right column - Activity timeline */}
        <div className="flex flex-col gap-5">
          {/* Assign — available to all users */}
          {teamMembers.length > 0 && (
            <div className="card p-5">
              <h3 className="mb-2.5 text-[13px] font-semibold text-[var(--text-muted)]">Assign To</h3>
              <select
                value={lead.assigned_to || ''}
                onChange={e => assignTo(e.target.value)}
                className="input"
              >
                <option value="">Select agent...</option>
                {teamMembers.map(m => <option key={m.id} value={m.id}>{m.full_name}</option>)}
              </select>
            </div>
          )}

          {/* Timeline */}
          <div className="card flex-1 p-5">
            <h3 className="mb-4 text-sm font-semibold text-[var(--text-muted)]">Activity Timeline</h3>
            <div className="flex flex-col">
              {(lead.activities || []).length === 0 ? (
                <div className="py-5 text-center text-[13px] text-[var(--text-muted)]">No activity yet</div>
              ) : (lead.activities || []).map((act, i) => (
                <div key={act.id} className="relative flex gap-3 pb-4">
                  <div className="flex flex-col items-center">
                    <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-accent-soft text-sm dark:bg-accent/15">
                      {ACTIVITY_ICONS[act.type] || '📌'}
                    </div>
                    {i < (lead.activities?.length - 1) && (
                      <div className="mt-1 w-px flex-1 bg-[var(--border)]" />
                    )}
                  </div>
                  <div className="flex-1 pt-1">
                    <div className="mb-0.5 text-xs text-[var(--text-muted)]">
                      {act.user_name} · {new Date(act.created_at).toLocaleString()}
                    </div>
                    <div className="text-[13px] leading-normal text-[var(--text)]">{act.content}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
