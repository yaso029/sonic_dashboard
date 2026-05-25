import { useEffect, useState } from 'react';
import portalApi from '../../portalApi';
import toast from 'react-hot-toast';

export default function PortalProfile() {
  const [profile, setProfile] = useState(null);
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);

  useEffect(() => {
    portalApi.get('/api/portal/profile').then(r => setProfile(r.data)).catch(() => {});
  }, []);

  const submitRequest = async (e) => {
    e.preventDefault();
    if (!message.trim()) { toast.error('Describe the change you need'); return; }
    setSending(true);
    try {
      await portalApi.post('/api/portal/profile/change-request', { message });
      toast.success('Request sent to your marketing_specialist');
      setMessage('');
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to send');
    } finally {
      setSending(false);
    }
  };

  if (!profile) return <div className="text-gray-400">Loading...</div>;

  const monthName = profile.fiscal_year_end_month
    ? new Date(2000, profile.fiscal_year_end_month - 1).toLocaleString('default', { month: 'short' })
    : null;

  const fields = [
    ['Company Name', profile.company_name],
    ['Primary Contact', profile.primary_contact_name],
    ['Email', profile.primary_email],
    ['Phone', profile.primary_phone],
    ['TRN', profile.trn],
    ['CT Registration #', profile.ct_registration_number],
    ['Trade License #', profile.trade_license_number],
    ['Emirate', profile.trade_license_emirate],
    ['Legal Form', profile.legal_form ? profile.legal_form.toUpperCase() : null],
    ['Industry', profile.industry],
    ['Fiscal Year End', monthName ? `${monthName} ${profile.fiscal_year_end_day || ''}` : null],
  ];

  return (
    <div>
      <h1 className="mb-[18px] text-[22px] font-extrabold text-ink">Company Profile</h1>

      <div className="card mb-6 px-6 py-[22px]">
        <div className="grid gap-[18px]" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
          {fields.map(([k, v]) => (
            <div key={k}>
              <div className="mb-0.5 text-[10px] font-semibold uppercase tracking-wide text-gray-400">{k}</div>
              <div className="text-[13px] text-ink">{v || '—'}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="card px-6 py-[22px]">
        <h2 className="mb-1.5 text-[15px] font-bold text-ink">Request a change</h2>
        <p className="mb-3 text-[13px] text-gray-400">Need to update any of the above? Send a request and your marketing_specialist will review it.</p>
        <form onSubmit={submitRequest}>
          <textarea value={message} onChange={e => setMessage(e.target.value)} placeholder="e.g. Our trade license number has changed to..."
            className="input mb-3 min-h-[90px] resize-y" />
          <button type="submit" disabled={sending} className="btn btn-primary">
            {sending ? 'Sending...' : 'Send Request'}
          </button>
        </form>
      </div>
    </div>
  );
}
