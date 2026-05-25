import { useState, useEffect, useRef } from 'react';
import api from '../../api';
import toast from 'react-hot-toast';

const STATUS_BADGE = {
  active: { className: 'badge-success', label: 'Active' },
  on_leave: { className: 'badge-warning', label: 'On Leave' },
  terminated: { className: 'badge-error', label: 'Terminated' },
};

const EMP_TYPES = [
  { value: 'full_time', label: 'Full Time' },
  { value: 'part_time', label: 'Part Time' },
  { value: 'contract', label: 'Contract' },
];

const NATIONALITIES = [
  { value: '', label: 'Select nationality' },
  { value: 'AE', label: '🇦🇪 UAE' }, { value: 'SA', label: '🇸🇦 Saudi Arabia' },
  { value: 'EG', label: '🇪🇬 Egypt' }, { value: 'JO', label: '🇯🇴 Jordan' },
  { value: 'LB', label: '🇱🇧 Lebanon' }, { value: 'SY', label: '🇸🇾 Syria' },
  { value: 'IQ', label: '🇮🇶 Iraq' }, { value: 'IN', label: '🇮🇳 India' },
  { value: 'PK', label: '🇵🇰 Pakistan' }, { value: 'BD', label: '🇧🇩 Bangladesh' },
  { value: 'LK', label: '🇱🇰 Sri Lanka' }, { value: 'NP', label: '🇳🇵 Nepal' },
  { value: 'PH', label: '🇵🇭 Philippines' }, { value: 'CN', label: '🇨🇳 China' },
  { value: 'TR', label: '🇹🇷 Turkey' }, { value: 'IR', label: '🇮🇷 Iran' },
  { value: 'GB', label: '🇬🇧 United Kingdom' }, { value: 'FR', label: '🇫🇷 France' },
  { value: 'DE', label: '🇩🇪 Germany' }, { value: 'RU', label: '🇷🇺 Russia' },
  { value: 'US', label: '🇺🇸 United States' }, { value: 'CA', label: '🇨🇦 Canada' },
  { value: 'NG', label: '🇳🇬 Nigeria' }, { value: 'KE', label: '🇰🇪 Kenya' },
  { value: 'ET', label: '🇪🇹 Ethiopia' }, { value: 'OTHER', label: '🌍 Other' },
];

const DEPARTMENTS = ['Sales', 'Marketing', 'Operations', 'Finance', 'HR', 'Legal', 'Technology', 'Management', 'Other'];

const EMPTY_FORM = {
  full_name: '', job_title: '', department: '', phone: '', email: '',
  nationality: '', date_of_birth: '', date_joined: '', employment_type: 'full_time',
  status: 'active', emirates_id: '', emirates_id_expiry: '', passport_number: '',
  passport_expiry: '', visa_expiry: '', notes: '',
};

function Avatar({ src, name, size = 48 }) {
  const initials = (name || '?').split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();
  if (src) return <img src={src} alt={name} className="flex-shrink-0 rounded-full border-2 border-[var(--border)] object-cover" style={{ width: size, height: size }} />;
  return (
    <div
      className="flex flex-shrink-0 items-center justify-center rounded-full border-2 border-[var(--border)] bg-gradient-to-br from-primary to-secondary font-extrabold text-white"
      style={{ width: size, height: size, fontSize: size * 0.33 }}
    >
      {initials}
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div className="mb-6">
      <div className="mb-3 border-b border-[var(--border)] pb-1.5 text-[11px] font-extrabold uppercase tracking-widest text-accent">
        {title}
      </div>
      {children}
    </div>
  );
}

function Grid2({ children }) {
  return <div className="grid grid-cols-2 gap-x-4">{children}</div>;
}

