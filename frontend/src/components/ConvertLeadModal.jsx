import { useEffect, useState } from 'react';
import api from '../api';
import toast from 'react-hot-toast';

export default function ConvertLeadModal({ lead, onClose, onConverted }) {
  const [meta, setMeta] = useState({ legal_forms: [], emirates: [] });
  const [form, setForm] = useState({
    company_name: lead.company || '',
    primary_contact_name: lead.full_name || '',
    primary_email: lead.email || '',
    primary_phone: lead.phone || '',
    trn: '',
    ct_registration_number: '',
    trade_license_number: '',
    trade_license_emirate: '',
    legal_form: '',
    industry: '',
    fiscal_year_end_month: 12,
    fiscal_year_end_day: 31,
    esr_applicable: false,
    final_stage: 'monthly_retainer',
  });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api.get('/api/clients/meta').then(r => setMeta(r.data)).catch(() => {});
  }, []);

  const set = k => e => setForm(f => ({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (form.trn && !/^\d{15}$/.test(form.trn)) {
      toast.error('TRN must be exactly 15 digits');
      return;
    }
    setLoading(true);
    try {
      const payload = {
        ...form,
        fiscal_year_end_month: parseInt(form.fiscal_year_end_month) || 12,
        fiscal_year_end_day: parseInt(form.fiscal_year_end_day) || 31,
      };
      const { data } = await api.post(`/api/leads/${lead.id}/convert`, payload);
      toast.success('Lead converted to client!');
      onConverted(data.client_id);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Conversion failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal w-[620px] max-h-[90vh] overflow-y-auto p-7">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-lg font-bold text-[var(--text)]">Convert to Client</h2>
          <button onClick={onClose} className="text-[22px] text-[var(--text-muted)] hover:text-[var(--text)]">×</button>
        </div>
        <div className="mb-[18px] rounded-lg border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-xs text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300">
          Lead "<strong>{lead.full_name}</strong>" will be promoted to a Client.
          The lead will be moved to the stage you select below.
        </div>

        <form onSubmit={handleSubmit}>
          <div className="field-section">COMPANY</div>
          <div className="mb-4 grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="label">Company Name *</label>
              <input className="input" value={form.company_name} onChange={set('company_name')} required />
            </div>
            <div>
              <label className="label">Industry</label>
              <input className="input" value={form.industry} onChange={set('industry')} />
            </div>
            <div>
              <label className="label">Legal Form</label>
              <select className="input" value={form.legal_form} onChange={set('legal_form')}>
                <option value="">—</option>
                {meta.legal_forms.map(lf => <option key={lf} value={lf}>{lf.replace(/_/g, ' ').toUpperCase()}</option>)}
              </select>
            </div>
          </div>

          <div className="field-section">UAE TAX & LICENSING</div>
          <div className="mb-4 grid grid-cols-2 gap-3">
            <div>
              <label className="label">TRN (15 digits)</label>
              <input className="input" value={form.trn} onChange={set('trn')} maxLength={15} placeholder="optional" />
            </div>
            <div>
              <label className="label">CT Registration #</label>
              <input className="input" value={form.ct_registration_number} onChange={set('ct_registration_number')} placeholder="optional" />
            </div>
            <div>
              <label className="label">Trade License #</label>
              <input className="input" value={form.trade_license_number} onChange={set('trade_license_number')} placeholder="optional" />
            </div>
            <div>
              <label className="label">Emirate</label>
              <select className="input" value={form.trade_license_emirate} onChange={set('trade_license_emirate')}>
                <option value="">—</option>
                {meta.emirates.map(em => <option key={em} value={em}>{em}</option>)}
              </select>
            </div>
            <div className="flex items-center gap-2 pt-[22px]">
              <input type="checkbox" id="esr-cv" checked={!!form.esr_applicable} onChange={set('esr_applicable')} className="h-4 w-4 cursor-pointer accent-[var(--color-primary)]" />
              <label htmlFor="esr-cv" className="cursor-pointer text-[13px] text-[var(--text-muted)]">ESR Applicable</label>
            </div>
          </div>

          <div className="field-section">OUTCOME</div>
          <div className="mb-[18px]">
            <label className="label">Mark lead stage as</label>
            <select className="input" value={form.final_stage} onChange={set('final_stage')}>
              <option value="monthly_retainer">Monthly Retainer (ongoing engagement)</option>
              <option value="completed">Completed (one-time engagement)</option>
            </select>
          </div>

          <div className="flex justify-end gap-2.5">
            <button type="button" onClick={onClose} className="btn btn-ghost">Cancel</button>
            <button type="submit" disabled={loading} className="btn btn-primary">
              {loading ? 'Converting...' : 'Convert to Client'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
