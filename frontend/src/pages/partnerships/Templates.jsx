import { useEffect, useState } from 'react';
import api from '../../api';
import toast from 'react-hot-toast';

const TAGS = ['{name}', '{company}', '{partner_type}', '{commission_rate}'];

// Data-driven badge hues (one per Meta approval status).
const STATUS_COLORS = { pending: '#f59e0b', submitted: '#3b82f6', approved: '#10b981', rejected: '#ef4444' };

function WhatsAppTemplateModal({ template, onClose, onSaved }) {
  const isEdit = !!template;
  const [form, setForm] = useState(template ? { ...template, buttons: template.buttons || [] } : {
    name: '', category: 'MARKETING', body: '', buttons: [],
  });
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }));

  const addButton = () => {
    if (form.buttons.length >= 3) return;
    setForm(f => ({ ...f, buttons: [...f.buttons, { text: '', type: 'QUICK_REPLY', url: '' }] }));
  };

  const setBtn = (i, k, v) => setForm(f => ({
    ...f, buttons: f.buttons.map((b, idx) => idx === i ? { ...b, [k]: v } : b)
  }));

  const removeBtn = (i) => setForm(f => ({ ...f, buttons: f.buttons.filter((_, idx) => idx !== i) }));

  const insertTag = (tag) => setForm(f => ({ ...f, body: f.body + tag }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (isEdit) {
        await api.put(`/api/whatsapp/templates/${template.id}`, form);
      } else {
        await api.post('/api/whatsapp/templates', form);
      }
      toast.success('Template saved');
      onSaved();
      onClose();
    } catch (err) { toast.error(err.response?.data?.detail || 'Failed'); }
    finally { setLoading(false); }
  };

  const submitToMeta = async () => {
    if (!template?.id) return;
    setSubmitting(true);
    try {
      await api.post(`/api/whatsapp/templates/${template.id}/submit`);
      toast.success('Submitted to Meta for approval');
      onSaved();
    } catch (err) { toast.error(err.response?.data?.detail || 'Failed'); }
    finally { setSubmitting(false); }
  };

  return (
    <div className="modal-overlay">
      <div className="modal flex w-[680px] max-h-[90vh] gap-6 overflow-y-auto p-7">
        {/* Form */}
        <div className="flex-1">
          <div className="mb-5 flex items-center justify-between">
            <h2 className="text-lg font-bold text-[var(--text)]">{isEdit ? 'Edit' : 'New'} WhatsApp Template</h2>
            <button onClick={onClose} className="text-xl text-[var(--text-muted)] hover:text-[var(--text)]">×</button>
          </div>
          <form onSubmit={handleSubmit}>
            <label className="label">Template Name</label>
            <input className="input mb-3" value={form.name} onChange={set('name')} required placeholder="e.g. partner_intro_v1" />
            <label className="label">Category</label>
            <select className="input mb-3" value={form.category} onChange={set('category')}>
              <option value="MARKETING">Marketing</option>
              <option value="UTILITY">Utility</option>
            </select>
            <label className="label">Message Body</label>
            <div className="mb-1.5 flex flex-wrap gap-1.5">
              {TAGS.map(tag => (
                <button key={tag} type="button" onClick={() => insertTag(tag)}
                  className="rounded-full bg-accent-soft px-2.5 py-0.5 text-[11px] text-accent dark:bg-accent/15">
                  {tag}
                </button>
              ))}
            </div>
            <textarea className="input mb-3 min-h-[100px] resize-y" value={form.body} onChange={set('body')} required placeholder="Hello {name}, we'd love to partner with you..." />

            <label className="label">Buttons (max 3)</label>
            {form.buttons.map((b, i) => (
              <div key={i} className="mb-2 flex items-center gap-1.5">
                <input className="input flex-1" placeholder="Button text" value={b.text} onChange={e => setBtn(i, 'text', e.target.value)} />
                <select className="input w-[130px]" value={b.type} onChange={e => setBtn(i, 'type', e.target.value)}>
                  <option value="QUICK_REPLY">Quick Reply</option>
                  <option value="URL">URL</option>
                </select>
                {b.type === 'URL' && <input className="input flex-1" placeholder="https://..." value={b.url} onChange={e => setBtn(i, 'url', e.target.value)} />}
                <button type="button" onClick={() => removeBtn(i)} className="px-1 text-lg text-red-500">×</button>
              </div>
            ))}
            {form.buttons.length < 3 && (
              <button type="button" onClick={addButton} className="mb-3 rounded-md border-[1.5px] border-dashed border-accent bg-accent-soft px-3.5 py-1.5 text-xs text-accent dark:bg-accent/15">
                + Add Button
              </button>
            )}

            <div className="mt-2 flex justify-end gap-2.5">
              {isEdit && (
                <button type="button" onClick={submitToMeta} disabled={submitting} className="btn btn-accent btn-sm">
                  {submitting ? 'Submitting...' : 'Submit to Meta'}
                </button>
              )}
              <button type="button" onClick={onClose} className="btn btn-ghost">Cancel</button>
              <button type="submit" disabled={loading} className="btn btn-primary">
                {loading ? 'Saving...' : 'Save'}
              </button>
            </div>
          </form>
        </div>

        {/* Preview */}
        <div className="w-[200px]">
          <div className="mb-2.5 text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">Preview</div>
          <div className="min-h-[200px] rounded-xl bg-[var(--surface-2)] p-3">
            <div className="whitespace-pre-wrap break-words rounded-lg bg-[var(--surface)] p-2.5 text-xs leading-relaxed text-[var(--text)]">
              {form.body || 'Your message preview...'}
            </div>
            {form.buttons.map((b, i) => b.text && (
              <div key={i} className="mt-1.5 rounded-md bg-[var(--surface)] px-2.5 py-2 text-center text-xs font-semibold text-accent">
                {b.text}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function EmailTemplateModal({ template, onClose, onSaved }) {
  const isEdit = !!template;
  const [form, setForm] = useState(template ? { ...template } : { name: '', subject: '', body_html: '' });
  const [loading, setLoading] = useState(false);
  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }));
  const insertTag = (tag, field) => setForm(f => ({ ...f, [field]: (f[field] || '') + tag }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (isEdit) {
        await api.put(`/api/email/templates/${template.id}`, form);
      } else {
        await api.post('/api/email/templates', form);
      }
      toast.success('Template saved');
      onSaved();
      onClose();
    } catch (err) { toast.error(err.response?.data?.detail || 'Failed'); }
    finally { setLoading(false); }
  };

  return (
    <div className="modal-overlay">
      <div className="modal w-[720px] max-h-[90vh] overflow-y-auto p-7">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-lg font-bold text-[var(--text)]">{isEdit ? 'Edit' : 'New'} Email Template</h2>
          <button onClick={onClose} className="text-xl text-[var(--text-muted)] hover:text-[var(--text)]">×</button>
        </div>
        <form onSubmit={handleSubmit}>
          <label className="label">Template Name</label>
          <input className="input mb-3" value={form.name} onChange={set('name')} required />
          <label className="label">Subject Line</label>
          <div className="mb-1.5 flex flex-wrap gap-1.5">
            {TAGS.map(tag => (
              <button key={tag} type="button" onClick={() => insertTag(tag, 'subject')}
                className="rounded-full bg-amber-500/15 px-2.5 py-0.5 text-[11px] text-amber-700 dark:text-amber-300">{tag}</button>
            ))}
          </div>
          <input className="input mb-3" value={form.subject} onChange={set('subject')} required placeholder="Partnership Opportunity with {company}" />
          <label className="label">Email Body (HTML supported)</label>
          <div className="mb-1.5 flex flex-wrap gap-1.5">
            {TAGS.map(tag => (
              <button key={tag} type="button" onClick={() => insertTag(tag, 'body_html')}
                className="rounded-full bg-amber-500/15 px-2.5 py-0.5 text-[11px] text-amber-700 dark:text-amber-300">{tag}</button>
            ))}
          </div>
          <textarea className="input mb-3 min-h-[200px] resize-y font-mono text-xs"
            value={form.body_html} onChange={set('body_html')} required
            placeholder="<p>Dear {name},</p><p>We'd love to partner with you...</p>" />

          {form.body_html && (
            <div className="mb-4">
              <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">Preview</div>
              <div className="min-h-[80px] rounded-lg border border-[var(--border)] p-4 text-[13px] text-[var(--text)]"
                dangerouslySetInnerHTML={{ __html: form.body_html }} />
            </div>
          )}

          <div className="flex justify-end gap-2.5">
            <button type="button" onClick={onClose} className="btn btn-ghost">Cancel</button>
            <button type="submit" disabled={loading} className="btn btn-primary">
              {loading ? 'Saving...' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function Templates() {
  const [waTemplates, setWaTemplates] = useState([]);
  const [emailTemplates, setEmailTemplates] = useState([]);
  const [tab, setTab] = useState('whatsapp');
  const [waModal, setWaModal] = useState(null);
  const [emailModal, setEmailModal] = useState(null);

  const fetchAll = async () => {
    const [wa, em] = await Promise.all([
      api.get('/api/whatsapp/templates').then(r => r.data).catch(() => []),
      api.get('/api/email/templates').then(r => r.data).catch(() => []),
    ]);
    setWaTemplates(wa);
    setEmailTemplates(em);
  };

  useEffect(() => { fetchAll(); }, []);

  const deleteWa = async (id) => {
    if (!confirm('Delete template?')) return;
    await api.delete(`/api/whatsapp/templates/${id}`);
    toast.success('Deleted');
    fetchAll();
  };

  const deleteEmail = async (id) => {
    if (!confirm('Delete template?')) return;
    await api.delete(`/api/email/templates/${id}`);
    toast.success('Deleted');
    fetchAll();
  };

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="page-title">Template Manager</h1>
        <button
          onClick={() => tab === 'whatsapp' ? setWaModal('add') : setEmailModal('add')}
          className="btn btn-primary">
          + New {tab === 'whatsapp' ? 'WhatsApp' : 'Email'} Template
        </button>
      </div>

      {/* Tabs */}
      <div className="mb-6 flex border-b-2 border-[var(--border)]">
        {[['whatsapp', '📱 WhatsApp Templates'], ['email', '📧 Email Templates']].map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)}
            className={`-mb-0.5 border-b-[3px] px-6 py-2.5 text-sm ${tab === key ? 'border-primary font-bold text-primary dark:border-accent-light dark:text-accent-light' : 'border-transparent font-medium text-[var(--text-muted)]'}`}>
            {label}
          </button>
        ))}
      </div>

      {tab === 'whatsapp' && (
        <div className="flex flex-col gap-3">
          {waTemplates.length === 0 && <div className="p-10 text-center text-[var(--text-muted)]">No WhatsApp templates yet</div>}
          {waTemplates.map(t => (
            <div key={t.id} className="card flex items-start justify-between px-5 py-4">
              <div className="flex-1">
                <div className="mb-1.5 flex items-center gap-2.5">
                  <span className="text-[15px] font-bold text-[var(--text)]">{t.name}</span>
                  <span className="badge uppercase" style={{ background: `${STATUS_COLORS[t.meta_status]}20`, color: STATUS_COLORS[t.meta_status] }}>{t.meta_status}</span>
                  <span className="badge badge-neutral">{t.category}</span>
                </div>
                <div className="whitespace-pre-wrap text-[13px] leading-relaxed text-[var(--text-muted)]">{t.body}</div>
                {t.buttons?.length > 0 && (
                  <div className="mt-2 flex gap-1.5">
                    {t.buttons.map((b, i) => <span key={i} className="rounded-full bg-accent-soft px-2.5 py-0.5 text-[11px] text-accent dark:bg-accent/15">{b.text}</span>)}
                  </div>
                )}
              </div>
              <div className="ml-4 flex flex-wrap justify-end gap-2">
                <button onClick={async () => {
                  try {
                    const { data } = await api.post(`/api/whatsapp/templates/${t.id}/check-status`);
                    if (data.error) { toast.error(data.error); return; }
                    toast.success(`Meta status: ${data.meta_status?.toUpperCase()}`);
                    fetchAll();
                  } catch (err) { toast.error(err.response?.data?.detail || 'Could not reach Meta'); }
                }} className="btn btn-outline btn-sm">↻ Check</button>
                {t.meta_status !== 'approved' && (
                  <button onClick={async () => {
                    await api.patch(`/api/whatsapp/templates/${t.id}/status?status=approved`);
                    toast.success('Marked as approved');
                    fetchAll();
                  }} className="btn btn-accent btn-sm">✓ Mark Approved</button>
                )}
                <button onClick={() => setWaModal(t)} className="btn btn-outline btn-sm">Edit</button>
                <button onClick={() => deleteWa(t.id)} className="btn btn-danger btn-sm">Delete</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === 'email' && (
        <div className="flex flex-col gap-3">
          {emailTemplates.length === 0 && <div className="p-10 text-center text-[var(--text-muted)]">No email templates yet</div>}
          {emailTemplates.map(t => (
            <div key={t.id} className="card flex items-start justify-between px-5 py-4">
              <div className="flex-1">
                <div className="mb-1 text-[15px] font-bold text-[var(--text)]">{t.name}</div>
                <div className="mb-1.5 text-xs text-[var(--text-muted)]">Subject: {t.subject}</div>
                <div className="text-xs text-[var(--text-muted)]/70">Updated {new Date(t.updated_at).toLocaleDateString()}</div>
              </div>
              <div className="ml-4 flex gap-2">
                <button onClick={() => setEmailModal(t)} className="btn btn-outline btn-sm">Edit</button>
                <button onClick={() => deleteEmail(t.id)} className="btn btn-danger btn-sm">Delete</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {waModal && <WhatsAppTemplateModal template={waModal === 'add' ? null : waModal} onClose={() => setWaModal(null)} onSaved={fetchAll} />}
      {emailModal && <EmailTemplateModal template={emailModal === 'add' ? null : emailModal} onClose={() => setEmailModal(null)} onSaved={fetchAll} />}
    </div>
  );
}
