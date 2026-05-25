import { useEffect, useState } from 'react';
import api from '../../api';

const EMPTY_FORM = {
  user_id: '', full_name: '', job_title: '', phone: '',
  whatsapp: '', email: '', website: '', linkedin: '', is_active: true,
};

export default function ECards() {
  const [cards, setCards] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [photoFile, setPhotoFile] = useState(null);
  const [photoPreview, setPhotoPreview] = useState(null);

  const fetchCards = () => api.get('/api/ecards').then(r => setCards(r.data)).finally(() => setLoading(false));
  const fetchUsers = () => api.get('/api/users').then(r => setUsers(r.data)).catch(() => {});

  useEffect(() => { fetchCards(); fetchUsers(); }, []);

  const openNew = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setPhotoFile(null);
    setPhotoPreview(null);
    setShowForm(true);
  };

  const openEdit = (card) => {
    setEditing(card);
    setForm({
      user_id: card.user_id || '',
      full_name: card.full_name,
      job_title: card.job_title || '',
      phone: card.phone || '',
      whatsapp: card.whatsapp || '',
      email: card.email || '',
      website: card.website || '',
      linkedin: card.linkedin || '',
      is_active: card.is_active,
    });
    setPhotoFile(null);
    setPhotoPreview(card.photo_url || null);
    setShowForm(true);
  };

  const handlePhoto = (file) => {
    if (!file) return;
    setPhotoFile(file);
    setPhotoPreview(URL.createObjectURL(file));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        ...form,
        user_id: form.user_id ? parseInt(form.user_id) : null,
      };
      let saved;
      if (editing) {
        const r = await api.put(`/api/ecards/${editing.id}`, payload);
        saved = r.data;
      } else {
        const r = await api.post('/api/ecards', payload);
        saved = r.data;
      }
      if (photoFile) {
        setUploading(true);
        const fd = new FormData();
        fd.append('file', photoFile);
        await api.post(`/api/ecards/${saved.id}/photo`, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
        setUploading(false);
      }
      setShowForm(false);
      fetchCards();
    } catch { }
    setSaving(false);
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this E-card?')) return;
    await api.delete(`/api/ecards/${id}`);
    fetchCards();
  };

  const cardUrl = (slug) => `${window.location.origin}/card/${slug}`;

  return (
    <div>
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="page-title">E-Business Cards</h1>
          <p className="page-subtitle">Create and manage digital business cards for the team</p>
        </div>
        <button onClick={openNew} className="btn btn-primary">
          + New Card
        </button>
      </div>

      {/* Form Modal */}
      {showForm && (
        <div onClick={() => setShowForm(false)} className="modal-overlay">
          <div onClick={e => e.stopPropagation()} className="modal w-full max-w-[540px] max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-[var(--border)] px-6 py-5">
              <div className="text-base font-extrabold text-[var(--text)]">{editing ? 'Edit Card' : 'New E-Card'}</div>
              <button onClick={() => setShowForm(false)} className="border-none bg-transparent text-xl text-[var(--text-muted)] hover:text-[var(--text)]">×</button>
            </div>
            <form onSubmit={handleSubmit} className="flex flex-col gap-3.5 px-6 py-5">

              {/* Link to system user */}
              <div>
                <label className="label">Link to System User (optional)</label>
                <select value={form.user_id} onChange={e => {
                  const uid = e.target.value;
                  const u = users.find(u => u.id === parseInt(uid));
                  if (u) setForm(f => ({ ...f, user_id: uid, full_name: f.full_name || u.full_name, email: f.email || u.email }));
                  else setForm(f => ({ ...f, user_id: uid }));
                }} className="input">
                  <option value="">— No link —</option>
                  {users.map(u => <option key={u.id} value={u.id}>{u.full_name} ({u.role})</option>)}
                </select>
              </div>

              {/* Photo */}
              <div>
                <label className="label">Profile Photo</label>
                {photoPreview ? (
                  <div className="relative inline-block">
                    <img src={photoPreview} alt="" className="h-20 w-20 rounded-full border-2 border-[var(--border)] object-cover" />
                    <button type="button" onClick={() => { setPhotoFile(null); setPhotoPreview(null); }} className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full border-none bg-red-500 text-xs text-white">×</button>
                  </div>
                ) : (
                  <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border-[1.5px] border-dashed border-[var(--border)] px-3.5 py-2 text-sm text-[var(--text-muted)]">
                    📷 Upload Photo
                    <input type="file" accept="image/*" onChange={e => handlePhoto(e.target.files[0])} className="hidden" />
                  </label>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Full Name *</label>
                  <input required value={form.full_name} onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))} className="input" />
                </div>
                <div>
                  <label className="label">Job Title</label>
                  <input value={form.job_title} onChange={e => setForm(f => ({ ...f, job_title: e.target.value }))} placeholder="e.g. Senior Broker" className="input" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Phone</label>
                  <input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="+971 50 000 0000" className="input" />
                </div>
                <div>
                  <label className="label">WhatsApp</label>
                  <input value={form.whatsapp} onChange={e => setForm(f => ({ ...f, whatsapp: e.target.value }))} placeholder="+971 50 000 0000" className="input" />
                </div>
              </div>

              <div>
                <label className="label">Email</label>
                <input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} className="input" />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Website</label>
                  <input value={form.website} onChange={e => setForm(f => ({ ...f, website: e.target.value }))} placeholder="sonic.ae" className="input" />
                </div>
                <div>
                  <label className="label">LinkedIn URL</label>
                  <input value={form.linkedin} onChange={e => setForm(f => ({ ...f, linkedin: e.target.value }))} placeholder="linkedin.com/in/..." className="input" />
                </div>
              </div>

              <div className="flex items-center gap-2.5">
                <input type="checkbox" id="is_active" checked={form.is_active} onChange={e => setForm(f => ({ ...f, is_active: e.target.checked }))} className="h-4 w-4 cursor-pointer accent-[var(--color-primary)]" />
                <label htmlFor="is_active" className="cursor-pointer text-sm text-[var(--text-muted)]">Active (visible to everyone)</label>
              </div>

              <div className="flex gap-2.5 pt-1">
                <button type="button" onClick={() => setShowForm(false)} className="btn btn-ghost flex-1">Cancel</button>
                <button type="submit" disabled={saving || uploading} className="btn btn-primary flex-[2]">
                  {uploading ? 'Uploading photo…' : saving ? 'Saving…' : editing ? 'Save Changes' : 'Create Card'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Cards grid */}
      {loading ? (
        <div className="p-10 text-center text-[var(--text-muted)]">Loading…</div>
      ) : cards.length === 0 ? (
        <div className="py-16 text-center">
          <div className="mb-3 text-5xl">💳</div>
          <div className="text-base font-semibold text-[var(--text)]">No E-cards yet</div>
          <div className="mt-1 text-sm text-[var(--text-muted)]">Create the first digital business card for your team.</div>
        </div>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(320px,1fr))] gap-4">
          {cards.map(card => {
            const initials = card.full_name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
            const url = cardUrl(card.slug);
            return (
              <div key={card.id} className={`card overflow-hidden ${card.is_active ? '' : 'opacity-55'}`}>
                {/* Mini banner */}
                <div className="h-1.5 bg-gradient-to-r from-primary to-accent" />
                <div className="px-[18px] py-4">
                  <div className="mb-3 flex items-center gap-3">
                    {card.photo_url ? (
                      <img src={card.photo_url} alt="" className="h-[52px] w-[52px] flex-shrink-0 rounded-full border-2 border-accent/20 object-cover" />
                    ) : (
                      <div className="flex h-[52px] w-[52px] flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary to-secondary text-lg font-black text-accent-light">
                        {initials}
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="overflow-hidden text-ellipsis whitespace-nowrap text-[15px] font-extrabold text-[var(--text)]">{card.full_name}</div>
                      {card.job_title && <div className="mt-0.5 text-[11px] font-bold tracking-wide text-accent">{card.job_title}</div>}
                    </div>
                    {!card.is_active && <div className="rounded-full bg-[var(--surface-2)] px-2 py-0.5 text-[10px] font-bold text-[var(--text-muted)]">Inactive</div>}
                  </div>

                  {card.phone && <div className="mb-1 text-xs text-[var(--text-muted)]">📱 {card.phone}</div>}
                  {card.email && <div className="mb-1 overflow-hidden text-ellipsis whitespace-nowrap text-xs text-[var(--text-muted)]">✉️ {card.email}</div>}

                  <div className="mt-3 flex items-center gap-2">
                    <a href={url} target="_blank" rel="noreferrer" className="flex-1 rounded-lg bg-[var(--surface-2)] py-[7px] text-center text-[11px] font-bold text-accent">
                      🔗 View Card
                    </a>
                    <button onClick={() => { navigator.clipboard.writeText(url); }} className="flex-1 rounded-lg bg-[var(--surface-2)] py-[7px] text-[11px] font-bold text-[var(--text-muted)]">
                      📋 Copy Link
                    </button>
                    <button onClick={() => openEdit(card)} className="h-8 w-8 rounded-lg bg-[var(--surface-2)] text-sm">✏️</button>
                    <button onClick={() => handleDelete(card.id)} className="h-8 w-8 rounded-lg bg-red-500/10 text-sm">🗑️</button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
