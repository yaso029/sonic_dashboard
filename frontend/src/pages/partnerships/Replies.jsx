import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../api';
import toast from 'react-hot-toast';

// Data-driven AI-suggestion hues (per suggestion type).
const SUGGESTION_CONFIG = {
  interested: { label: 'Interested', color: '#10b981', bg: '#dcfce7', action: 'Follow Up' },
  not_interested: { label: 'Not Interested', color: '#ef4444', bg: '#fee2e2', action: 'Mark Not Interested' },
  has_client: { label: 'Has a Client Ready!', color: '#f59e0b', bg: '#fef3c7', action: 'Create Lead Now' },
};

function CreateLeadModal({ reply, onClose, onCreated }) {
  const [form, setForm] = useState({
    full_name: '',
    phone: '',
    email: '',
    company: '',
    source: 'Referral',
    notes: `Referred by partner: ${reply.partner_name || reply.from_number}`,
    estimated_value: '',
  });
  const [loading, setLoading] = useState(false);
  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await api.post('/api/leads', form);
      await api.patch(`/api/whatsapp/replies/${reply.id}/action?action=lead_created`);
      toast.success('Lead created in CRM!');
      onCreated();
      onClose();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal w-[480px] max-h-[85vh] overflow-y-auto p-7">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-[var(--text)]">Create Lead from Referral</h2>
          <button onClick={onClose} className="text-xl text-[var(--text-muted)] hover:text-[var(--text)]">×</button>
        </div>
        <div className="mb-4 rounded-lg bg-amber-500/15 px-3.5 py-2.5 text-[13px] text-amber-700 dark:text-amber-300">
          Referral from: <strong>{reply.partner_name || reply.from_number}</strong><br />
          "{reply.message_body}"
        </div>
        <form onSubmit={handleSubmit}>
          <label className="label">Client Full Name *</label>
          <input className="input mb-3" value={form.full_name} onChange={set('full_name')} required />
          <label className="label">Client Phone *</label>
          <input className="input mb-3" value={form.phone} onChange={set('phone')} required />
          <label className="label">Client Email</label>
          <input className="input mb-3" type="email" value={form.email} onChange={set('email')} />
          <label className="label">Company</label>
          <input className="input mb-3" value={form.company} onChange={set('company')} placeholder="Company name" />
          <label className="label">Estimated Value</label>
          <input className="input mb-3" value={form.estimated_value} onChange={set('estimated_value')} placeholder="e.g. AED 30,000/year" />
          <label className="label">Notes</label>
          <textarea className="input mb-3 min-h-[60px] resize-y" value={form.notes} onChange={set('notes')} />
          <div className="mt-1 flex justify-end gap-2.5">
            <button type="button" onClick={onClose} className="btn btn-ghost">Cancel</button>
            <button type="submit" disabled={loading} className="btn btn-accent">
              {loading ? 'Creating...' : 'Create Lead in CRM'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function Replies() {
  const [replies, setReplies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [createLeadReply, setCreateLeadReply] = useState(null);

  const fetchReplies = async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/api/whatsapp/replies');
      setReplies(data);
    } catch { toast.error('Failed to load replies'); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchReplies(); }, []);

  const takeAction = async (id, action) => {
    try {
      await api.patch(`/api/whatsapp/replies/${id}/action?action=${action}`);
      toast.success('Action taken');
      fetchReplies();
    } catch { toast.error('Failed'); }
  };

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="page-title">Replies & Conversations</h1>
          <p className="page-subtitle">{replies.length} replies received</p>
        </div>
        <button onClick={fetchReplies} className="btn btn-outline">
          Refresh
        </button>
      </div>

      {loading ? (
        <div className="p-16 text-center text-[var(--text-muted)]">Loading...</div>
      ) : replies.length === 0 ? (
        <div className="card p-16 text-center text-[var(--text-muted)]">
          <div className="mb-3 text-[40px]">💬</div>
          <div className="text-base font-semibold text-[var(--text)]">No replies yet</div>
          <div className="mt-1.5 text-[13px]">Replies from WhatsApp will appear here automatically</div>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {replies.map(r => {
            const suggestion = r.ai_suggestion ? SUGGESTION_CONFIG[r.ai_suggestion] : null;
            const isDone = !!r.action_taken;
            return (
              <div key={r.id}
                className={`card border-l-4 px-5 py-4 ${isDone ? 'opacity-70' : ''} ${suggestion ? '' : 'border-l-[var(--border)]'}`}
                style={suggestion ? { borderLeftColor: suggestion.color } : undefined}>
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="mb-2 flex items-center gap-2.5">
                      <span className="text-[15px] font-bold text-[var(--text)]">{r.partner_name}</span>
                      <span className="text-[11px] text-[var(--text-muted)]">{r.from_number}</span>
                      <span className="text-[11px] text-[var(--text-muted)]">{new Date(r.received_at).toLocaleString()}</span>
                      {isDone && <span className="badge badge-neutral">Done: {r.action_taken}</span>}
                    </div>

                    {/* Message bubble */}
                    <div className="max-w-[480px] rounded-[0_12px_12px_12px] bg-[var(--surface-2)] px-3.5 py-2.5 text-sm leading-relaxed text-[var(--text)]">
                      {r.message_body}
                    </div>

                    {/* AI suggestion */}
                    {suggestion && (
                      <div className="mt-3 flex items-center gap-2.5">
                        <span className="rounded-full px-3 py-1 text-xs font-semibold"
                          style={{ background: suggestion.bg, color: suggestion.color }}>
                          🤖 AI: {suggestion.label}
                        </span>
                        {!isDone && (
                          <>
                            {r.ai_suggestion === 'has_client' && (
                              <button onClick={() => setCreateLeadReply(r)} className="btn btn-accent btn-sm">
                                Create Lead Now
                              </button>
                            )}
                            {r.ai_suggestion === 'interested' && (
                              <button onClick={() => takeAction(r.id, 'follow_up')} className="btn btn-primary btn-sm">
                                Create Referral Lead
                              </button>
                            )}
                            {r.ai_suggestion === 'not_interested' && (
                              <button onClick={() => takeAction(r.id, 'not_interested')} className="btn btn-danger btn-sm">
                                Mark Not Interested
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {createLeadReply && (
        <CreateLeadModal
          reply={createLeadReply}
          onClose={() => setCreateLeadReply(null)}
          onCreated={fetchReplies}
        />
      )}
    </div>
  );
}