export default function Employees() {
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [docLabel, setDocLabel] = useState('');
  const [uploadingDoc, setUploadingDoc] = useState(false);
  const photoRef = useRef();
  const docRef = useRef();

  useEffect(() => { fetchEmployees(); }, []);

  async function fetchEmployees() {
    try {
      const { data } = await api.get('/api/hr/employees');
      setEmployees(data);
    } catch { toast.error('Failed to load employees'); }
    finally { setLoading(false); }
  }

  async function fetchEmployee(id) {
    const { data } = await api.get(`/api/hr/employees/${id}`);
    setSelected(data);
  }

  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }));

  function openAdd() {
    setForm(EMPTY_FORM);
    setEditMode(false);
    setShowForm(true);
  }

  function openEdit(emp) {
    setForm({
      full_name: emp.full_name || '', job_title: emp.job_title || '',
      department: emp.department || '', phone: emp.phone || '',
      email: emp.email || '', nationality: emp.nationality || '',
      date_of_birth: emp.date_of_birth || '', date_joined: emp.date_joined || '',
      employment_type: emp.employment_type || 'full_time', status: emp.status || 'active',
      emirates_id: emp.emirates_id || '', emirates_id_expiry: emp.emirates_id_expiry || '',
      passport_number: emp.passport_number || '', passport_expiry: emp.passport_expiry || '',
      visa_expiry: emp.visa_expiry || '', notes: emp.notes || '',
    });
    setEditMode(true);
    setShowForm(true);
  }

  async function saveEmployee(e) {
    e.preventDefault();
    setSaving(true);
    try {
      if (editMode && selected) {
        const { data } = await api.put(`/api/hr/employees/${selected.id}`, form);
        setEmployees(prev => prev.map(emp => emp.id === data.id ? data : emp));
        setSelected(data);
        toast.success('Employee updated');
      } else {
        const { data } = await api.post('/api/hr/employees', form);
        setEmployees(prev => [data, ...prev]);
        setSelected(data);
        toast.success('Employee added');
      }
      setShowForm(false);
    } catch { toast.error('Failed to save'); }
    finally { setSaving(false); }
  }

  async function deleteEmployee(emp) {
    if (!window.confirm(`Delete ${emp.full_name}? This cannot be undone.`)) return;
    await api.delete(`/api/hr/employees/${emp.id}`);
    setEmployees(prev => prev.filter(e => e.id !== emp.id));
    if (selected?.id === emp.id) setSelected(null);
    toast.success('Employee deleted');
  }

  async function uploadPhoto(file) {
    if (!selected) return;
    setUploadingPhoto(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const { data } = await api.post(`/api/hr/employees/${selected.id}/photo`, fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setSelected(prev => ({ ...prev, photo_url: data.photo_url }));
      setEmployees(prev => prev.map(e => e.id === selected.id ? { ...e, photo_url: data.photo_url } : e));
      toast.success('Photo updated');
    } catch { toast.error('Photo upload failed'); }
    finally { setUploadingPhoto(false); }
  }

  async function uploadDocument(file) {
    if (!selected || !docLabel.trim()) { toast.error('Please enter a document label first'); return; }
    setUploadingDoc(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('label', docLabel.trim());
      const { data } = await api.post(`/api/hr/employees/${selected.id}/documents`, fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setSelected(prev => ({ ...prev, documents: [...(prev.documents || []), data] }));
      setDocLabel('');
      toast.success('Document uploaded');
    } catch { toast.error('Document upload failed'); }
    finally { setUploadingDoc(false); }
  }

  async function deleteDocument(docId) {
    if (!window.confirm('Remove this document?')) return;
    await api.delete(`/api/hr/employees/${selected.id}/documents/${docId}`);
    setSelected(prev => ({ ...prev, documents: prev.documents.filter(d => d.id !== docId) }));
    toast.success('Document removed');
  }

  const filtered = employees.filter(e =>
    e.full_name.toLowerCase().includes(search.toLowerCase()) ||
    (e.job_title || '').toLowerCase().includes(search.toLowerCase()) ||
    (e.department || '').toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="flex h-[calc(100vh-116px)] gap-6">

      {/* ── LEFT: Employee List ── */}
      <div className="card flex w-80 flex-shrink-0 flex-col overflow-hidden">
        <div className="border-b border-[var(--border)] px-4 pb-3 pt-4">
          <div className="mb-2.5 flex items-center justify-between">
            <div>
              <div className="text-base font-extrabold text-[var(--text)]">Employees</div>
              <div className="text-xs text-[var(--text-muted)]">{employees.length} total</div>
            </div>
            <button onClick={openAdd} className="btn btn-primary btn-sm">+ Add</button>
          </div>
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search employees..."
            className="input"
          />
        </div>

        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="p-6 text-center text-sm text-[var(--text-muted)]">Loading...</div>
          ) : filtered.length === 0 ? (
            <div className="p-8 text-center text-sm text-[var(--text-muted)]">
              {employees.length === 0 ? 'No employees yet. Add your first one.' : 'No results.'}
            </div>
          ) : filtered.map(emp => {
            const st = STATUS_BADGE[emp.status] || STATUS_BADGE.active;
            const isActive = selected?.id === emp.id;
            return (
              <div
                key={emp.id}
                onClick={() => fetchEmployee(emp.id)}
                className={`flex cursor-pointer items-center gap-3 border-b border-l-[3px] border-b-[var(--border)] px-4 py-3 transition-colors ${isActive ? 'border-l-primary bg-accent-soft dark:bg-accent/15' : 'border-l-transparent hover:bg-[var(--surface-2)]'}`}
              >
                <Avatar src={emp.photo_url} name={emp.full_name} size={42} />
                <div className="min-w-0 flex-1">
                  <div className="overflow-hidden text-ellipsis whitespace-nowrap text-sm font-bold text-[var(--text)]">{emp.full_name}</div>
                  <div className="overflow-hidden text-ellipsis whitespace-nowrap text-xs text-[var(--text-muted)]">{emp.job_title || '—'}</div>
                </div>
                <span className={`badge ${st.className} whitespace-nowrap`}>
                  {st.label}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── RIGHT: Employee Detail ── */}
      {!selected ? (
        <div className="card flex flex-1 items-center justify-center">
          <div className="text-center text-[var(--text-muted)]">
            <div className="mb-3 text-5xl">👤</div>
            <div className="text-[15px] font-semibold">Select an employee to view their profile</div>
          </div>
        </div>
      ) : (
        <div className="card flex flex-1 flex-col overflow-y-auto">

          {/* Profile Header */}
          <div className="flex items-end gap-5 bg-gradient-to-br from-primary to-secondary px-8 py-7">
            <div className="relative">
              <Avatar src={selected.photo_url} name={selected.full_name} size={80} />
              <button
                onClick={() => photoRef.current.click()}
                disabled={uploadingPhoto}
                className="absolute bottom-0 right-0 flex h-[26px] w-[26px] items-center justify-center rounded-full border-none bg-accent text-[13px] text-white"
                title="Upload photo"
              >
                {uploadingPhoto ? '⏳' : '📷'}
              </button>
              <input ref={photoRef} type="file" accept="image/*" className="hidden"
                onChange={e => e.target.files[0] && uploadPhoto(e.target.files[0])} />
            </div>
            <div className="flex-1">
              <div className="text-[22px] font-black text-white">{selected.full_name}</div>
              <div className="mt-0.5 text-sm text-white/70">{selected.job_title || '—'} {selected.department ? `· ${selected.department}` : ''}</div>
            </div>
            <div className="flex gap-2">
              <button onClick={() => openEdit(selected)} className="rounded-lg border border-white/25 bg-white/15 px-4 py-2 text-[13px] font-semibold text-white hover:bg-white/25">✏️ Edit</button>
              <button onClick={() => deleteEmployee(selected)} className="rounded-lg border border-red-400/40 bg-red-500/20 px-4 py-2 text-[13px] font-semibold text-red-300 hover:bg-red-500/30">🗑 Delete</button>
            </div>
          </div>

          {/* Content */}
          <div className="flex-1 px-8 py-7">

            {/* Status + Type badges */}
            <div className="mb-6 flex gap-2">
              {(() => { const st = STATUS_BADGE[selected.status] || STATUS_BADGE.active; return (
                <span className={`badge ${st.className}`}>{st.label}</span>
              ); })()}
              <span className="badge bg-blue-500/15 text-blue-700 dark:text-blue-300">
                {EMP_TYPES.find(t => t.value === selected.employment_type)?.label || 'Full Time'}
              </span>
            </div>

            {/* Personal Info */}
            <Section title="Personal Information">
              <Grid2>
                <InfoRow label="Phone" value={selected.phone} />
                <InfoRow label="Email" value={selected.email} />
                <InfoRow label="Nationality" value={selected.nationality_label} />
                <InfoRow label="Date of Birth" value={selected.date_of_birth} />
                <InfoRow label="Date Joined" value={selected.date_joined} />
              </Grid2>
            </Section>

            {/* Documents */}
            <Section title="Identity & Visa">
              <Grid2>
                <InfoRow label="Emirates ID" value={selected.emirates_id} />
                <InfoRow label="Emirates ID Expiry" value={selected.emirates_id_expiry} />
                <InfoRow label="Passport Number" value={selected.passport_number} />
                <InfoRow label="Passport Expiry" value={selected.passport_expiry} />
                <InfoRow label="Visa Expiry" value={selected.visa_expiry} />
              </Grid2>
            </Section>

            {selected.notes && (
              <Section title="Notes">
                <p className="m-0 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-4 py-3 text-[13px] leading-relaxed text-[var(--text)]">
                  {selected.notes}
                </p>
              </Section>
            )}

            {/* File Documents */}
            <Section title="Documents & Files">
              {/* Upload new doc */}
              <div className="mb-4 rounded-[10px] border-[1.5px] border-dashed border-[var(--border)] bg-[var(--surface-2)] p-4">
                <div className="mb-2 text-xs font-bold text-[var(--text-muted)]">UPLOAD NEW DOCUMENT</div>
                <div className="flex gap-2">
                  <input
                    value={docLabel} onChange={e => setDocLabel(e.target.value)}
                    placeholder="Label (e.g. Passport Copy, Contract...)"
                    className="input flex-1"
                  />
                  <button
                    onClick={() => docRef.current.click()}
                    disabled={uploadingDoc || !docLabel.trim()}
                    className="btn btn-primary whitespace-nowrap"
                  >
                    {uploadingDoc ? 'Uploading...' : '📎 Upload File'}
                  </button>
                </div>
                <input ref={docRef} type="file" className="hidden"
                  onChange={e => e.target.files[0] && uploadDocument(e.target.files[0])} />
              </div>

              {/* Doc list */}
              {(selected.documents || []).length === 0 ? (
                <div className="py-3 text-center text-[13px] text-[var(--text-muted)]">No documents uploaded yet.</div>
              ) : (selected.documents || []).map(doc => (
                <div key={doc.id} className="mb-2 flex items-center gap-3 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3.5 py-2.5">
                  <span className="text-xl">📄</span>
                  <div className="flex-1">
                    <div className="text-[13px] font-bold text-[var(--text)]">{doc.label}</div>
                    <div className="text-[11px] text-[var(--text-muted)]">{doc.file_name}</div>
                  </div>
                  <a href={doc.file_url} target="_blank" rel="noopener noreferrer" className="rounded-md bg-accent-soft px-3 py-1.5 text-xs font-semibold text-accent dark:bg-accent/15">View</a>
                  <button onClick={() => deleteDocument(doc.id)} className="rounded-md border-none bg-red-500/10 px-2.5 py-1.5 text-xs text-red-600 dark:text-red-400">✕</button>
                </div>
              ))}
            </Section>

          </div>
        </div>
      )}

      {/* ── ADD / EDIT MODAL ── */}
      {showForm && (
        <div className="modal-overlay">
          <div className="modal w-[640px] max-h-[88vh] overflow-y-auto p-8">
            <div className="mb-6 flex items-center justify-between">
              <h2 className="m-0 text-lg font-extrabold text-[var(--text)]">{editMode ? 'Edit Employee' : 'Add New Employee'}</h2>
              <button onClick={() => setShowForm(false)} className="border-none bg-transparent text-[22px] text-[var(--text-muted)] hover:text-[var(--text)]">×</button>
            </div>
            <form onSubmit={saveEmployee}>

              <Section title="Basic Info">
                <Grid2>
                  <div className="mb-3.5">
                    <label className="label">Full Name *</label>
                    <input className="input" value={form.full_name} onChange={set('full_name')} required />
                  </div>
                  <div className="mb-3.5">
                    <label className="label">Job Title</label>
                    <input className="input" value={form.job_title} onChange={set('job_title')} />
                  </div>
                  <div className="mb-3.5">
                    <label className="label">Department</label>
                    <select className="input" value={form.department} onChange={set('department')}>
                      <option value="">Select...</option>
                      {DEPARTMENTS.map(d => <option key={d} value={d}>{d}</option>)}
                    </select>
                  </div>
                  <div className="mb-3.5">
                    <label className="label">Status</label>
                    <select className="input" value={form.status} onChange={set('status')}>
                      <option value="active">Active</option>
                      <option value="on_leave">On Leave</option>
                      <option value="terminated">Terminated</option>
                    </select>
                  </div>
                  <div className="mb-3.5">
                    <label className="label">Employment Type</label>
                    <select className="input" value={form.employment_type} onChange={set('employment_type')}>
                      {EMP_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                    </select>
                  </div>
                  <div className="mb-3.5">
                    <label className="label">Nationality</label>
                    <select className="input" value={form.nationality} onChange={set('nationality')}>
                      {NATIONALITIES.map(n => <option key={n.value} value={n.value}>{n.label}</option>)}
                    </select>
                  </div>
                </Grid2>
              </Section>

              <Section title="Contact">
                <Grid2>
                  <div className="mb-3.5">
                    <label className="label">Phone</label>
                    <input className="input" value={form.phone} onChange={set('phone')} type="tel" />
                  </div>
                  <div className="mb-3.5">
                    <label className="label">Email</label>
                    <input className="input" value={form.email} onChange={set('email')} type="email" />
                  </div>
                </Grid2>
              </Section>

              <Section title="Dates">
                <Grid2>
                  <div className="mb-3.5">
                    <label className="label">Date of Birth</label>
                    <input className="input" value={form.date_of_birth} onChange={set('date_of_birth')} type="date" />
                  </div>
                  <div className="mb-3.5">
                    <label className="label">Date Joined</label>
                    <input className="input" value={form.date_joined} onChange={set('date_joined')} type="date" />
                  </div>
                </Grid2>
              </Section>

              <Section title="Identity & Visa">
                <Grid2>
                  <div className="mb-3.5">
                    <label className="label">Emirates ID</label>
                    <input className="input" value={form.emirates_id} onChange={set('emirates_id')} placeholder="784-XXXX-XXXXXXX-X" />
                  </div>
                  <div className="mb-3.5">
                    <label className="label">Emirates ID Expiry</label>
                    <input className="input" value={form.emirates_id_expiry} onChange={set('emirates_id_expiry')} type="date" />
                  </div>
                  <div className="mb-3.5">
                    <label className="label">Passport Number</label>
                    <input className="input" value={form.passport_number} onChange={set('passport_number')} />
                  </div>
                  <div className="mb-3.5">
                    <label className="label">Passport Expiry</label>
                    <input className="input" value={form.passport_expiry} onChange={set('passport_expiry')} type="date" />
                  </div>
                  <div className="mb-3.5">
                    <label className="label">Visa Expiry</label>
                    <input className="input" value={form.visa_expiry} onChange={set('visa_expiry')} type="date" />
                  </div>
                </Grid2>
              </Section>

              <Section title="Notes">
                <textarea className="input min-h-[80px] resize-y" value={form.notes} onChange={set('notes')} placeholder="Any additional notes..." />
              </Section>

              <div className="mt-2 flex justify-end gap-2.5">
                <button type="button" onClick={() => setShowForm(false)} className="btn btn-ghost">Cancel</button>
                <button type="submit" disabled={saving} className="btn btn-primary">
                  {saving ? 'Saving...' : editMode ? 'Save Changes' : 'Add Employee'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function InfoRow({ label, value }) {
  return (
    <div className="mb-3.5">
      <div className="mb-1 text-[10px] font-bold uppercase tracking-wide text-[var(--text-muted)]">{label}</div>
      <div className={`text-[13px] font-semibold ${value ? 'text-[var(--text)]' : 'text-[var(--text-muted)]/60'}`}>{value || '—'}</div>
    </div>
  );
}
