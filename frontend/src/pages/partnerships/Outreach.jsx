import { useEffect, useState } from 'react';
import api from '../../api';
import toast from 'react-hot-toast';

export default function Outreach() {
  const [tab, setTab] = useState('whatsapp');
  const [partners, setPartners] = useState([]);
  const [waTemplates, setWaTemplates] = useState([]);
  const [emailTemplates, setEmailTemplates] = useState([]);
  const [waDailyCount, setWaDailyCount] = useState({ count: 0, limit: 50 });
  const [emailDailyCount, setEmailDailyCount] = useState({ count: 0, limit: 50 });
  const [waSentHistory, setWaSentHistory] = useState([]);
  const [emailSentHistory, setEmailSentHistory] = useState([]);

  // WhatsApp form
  const [waForm, setWaForm] = useState({ template_id: '', custom_message: '', selected_partners: [] });
  const [waSending, setWaSending] = useState(false);

  // Email form
  const [emailForm, setEmailForm] = useState({ template_id: '', custom_subject: '', custom_body: '', selected_partners: [] });
  const [emailSending, setEmailSending] = useState(false);

  const [partnerFilter, setPartnerFilter] = useState('');

  useEffect(() => {
    Promise.all([
      api.get('/api/partners').then(r => setPartners(r.data)).catch(() => {}),
      api.get('/api/whatsapp/templates').then(r => setWaTemplates(r.data)).catch(() => {}),
      api.get('/api/email/templates').then(r => setEmailTemplates(r.data)).catch(() => {}),
      api.get('/api/whatsapp/daily-count').then(r => setWaDailyCount(r.data)).catch(() => {}),
      api.get('/api/email/daily-count').then(r => setEmailDailyCount(r.data)).catch(() => {}),
      api.get('/api/whatsapp/sent').then(r => setWaSentHistory(r.data)).catch(() => {}),
      api.get('/api/email/sent').then(r => setEmailSentHistory(r.data)).catch(() => {}),
    ]);
  }, []);

  const selectedWaTemplate = waTemplates.find(t => t.id === parseInt(waForm.template_id));
  const selectedEmailTemplate = emailTemplates.find(t => t.id === parseInt(emailForm.template_id));

  const filteredPartners = partners.filter(p =>
    !partnerFilter || p.partner_type === partnerFilter || p.status === partnerFilter
  );

  const togglePartner = (id, form, setForm) => {
    setForm(f => ({
      ...f,
      selected_partners: f.selected_partners.includes(id)
        ? f.selected_partners.filter(x => x !== id)
        : [...f.selected_partners, id]
    }));
  };

  const selectAll = (form, setForm) => {
    const ids = filteredPartners.map(p => p.id);
    setForm(f => ({ ...f, selected_partners: ids }));
  };

  const sendWhatsApp = async () => {
    if (!waForm.selected_partners.length) { toast.error('Select at least one partner'); return; }
    setWaSending(true);
    try {
      const { data } = await api.post('/api/whatsapp/send', {
        partner_ids: waForm.selected_partners,
        template_id: waForm.template_id ? parseInt(waForm.template_id) : null,
        custom_message: waForm.custom_message || null,
      });
      toast.success(`${data.sent} messages sent`);
      setWaForm(f => ({ ...f, selected_partners: [] }));
      const [dc, hist] = await Promise.all([
        api.get('/api/whatsapp/daily-count').then(r => r.data),
        api.get('/api/whatsapp/sent').then(r => r.data),
      ]);
      setWaDailyCount(dc);
      setWaSentHistory(hist);
    } catch (err) { toast.error(err.response?.data?.detail || 'Send failed'); }
    finally { setWaSending(false); }
  };

  const sendEmail = async () => {
    if (!emailForm.selected_partners.length) { toast.error('Select at least one partner'); return; }
    setEmailSending(true);
    try {
      const { data } = await api.post('/api/email/send', {
        partner_ids: emailForm.selected_partners,
        template_id: emailForm.template_id ? parseInt(emailForm.template_id) : null,
        custom_subject: emailForm.custom_subject || null,
        custom_body: emailForm.custom_body || null,
      });
      toast.success(`${data.sent} emails sent`);
      setEmailForm(f => ({ ...f, selected_partners: [] }));
      const [dc, hist] = await Promise.all([
        api.get('/api/email/daily-count').then(r => r.data),
        api.get('/api/email/sent').then(r => r.data),
      ]);
      setEmailDailyCount(dc);
      setEmailSentHistory(hist);
    } catch (err) { toast.error(err.response?.data?.detail || 'Send failed'); }
    finally { setEmailSending(false); }
  };

  const DailyBar = ({ count, limit }) => {
    const atLimit = count >= limit;
    return (
      <div className="mb-5">
        <div className="mb-1.5 flex justify-between text-[13px]">
          <span className="font-semibold text-[var(--text)]">Daily limit</span>
          <span className={`font-bold ${atLimit ? 'text-red-500' : 'text-emerald-600 dark:text-emerald-400'}`}>{count} / {limit}</span>
        </div>
        <div className="h-2 rounded bg-[var(--surface-2)]">
          <div className={`h-full rounded transition-[width] duration-300 ${atLimit ? 'bg-red-500' : 'bg-emerald-500'}`}
            style={{ width: `${Math.min(100, (count / limit) * 100)}%` }} />
        </div>
      </div>
    );
  };

  const renderSendPanel = (isWa) => {
    const form = isWa ? waForm : emailForm;
    const setForm = isWa ? setWaForm : setEmailForm;
    const templates = isWa ? waTemplates : emailTemplates;
    const selectedTemplate = isWa ? selectedWaTemplate : selectedEmailTemplate;
    const dailyCount = isWa ? waDailyCount : emailDailyCount;
    const sending = isWa ? waSending : emailSending;
    const doSend = isWa ? sendWhatsApp : sendEmail;

    return (
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        {/* Left: Form */}
        <div className="card p-6">
          <DailyBar count={dailyCount.count} limit={dailyCount.limit} />

          <label className="label">Select Template</label>
          <select className="input mb-3" value={form.template_id} onChange={e => setForm(f => ({ ...f, template_id: e.target.value }))}>
            <option value="">— Custom message —</option>
            {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>

          {!form.template_id && (
            <>
              {!isWa && (
                <>
                  <label className="label">Subject</label>
                  <input className="input mb-3" placeholder="Subject line..." value={emailForm.custom_subject} onChange={e => setEmailForm(f => ({ ...f, custom_subject: e.target.value }))} />
                </>
              )}
              <label className="label">{isWa ? 'Message' : 'Body (HTML)'}</label>
              <textarea
                className={`input mb-3 resize-y ${isWa ? 'min-h-[100px]' : 'min-h-[150px]'}`}
                placeholder={isWa ? 'Type your message...' : '<p>Your email body...</p>'}
                value={isWa ? waForm.custom_message : emailForm.custom_body}
                onChange={e => setForm(f => ({ ...f, [isWa ? 'custom_message' : 'custom_body']: e.target.value }))}
              />
            </>
          )}

          {selectedTemplate && (
            <div className="mb-3 max-h-[150px] overflow-auto whitespace-pre-wrap rounded-lg bg-[var(--surface-2)] p-3 text-[13px] leading-relaxed text-[var(--text-muted)]">
              {isWa ? selectedTemplate.body : selectedTemplate.subject}
            </div>
          )}

          {!form.selected_partners.length && (
            <div className="mb-2.5 rounded-md bg-amber-500/15 px-3 py-2 text-xs font-medium text-amber-700 dark:text-amber-300">
              ← Select recipients from the panel on the right first
            </div>
          )}
          <button
            onClick={doSend}
            disabled={sending || !form.selected_partners.length || dailyCount.count >= dailyCount.limit}
            className="btn btn-primary w-full py-3 text-sm font-bold">
            {sending ? 'Sending...' : form.selected_partners.length ? `Send to ${form.selected_partners.length} Partner${form.selected_partners.length !== 1 ? 's' : ''}` : 'No recipients selected'}
          </button>
        </div>

        {/* Right: Recipients */}
        <div className="card p-6">
          <div className="mb-3 flex items-center justify-between">
            <label className="label mb-0">Select Recipients ({form.selected_partners.length} selected)</label>
            <button onClick={() => selectAll(form, setForm)} className="text-xs font-semibold text-accent dark:text-accent-light">Select All</button>
          </div>
          <select className="input mb-3" value={partnerFilter} onChange={e => setPartnerFilter(e.target.value)}>
            <option value="">All Partners</option>
            <option value="Active Partner">Active Partners</option>
            <option value="New">New</option>
            <option value="Contacted">Contacted</option>
          </select>
          <div className="max-h-[320px] overflow-y-auto rounded-lg border border-[var(--border)]">
            {filteredPartners.map(p => {
              const isSelected = form.selected_partners.includes(p.id);
              const isBlocked = ['Not Interested', 'Inactive'].includes(p.status);
              return (
                <div key={p.id}
                  onClick={() => !isBlocked && togglePartner(p.id, form, setForm)}
                  className={`flex items-center gap-2.5 border-b border-[var(--border)] px-3.5 py-2.5 ${isBlocked ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'} ${isSelected ? 'bg-accent-soft dark:bg-accent/15' : ''}`}>
                  <input type="checkbox" checked={isSelected} readOnly className="h-4 w-4 cursor-pointer accent-[var(--color-primary)]" />
                  <div>
                    <div className="text-[13px] font-semibold text-[var(--text)]">{p.full_name}</div>
                    <div className="text-[11px] text-[var(--text-muted)]">{p.partner_type} · {p.status}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  };

  const renderHistory = (history, isWa) => (
    <div className="card mt-6 overflow-hidden">
      <div className="border-b border-[var(--border)] px-5 py-3.5 text-sm font-semibold text-[var(--text)]">Sent History</div>
      <table className="data-table">
        <thead>
          <tr>
            {['Partner', isWa ? 'Message' : 'Subject', 'Sent At', 'Status'].map(h => (
              <th key={h} className="th">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {history.length === 0 && <tr><td colSpan={4} className="td p-[30px] text-center text-[var(--text-muted)]">No history yet</td></tr>}
          {history.slice(0, 50).map(m => (
            <tr key={m.id}>
              <td className="td font-semibold text-[var(--text)]">{m.partner_name}</td>
              <td className="td max-w-[200px] text-[var(--text-muted)]">
                <div className="overflow-hidden text-ellipsis whitespace-nowrap">
                  {isWa ? m.message_body : m.subject}
                </div>
              </td>
              <td className="td text-xs text-[var(--text-muted)]">{new Date(m.sent_at).toLocaleString()}</td>
              <td className="td">
                <span className="badge badge-success">{m.status}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  return (
    <div>
      <h1 className="page-title mb-6">Outreach Center</h1>

      <div className="mb-6 flex gap-0 border-b-2 border-[var(--border)]">
        {[['whatsapp', '📱 WhatsApp'], ['email', '📧 Email']].map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)}
            className={`-mb-0.5 border-b-[3px] px-6 py-2.5 text-sm transition ${tab === key ? 'border-accent font-bold text-accent dark:text-accent-light dark:border-accent-light' : 'border-transparent font-medium text-[var(--text-muted)]'}`}>
            {label}
          </button>
        ))}
      </div>

      {tab === 'whatsapp' && (
        <>
          {renderSendPanel(true)}
          {renderHistory(waSentHistory, true)}
        </>
      )}
      {tab === 'email' && (
        <>
          {renderSendPanel(false)}
          {renderHistory(emailSentHistory, false)}
        </>
      )}
    </div>
  );
}
