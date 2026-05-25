import { useEffect, useState, useRef } from 'react';
import api from '../../api';
import toast from 'react-hot-toast';

const PARTNER_TYPES = ['Personal Trainer', 'Car Dealer', 'Interior Designer', 'Financial Advisor', 'HR Manager', 'Hotel Concierge', 'Other'];
const STATUSES = ['New', 'Contacted', 'Active Partner', 'Not Interested', 'Inactive'];

// Data-driven per-status hues (applied inline on the badge below).
const STATUS_COLORS = {
  'New': '#6366f1', 'Contacted': '#3b82f6', 'Active Partner': '#10b981',
  'Not Interested': '#ef4444', 'Inactive': '#94a3b8',
};

function PartnerModal({ partner, onClose, onSaved }) {
  const isEdit = !!partner;
  const [form, setForm] = useState(partner ? { ...partner } : {
    full_name: '', whatsapp_number: '', email: '', company: '',
    partner_type: 'Other', status: 'New', commission_rate: 0.5, notes: '',
  });
  const [loading, setLoading] = useState(false);
  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (isEdit) {
        await api.put(`/api/partners/${partner.id}`, form);
        toast.success('Partner updated');
      } else {
        await api.post('/api/partners', form);
        toast.success('Partner added');
      }
      onSaved();
      onClose();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal w-[520px] max-h-[85vh] overflow-y-auto p-7">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-lg font-bold text-[var(--text)]">{isEdit ? 'Edit Partner' : 'Add Partner'}</h2>
          <button onClick={onClose} className="text-xl text-[var(--text-muted)] hover:text-[var(--text)]">×</button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="grid grid-cols-2 gap-x-4">
            <div className="col-span-2 mb-3"><label className="label">Full Name *</label><input className="input" value={form.full_name} onChange={set('full_name')} required /></div>
            <div className="mb-3"><label className="label">WhatsApp Number</label><input className="input" value={form.whatsapp_number} onChange={set('whatsapp_number')} placeholder="+971..." /></div>
            <div className="mb-3"><label className="label">Email</label><input className="input" type="email" value={form.email} onChange={set('email')} /></div>
            <div className="mb-3"><label className="label">Company</label><input className="input" value={form.company} onChange={set('company')} /></div>
            <div className="mb-3">
              <label className="label">Partner Type</label>
              <select className="input" value={form.partner_type} onChange={set('partner_type')}>
                {PARTNER_TYPES.map(t => <option key={t}>{t}</option>)}
              </select>
            </div>
            <div className="mb-3">
              <label className="label">Status</label>
              <select className="input" value={form.status} onChange={set('status')}>
                {STATUSES.map(s => <option key={s}>{s}</option>)}
              </select>
            </div>
            <div className="mb-3"><label className="label">Commission Rate (%)</label><input className="input" type="number" step="0.1" value={form.commission_rate} onChange={set('commission_rate')} /></div>
            <div className="col-span-2 mb-3"><label className="label">Notes</label><textarea className="input min-h-[70px] resize-y" value={form.notes} onChange={set('notes')} /></div>
          </div>
          <div className="mt-1 flex justify-end gap-2.5">
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

export default function Partners() {
  const [partners, setPartners] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [modal, setModal] = useState(null);
  const fileRef = useRef();

  const fetchPartners = async () => {
    setLoading(true);
    try {
      const params = {};
      if (typeFilter) params.partner_type = typeFilter;
      if (statusFilter) params.status = statusFilter;
      if (search) params.search = search;
      const { data } = await api.get('/api/partners', { params });
      setPartners(data);
    } catch { toast.error('Failed to load partners'); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchPartners(); }, [typeFilter, statusFilter]);

  const deletePartner = async (id) => {
    if (!confirm('Delete this partner?')) return;
    try {
      await api.delete(`/api/partners/${id}`);
      toast.success('Deleted');
      fetchPartners();
    } catch { toast.error('Failed'); }
  };

  const handleImport = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const form = new FormData();
    form.append('file', file);
    try {
      const { data } = await api.post('/api/partners/import', form);
      toast.success(`${data.created} partners imported`);
      fetchPartners();
    } catch (err) { toast.error(err.response?.data?.detail || 'Import failed'); }
    e.target.value = '';
  };

  const handleExport = async () => {
    try {
      const resp = await api.get('/api/partners/export', { responseType: 'blob' });
      const url = URL.createObjectURL(resp.data);
      const a = document.createElement('a'); a.href = url; a.download = 'partners.csv'; a.click();
    } catch { toast.error('Export failed'); }
  };

  const filtered = partners.filter(p =>
    !search || p.full_name.toLowerCase().includes(search.toLowerCase()) ||
    p.whatsapp_number?.includes(search) || p.email?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="page-title">Partner Contacts</h1>
          <p className="page-subtitle">{partners.length} partners total</p>
        </div>
        <div className="flex gap-2.5">
          <button onClick={handleExport} className="btn btn-outline">Export CSV</button>
          <button onClick={() => fileRef.current.click()} className="btn btn-outline">Import CSV</button>
          <button onClick={() => setModal('add')} className="btn btn-primary">+ Add Partner</button>
          <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={handleImport} />
        </div>
      </div>

      <div className="mb-5 flex flex-wrap gap-3">
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name, phone, email..."
          className="input min-w-[200px] flex-1" />
        <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)}
          className="input min-w-[170px] max-w-[200px]">
          <option value="">All Types</option>
          {PARTNER_TYPES.map(t => <option key={t}>{t}</option>)}
        </select>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
          className="input min-w-[150px] max-w-[180px]">
          <option value="">All Statuses</option>
          {STATUSES.map(s => <option key={s}>{s}</option>)}
        </select>
        <button onClick={fetchPartners} className="btn btn-ghost">Search</button>
      </div>

      <div className="card overflow-hidden">
        <table className="data-table">
          <thead>
            <tr>
              {['Name', 'WhatsApp', 'Email', 'Type', 'Status', 'Referrals', 'Commission', 'Last Contact', 'Actions'].map(h => (
                <th key={h} className="th">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={9} className="td p-10 text-center text-[var(--text-muted)]">Loading...</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={9} className="td p-10 text-center text-[var(--text-muted)]">No partners found</td></tr>
            ) : filtered.map(p => (
              <tr key={p.id}>
                <td className="td">
                  <div className="font-semibold text-[var(--text)]">{p.full_name}</div>
                  {p.company && <div className="text-[11px] text-[var(--text-muted)]">{p.company}</div>}
                </td>
                <td className="td text-[var(--text-muted)]">{p.whatsapp_number || '—'}</td>
                <td className="td text-[var(--text-muted)]">{p.email || '—'}</td>
                <td className="td text-[var(--text-muted)]">{p.partner_type}</td>
                <td className="td">
                  <span className="badge" style={{ background: `${STATUS_COLORS[p.status]}20`, color: STATUS_COLORS[p.status] }}>
                    {p.status}
                  </span>
                </td>
                <td className="td text-center text-[var(--text-muted)]">{p.total_referrals}</td>
                <td className="td font-semibold text-accent">
                  {p.total_commission_earned > 0 ? `AED ${p.total_commission_earned.toLocaleString()}` : '—'}
                </td>
                <td className="td text-xs text-[var(--text-muted)]">
                  {p.last_contacted_at ? new Date(p.last_contacted_at).toLocaleDateString() : '—'}
                </td>
                <td className="td">
                  <div className="flex gap-1.5">
                    <button onClick={() => setModal(p)} className="btn btn-outline btn-sm">Edit</button>
                    <button onClick={() => deletePartner(p.id)} className="btn btn-danger btn-sm">Delete</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modal && (
        <PartnerModal
          partner={modal === 'add' ? null : modal}
          onClose={() => setModal(null)}
          onSaved={fetchPartners}
        />
      )}
    </div>
  );
}
