import { useEffect, useState } from 'react';
import api from '../../api';
import toast from 'react-hot-toast';

export default function TaskFormModal({ clientId, services = [], onClose, onSaved }) {
  const [users, setUsers] = useState([]);
  const [form, setForm] = useState({
    title: '',
    description: '',
    service_id: '',
    due_date: '',
    priority: 'normal',
    status: 'todo',
    assigned_to: '',
  });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api.get('/api/users').then(r => setUsers(r.data.filter(u => u.is_active))).catch(() => {});
  }, []);

  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const payload = {
        ...form,
        client_id: clientId,
        service_id: form.service_id ? parseInt(form.service_id) : null,
        assigned_to: form.assigned_to ? parseInt(form.assigned_to) : null,
        due_date: form.due_date || null,
      };
      const { data } = await api.post('/api/tasks', payload);
      toast.success('Task created');
      onSaved(data);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal w-[480px] px-8 py-7">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-lg font-bold">New Task</h2>
          <button onClick={onClose} className="text-2xl text-gray-400">×</button>
        </div>
        <form onSubmit={handleSubmit}>
          <label className="label">Title *</label>
          <input className="input mb-3" value={form.title} onChange={set('title')} required placeholder="e.g. Prepare Q1 VAT return" />

          <label className="label">Description</label>
          <textarea className="input mb-3 min-h-[60px] resize-y" value={form.description} onChange={set('description')} />

          <div className="mb-3 grid grid-cols-2 gap-3">
            <div>
              <label className="label">Link to Service</label>
              <select className="input" value={form.service_id} onChange={set('service_id')}>
                <option value="">— None —</option>
                {services.map(s => (
                  <option key={s.id} value={s.id}>{s.service_type.replace(/_/g, ' ')}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Due Date</label>
              <input className="input" type="date" value={form.due_date} onChange={set('due_date')} />
            </div>
            <div>
              <label className="label">Priority</label>
              <select className="input" value={form.priority} onChange={set('priority')}>
                <option value="low">Low</option>
                <option value="normal">Normal</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </select>
            </div>
            <div>
              <label className="label">Status</label>
              <select className="input" value={form.status} onChange={set('status')}>
                <option value="todo">To Do</option>
                <option value="in_progress">In Progress</option>
                <option value="blocked">Blocked</option>
                <option value="done">Done</option>
              </select>
            </div>
            <div className="col-span-2">
              <label className="label">Assigned To</label>
              <select className="input" value={form.assigned_to} onChange={set('assigned_to')}>
                <option value="">Me</option>
                {users.map(u => <option key={u.id} value={u.id}>{u.full_name}</option>)}
              </select>
            </div>
          </div>

          <div className="flex justify-end gap-2.5">
            <button type="button" onClick={onClose} className="btn btn-ghost">Cancel</button>
            <button type="submit" disabled={loading} className="btn btn-primary">
              {loading ? 'Saving...' : 'Create Task'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
