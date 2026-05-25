import { useState, useEffect } from 'react';
import api from '../../api';
import { useAuth } from '../../AuthContext';
import toast from 'react-hot-toast';
import useIsMobile from '../../hooks/useIsMobile';

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];

function getMondayOfWeek(date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function getWeekDays(monday) {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(d.getDate() + i);
    return d;
  });
}

function toLocalDateStr(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function fmt12(time) {
  if (!time) return '';
  const [h, m] = time.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
}

function isToday(date) {
  const t = new Date();
  return date.getFullYear() === t.getFullYear() && date.getMonth() === t.getMonth() && date.getDate() === t.getDate();
}

// ── Add/Edit Event Modal ────────────────────────────────────────────────────
function EventModal({ user, onClose, onSaved, defaultDate, editEvent }) {
  const isEdit = !!editEvent;
  const isAdmin = user?.role === 'admin';

  const [form, setForm] = useState({
    title: editEvent?.title || '',
    date: editEvent?.date || defaultDate || toLocalDateStr(new Date()),
    time_start: editEvent?.time_start || '',
    time_end: editEvent?.time_end || '',
    location: editEvent?.location || '',
    hosted_by: editEvent?.hosted_by || user?.full_name || '',
    description: editEvent?.description || '',
    visibility: editEvent?.visibility || 'everyone',
  });
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState(editEvent?.image_url || null);
  const [saving, setSaving] = useState(false);

  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }));

  const pickImage = e => {
    const f = e.target.files[0];
    if (!f) return;
    setImageFile(f);
    setImagePreview(URL.createObjectURL(f));
  };

  const handleSubmit = async e => {
    e.preventDefault();
    if (!form.title.trim() || !form.date) { toast.error('Title and date are required'); return; }
    setSaving(true);
    try {
      const payload = {
        title: form.title,
        date: form.date,
        time_start: form.time_start || null,
        time_end: form.time_end || null,
        location: form.location || null,
        hosted_by: form.hosted_by || null,
        description: form.description || null,
        visibility: isAdmin ? form.visibility : 'everyone',
      };
      let eventId;
      if (isEdit) {
        await api.put(`/api/calendar/events/${editEvent.id}`, payload);
        eventId = editEvent.id;
        toast.success('Event updated!');
      } else {
        const { data: created } = await api.post('/api/calendar/events', payload);
        eventId = created.id;
        toast.success(isAdmin ? 'Event added!' : 'Event submitted for approval');
      }
      if (imageFile) {
        const fd = new FormData();
        fd.append('file', imageFile);
        await api.post(`/api/calendar/events/${eventId}/image`, fd, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
      }
      onSaved();
      onClose();
    } catch { toast.error('Failed to save event'); }
    finally { setSaving(false); }
  };

  return (
    <div onClick={onClose} className="modal-overlay">
      <div onClick={e => e.stopPropagation()} className="modal w-full max-w-[540px] max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between border-b border-[var(--border)] px-6 py-[22px]">
          <div className="text-[17px] font-extrabold text-[var(--text)]">
            📅 {isEdit ? 'Edit Event' : isAdmin ? 'Add Event' : 'Submit Event for Approval'}
          </div>
          <button onClick={onClose} className="border-none bg-transparent text-xl text-[var(--text-muted)] hover:text-[var(--text)]">×</button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3.5 px-6 py-5">
          <div>
            <label className="label">Title *</label>
            <input required value={form.title} onChange={set('title')} placeholder="Event title" className="input" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Date *</label>
              <input required type="date" value={form.date} onChange={set('date')} className="input" />
            </div>
            <div>
              <label className="label">Start Time</label>
              <input type="time" value={form.time_start} onChange={set('time_start')} className="input" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">End Time</label>
              <input type="time" value={form.time_end} onChange={set('time_end')} className="input" />
            </div>
            <div>
              <label className="label">Hosted By</label>
              <input value={form.hosted_by} onChange={set('hosted_by')} placeholder={user?.full_name} className="input" />
            </div>
          </div>

          <div>
            <label className="label">Location</label>
            <input value={form.location} onChange={set('location')} placeholder="Office, Dubai Marina, Online…" className="input" />
          </div>

          <div>
            <label className="label">Description</label>
            <textarea value={form.description} onChange={set('description')} rows={3} placeholder="What's this event about?" className="input resize-y" />
          </div>

          {/* Image upload */}
          <div>
            <label className="label">Event Photo (optional)</label>
            {imagePreview ? (
              <div className="relative inline-block">
                <img src={imagePreview} alt="preview" className="max-h-40 w-full rounded-lg border-[1.5px] border-[var(--border)] object-cover" />
                <button type="button" onClick={() => { setImageFile(null); setImagePreview(null); }} className="absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full border-none bg-black/60 text-sm text-white">×</button>
              </div>
            ) : (
              <label className="flex cursor-pointer items-center gap-2.5 rounded-lg border-[1.5px] border-dashed border-[var(--border)] px-4 py-3 text-sm text-[var(--text-muted)]">
                📷 Click to upload photo
                <input type="file" accept="image/*" onChange={pickImage} className="hidden" />
              </label>
            )}
          </div>

          {/* Visibility — admin only */}
          {isAdmin && (
            <div>
              <label className="label">Visibility</label>
              <div className="flex gap-2.5">
                {[['everyone', '🌐 Everyone'], ['private', '🔒 Only Me']].map(([val, lbl]) => (
                  <button key={val} type="button" onClick={() => setForm(f => ({ ...f, visibility: val }))}
                    className={`flex-1 rounded-lg border-2 px-2 py-2.5 text-sm font-semibold transition ${form.visibility === val ? 'border-accent bg-accent-soft text-accent dark:bg-accent/15' : 'border-[var(--border)] bg-[var(--surface)] text-[var(--text-muted)]'}`}>
                    {lbl}
                  </button>
                ))}
              </div>
            </div>
          )}

          {!isAdmin && (
            <div className="rounded-lg border border-amber-300 bg-amber-50 px-3.5 py-2.5 text-xs text-amber-700 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-300">
              ⚠️ Your event will be reviewed by admin before it appears on the calendar.
            </div>
          )}

          <div className="flex gap-2.5 pt-1">
            <button type="button" onClick={onClose} className="btn btn-ghost flex-1">Cancel</button>
            <button type="submit" disabled={saving} className="btn btn-primary flex-[2]">
              {saving ? 'Saving…' : isEdit ? 'Save Changes' : isAdmin ? 'Add Event' : 'Submit for Approval'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Event Detail Modal ──────────────────────────────────────────────────────
function EventDetailModal({ event, user, onClose, onApprove, onReject, onDelete, onEdit }) {
  const isAdmin = user?.role === 'admin';
  const isPending = event.status === 'pending';

  return (
    <div onClick={onClose} className="modal-overlay">
      <div onClick={e => e.stopPropagation()} className="modal w-full max-w-[500px] max-h-[90vh] overflow-y-auto">
        {event.image_url && (
          <div className="h-[220px] w-full overflow-hidden rounded-t-2xl">
            <img src={event.image_url} alt={event.title} className="h-full w-full object-cover" />
          </div>
        )}

        <div className="px-6 py-5">
          <div className="mb-2 flex items-start justify-between">
            <h2 className="mr-3 flex-1 text-xl font-extrabold text-[var(--text)]">{event.title}</h2>
            <button onClick={onClose} className="flex-shrink-0 border-none bg-transparent text-xl text-[var(--text-muted)] hover:text-[var(--text)]">×</button>
          </div>

          {isPending && (
            <div className="mb-3 inline-block">
              <span className="badge badge-warning">⏳ Pending Approval</span>
            </div>
          )}
          {event.visibility === 'private' && (
            <div className="mb-3 ml-1.5 inline-block">
              <span className="badge badge-accent">🔒 Private</span>
            </div>
          )}

          <div className="mt-3 flex flex-col gap-2.5">
            <Row icon="📅" label="Date" value={event.date} />
            {event.time_start && <Row icon="🕐" label="Time" value={`${fmt12(event.time_start)}${event.time_end ? ` – ${fmt12(event.time_end)}` : ''}`} />}
            {event.location && <Row icon="📍" label="Location" value={event.location} />}
            {event.hosted_by && <Row icon="👤" label="Hosted By" value={event.hosted_by} />}
            {event.creator_name && <Row icon="✍️" label="Submitted By" value={event.creator_name} />}
            {event.description && (
              <div>
                <div className="mb-1 text-[11px] font-bold uppercase tracking-wide text-[var(--text-muted)]">Description</div>
                <div className="rounded-lg bg-[var(--surface-2)] px-3 py-2.5 text-sm leading-relaxed text-[var(--text)]">{event.description}</div>
              </div>
            )}
          </div>

          {isAdmin && isPending && (
            <div className="mt-5 flex gap-2.5">
              <button onClick={() => onReject(event.id)} className="btn btn-danger flex-1">
                ✗ Reject
              </button>
              <button onClick={() => onApprove(event.id)} className="btn flex-[2] bg-emerald-500 text-white hover:bg-emerald-600">
                ✓ Approve & Publish
              </button>
            </div>
          )}

          {isAdmin && (
            <div className="mt-4 flex gap-2.5">
              <button onClick={() => onEdit(event)} className="btn btn-outline flex-1">
                ✏️ Edit
              </button>
              <button onClick={() => onDelete(event.id)} className="btn btn-danger flex-1">
                🗑 Delete
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Row({ icon, label, value }) {
  return (
    <div className="flex items-start gap-2.5">
      <span className="flex-shrink-0 text-base">{icon}</span>
      <div>
        <div className="text-[11px] font-bold uppercase tracking-wide text-[var(--text-muted)]">{label}</div>
        <div className="mt-px text-sm text-[var(--text)]">{value}</div>
      </div>
    </div>
  );
}

// ── Pending Approvals Panel ─────────────────────────────────────────────────
function PendingPanel({ events, onApprove, onReject, onClose }) {
  return (
    <div onClick={onClose} className="fixed inset-0 z-[200] flex justify-end bg-black/50">
      <div onClick={e => e.stopPropagation()} className="h-full w-[380px] overflow-y-auto bg-[var(--surface)] shadow-[-8px_0_30px_rgba(0,0,0,0.15)]">
        <div className="flex items-center justify-between border-b border-[var(--border)] px-5 py-5">
          <div className="text-base font-extrabold text-[var(--text)]">⏳ Pending Approvals</div>
          <button onClick={onClose} className="border-none bg-transparent text-xl text-[var(--text-muted)] hover:text-[var(--text)]">×</button>
        </div>
        {events.length === 0 ? (
          <div className="p-10 text-center text-sm text-[var(--text-muted)]">No pending events</div>
        ) : events.map(ev => (
          <div key={ev.id} className="border-b border-[var(--border)] px-5 py-4">
            {ev.image_url && <img src={ev.image_url} alt="" className="mb-2.5 h-[120px] w-full rounded-lg object-cover" />}
            <div className="text-sm font-bold text-[var(--text)]">{ev.title}</div>
            <div className="mt-0.5 text-xs text-[var(--text-muted)]">
              {ev.date}{ev.time_start ? ` · ${fmt12(ev.time_start)}` : ''}{ev.location ? ` · ${ev.location}` : ''}
            </div>
            {ev.hosted_by && <div className="text-xs text-[var(--text-muted)]">Hosted by: {ev.hosted_by}</div>}
            {ev.creator_name && <div className="mt-0.5 text-[11px] text-[var(--text-muted)]/70">Submitted by: {ev.creator_name}</div>}
            {ev.description && <div className="mt-1.5 text-xs leading-relaxed text-[var(--text-muted)]">{ev.description}</div>}
            <div className="mt-3 flex gap-2">
              <button onClick={() => onReject(ev.id)} className="btn btn-danger btn-sm flex-1">Reject</button>
              <button onClick={() => onApprove(ev.id)} className="btn btn-sm flex-[2] bg-emerald-500 text-white hover:bg-emerald-600">✓ Approve</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Event Card (in calendar cell) ──────────────────────────────────────────
function EventCard({ event, onClick }) {
  const isPending = event.status === 'pending';
  return (
    <div
      onClick={() => onClick(event)}
      className={`flex cursor-pointer items-center gap-2 rounded-lg border-[1.5px] border-l-[3px] p-1.5 px-2 transition-shadow hover:shadow-card ${
        isPending
          ? 'border-dashed border-amber-400 border-l-amber-500 bg-amber-50 dark:bg-amber-500/10'
          : 'border-solid border-[var(--border)] border-l-accent bg-[var(--surface)]'
      }`}
    >
      {event.image_url ? (
        <img src={event.image_url} alt="" className="h-9 w-9 flex-shrink-0 rounded-md object-cover" />
      ) : (
        <div className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-md text-lg ${isPending ? 'bg-amber-100 dark:bg-amber-500/20' : 'bg-accent/15'}`}>
          {isPending ? '⏳' : '📅'}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <div className="overflow-hidden text-ellipsis whitespace-nowrap text-xs font-bold text-[var(--text)]">{event.title}</div>
        {event.time_start && <div className="mt-px text-[11px] text-[var(--text-muted)]">{fmt12(event.time_start)}</div>}
        {isPending && <div className="text-[10px] font-semibold text-amber-600 dark:text-amber-400">Pending</div>}
      </div>
    </div>
  );
}

// ── Main Page ───────────────────────────────────────────────────────────────
export default function CalendarPage() {
  const { user } = useAuth();
  const isMobile = useIsMobile();
  const isAdmin = user?.role === 'admin';

  const [weekStart, setWeekStart] = useState(() => getMondayOfWeek(new Date()));
  const [events, setEvents] = useState([]);
  const [pendingEvents, setPendingEvents] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showPending, setShowPending] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [editingEvent, setEditingEvent] = useState(null);
  const [selectedDay, setSelectedDay] = useState(() => toLocalDateStr(new Date())); // mobile
  const [clickedDate, setClickedDate] = useState(null);

  const weekDays = getWeekDays(weekStart);
  const fromDate = toLocalDateStr(weekDays[0]);
  const toDate = toLocalDateStr(weekDays[6]);

  const eventsByDate = events.reduce((acc, ev) => {
    if (!acc[ev.date]) acc[ev.date] = [];
    acc[ev.date].push(ev);
    return acc;
  }, {});

  const fetchEvents = async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/api/calendar/events', { params: { date_from: fromDate, date_to: toDate } });
      setEvents(data);
    } catch { toast.error('Failed to load events'); }
    finally { setLoading(false); }
  };

  const fetchPending = async () => {
    if (!isAdmin) return;
    try {
      const { data } = await api.get('/api/calendar/events/pending');
      setPendingEvents(data);
    } catch {}
  };

  useEffect(() => { fetchEvents(); }, [weekStart]);
  useEffect(() => { fetchPending(); }, []);

  const prevWeek = () => setWeekStart(d => { const n = new Date(d); n.setDate(n.getDate() - 7); return n; });
  const nextWeek = () => setWeekStart(d => { const n = new Date(d); n.setDate(n.getDate() + 7); return n; });
  const goToday = () => setWeekStart(getMondayOfWeek(new Date()));

  const handleApprove = async (id) => {
    try {
      await api.patch(`/api/calendar/events/${id}/approve`);
      toast.success('Event approved!');
      setPendingEvents(p => p.filter(e => e.id !== id));
      fetchEvents();
      if (selectedEvent?.id === id) setSelectedEvent(prev => ({ ...prev, status: 'approved' }));
    } catch { toast.error('Failed to approve'); }
  };

  const handleReject = async (id) => {
    try {
      await api.patch(`/api/calendar/events/${id}/reject`);
      toast.success('Event rejected');
      setPendingEvents(p => p.filter(e => e.id !== id));
      setEvents(prev => prev.filter(e => e.id !== id));
      if (selectedEvent?.id === id) setSelectedEvent(null);
    } catch { toast.error('Failed to reject'); }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this event permanently?')) return;
    try {
      await api.delete(`/api/calendar/events/${id}`);
      toast.success('Event deleted');
      setEvents(prev => prev.filter(e => e.id !== id));
      setSelectedEvent(null);
    } catch { toast.error('Failed to delete'); }
  };

  const handleSaved = () => { fetchEvents(); fetchPending(); };

  // Week label
  const startMonth = MONTH_NAMES[weekDays[0].getMonth()];
  const endMonth = MONTH_NAMES[weekDays[6].getMonth()];
  const weekLabel = startMonth === endMonth
    ? `${startMonth} ${weekDays[0].getDate()} – ${weekDays[6].getDate()}, ${weekDays[6].getFullYear()}`
    : `${startMonth} ${weekDays[0].getDate()} – ${endMonth} ${weekDays[6].getDate()}, ${weekDays[6].getFullYear()}`;

  return (
    <div className="max-w-full">
      {/* Modals */}
      {(showAddModal || editingEvent) && (
        <EventModal
          user={user}
          onClose={() => { setShowAddModal(false); setEditingEvent(null); }}
          onSaved={handleSaved}
          defaultDate={clickedDate}
          editEvent={editingEvent}
        />
      )}
      {selectedEvent && (
        <EventDetailModal event={selectedEvent} user={user} onClose={() => setSelectedEvent(null)}
          onApprove={id => { handleApprove(id); setSelectedEvent(null); }}
          onReject={id => { handleReject(id); setSelectedEvent(null); }}
          onDelete={id => { handleDelete(id); }}
          onEdit={ev => { setSelectedEvent(null); setEditingEvent(ev); }} />
      )}
      {showPending && isAdmin && (
        <PendingPanel events={pendingEvents} onApprove={handleApprove} onReject={handleReject} onClose={() => setShowPending(false)} />
      )}

      {/* Header */}
      <div className="mb-5 flex flex-wrap items-center justify-between gap-2.5">
        <div>
          <h1 className="page-title">📅 Events Calendar</h1>
          <p className="page-subtitle">
            {isAdmin ? 'Click a day to add an event, or click an event for details.' : 'View team events. Submit your own for admin approval.'}
          </p>
        </div>
        <div className="flex flex-wrap gap-2.5">
          {isAdmin && pendingEvents.length > 0 && (
            <button onClick={() => setShowPending(true)} className="flex items-center gap-1.5 rounded-lg border-[1.5px] border-amber-300 bg-amber-50 px-4 py-2 text-[13px] font-bold text-amber-700 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-300">
              ⏳ Pending
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-amber-500 text-[11px] font-extrabold text-white">{pendingEvents.length}</span>
            </button>
          )}
          <button onClick={() => { setClickedDate(null); setShowAddModal(true); }} className="btn btn-primary">
            + Add Event
          </button>
        </div>
      </div>

      {/* Week navigation */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <button onClick={prevWeek} className="btn btn-ghost">‹ Prev</button>
        <div className="flex-1 text-center text-[15px] font-bold text-[var(--text)]">{weekLabel}</div>
        <button onClick={goToday} className="btn btn-outline">Today</button>
        <button onClick={nextWeek} className="btn btn-ghost">Next ›</button>
      </div>

      {loading ? (
        <div className="p-10 text-center text-[var(--text-muted)]">Loading events…</div>
      ) : isMobile ? (
        /* ── Mobile: day selector + events list ── */
        <div>
          <div className="mb-4 flex gap-2 overflow-x-auto pb-2">
            {weekDays.map(d => {
              const str = toLocalDateStr(d);
              const active = str === selectedDay;
              const today = isToday(d);
              return (
                <button key={str} onClick={() => setSelectedDay(str)} className={`w-[52px] flex-shrink-0 rounded-[10px] border-[1.5px] px-1 py-2 text-center ${
                  active
                    ? 'border-primary bg-primary'
                    : today
                    ? 'border-accent bg-accent-soft dark:bg-accent/15'
                    : 'border-[var(--border)] bg-[var(--surface)]'
                }`}>
                  <div className={`text-[10px] font-bold uppercase ${active ? 'text-white' : 'text-[var(--text-muted)]'}`}>{DAY_NAMES[weekDays.indexOf(d)]}</div>
                  <div className={`mt-0.5 text-lg font-extrabold ${active ? 'text-white' : today ? 'text-accent' : 'text-[var(--text)]'}`}>{d.getDate()}</div>
                  {(eventsByDate[str] || []).length > 0 && (
                    <div className={`mx-auto mt-1 h-1.5 w-1.5 rounded-full ${active ? 'bg-white' : 'bg-accent'}`} />
                  )}
                </button>
              );
            })}
          </div>

          {isAdmin && (
            <button onClick={() => { setClickedDate(selectedDay); setShowAddModal(true); }} className="mb-3.5 w-full rounded-lg border-[1.5px] border-dashed border-accent bg-accent-soft px-2 py-2.5 text-[13px] font-semibold text-accent dark:bg-accent/15">
              + Add event on this day
            </button>
          )}

          <div className="flex flex-col gap-2.5">
            {(eventsByDate[selectedDay] || []).length === 0 ? (
              <div className="py-8 text-center text-sm text-[var(--text-muted)]">No events on this day</div>
            ) : (eventsByDate[selectedDay] || []).map(ev => (
              <EventCard key={ev.id} event={ev} onClick={setSelectedEvent} />
            ))}
          </div>
        </div>
      ) : (
        /* ── Desktop: horizontal day rows ── */
        <div className="flex flex-col gap-2">
          {weekDays.map((d, i) => {
            const str = toLocalDateStr(d);
            const today = isToday(d);
            const dayEvents = eventsByDate[str] || [];
            return (
              <div key={str} className={`flex min-h-[80px] items-stretch overflow-hidden rounded-xl border-[1.5px] ${today ? 'border-accent bg-accent-soft dark:bg-accent/10' : 'border-[var(--border)] bg-[var(--surface)]'}`}>
                {/* Day label — left fixed column */}
                <div
                  onClick={() => { if (isAdmin) { setClickedDate(str); setShowAddModal(true); } }}
                  className={`flex w-[88px] flex-shrink-0 flex-col items-center justify-center border-r-[1.5px] px-2 py-3 ${
                    today ? 'border-accent bg-accent/10' : 'border-[var(--border)] bg-transparent'
                  } ${isAdmin ? 'cursor-pointer' : 'cursor-default'}`}
                >
                  <div className={`text-[10px] font-bold uppercase tracking-wide ${today ? 'text-accent' : 'text-[var(--text-muted)]'}`}>{DAY_NAMES[i]}</div>
                  <div className={`text-[28px] font-black leading-tight ${today ? 'text-accent' : 'text-[var(--text)]'}`}>{d.getDate()}</div>
                  {isAdmin && <div className={`mt-1 text-[9px] ${today ? 'text-accent/60' : 'text-[var(--text-muted)]/60'}`}>+ add</div>}
                </div>

                {/* Events — horizontal row */}
                <div className="flex flex-1 flex-wrap content-center gap-2.5 px-3.5 py-2.5">
                  {dayEvents.length === 0 ? (
                    <span className="text-xs text-[var(--text-muted)]/60">No events</span>
                  ) : dayEvents.map(ev => (
                    <div key={ev.id} className="w-[230px]">
                      <EventCard event={ev} onClick={setSelectedEvent} />
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
