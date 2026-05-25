import { useEffect, useRef, useState } from 'react';
import api from '../../api';
import toast from 'react-hot-toast';

const prettyCategory = (c) => c.replace(/_/g, ' ').replace(/\b\w/g, ch => ch.toUpperCase());

/**
 * Upload modal used in two modes:
 *  - Client-scoped (ClientDetailPage): pass `clientId` + that client's `services`.
 *  - Practice-wide (DocumentsPage): omit `clientId` — the modal shows a client
 *    picker and loads the chosen client's services for the "Link to Service" list.
 */
export default function DocumentUploadModal({ clientId, services = [], onClose, onSaved }) {
  const pickClient = !clientId;
  const [meta, setMeta] = useState({ categories: [], max_upload_bytes: 0, allowed_content_types: [] });
  const [category, setCategory] = useState('other');
  const [clients, setClients] = useState([]);
  const [pickedClientId, setPickedClientId] = useState('');
  const [pickedServices, setPickedServices] = useState([]);
  const [serviceId, setServiceId] = useState('');
  const [notes, setNotes] = useState('');
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const fileRef = useRef(null);

  const effectiveClientId = clientId || pickedClientId;
  const serviceOptions = clientId ? services : pickedServices;

  useEffect(() => {
    api.get('/api/documents/meta').then(r => {
      setMeta(r.data);
      if (r.data.categories?.length) setCategory(r.data.categories[0]);
    }).catch(() => {});
  }, []);

  // Practice-wide mode: load the full visible client list once.
  useEffect(() => {
    if (!pickClient) return;
    api.get('/api/clients').then(r => setClients(r.data)).catch(() => {});
  }, [pickClient]);

  // When a client is chosen in picker mode, load its services for the link dropdown.
  useEffect(() => {
    if (!pickClient || !pickedClientId) { setPickedServices([]); setServiceId(''); return; }
    setServiceId('');
    api.get(`/api/services?client_id=${pickedClientId}`)
      .then(r => setPickedServices(r.data))
      .catch(() => setPickedServices([]));
  }, [pickClient, pickedClientId]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!effectiveClientId) { toast.error('Choose a client'); return; }
    if (!file) { toast.error('Choose a file'); return; }
    if (meta.max_upload_bytes && file.size > meta.max_upload_bytes) {
      toast.error(`File exceeds ${(meta.max_upload_bytes / 1024 / 1024).toFixed(0)} MB limit`);
      return;
    }
    setLoading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('client_id', effectiveClientId);
      fd.append('category', category);
      if (serviceId) fd.append('service_id', serviceId);
      if (notes) fd.append('notes', notes);
      const { data } = await api.post('/api/documents', fd);
      toast.success('Document uploaded');
      onSaved(data);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Upload failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal w-[520px] px-8 py-7">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-lg font-bold">Upload Document</h2>
          <button onClick={onClose} className="text-2xl text-gray-400">×</button>
        </div>
        <form onSubmit={handleSubmit}>
          {pickClient && (
            <div className="mb-3.5">
              <label className="label">Client *</label>
              <select className="input" value={pickedClientId} onChange={e => setPickedClientId(e.target.value)}>
                <option value="">Select a client…</option>
                {clients.map(c => <option key={c.id} value={c.id}>{c.company_name}</option>)}
              </select>
            </div>
          )}

          <label className="label">File *</label>
          <div onClick={() => fileRef.current?.click()}
            className="mb-3.5 cursor-pointer rounded-[10px] border-2 border-dashed border-gray-300 bg-[#fafbff] px-4 py-5 text-center">
            <input ref={fileRef} type="file" className="hidden" onChange={e => setFile(e.target.files?.[0] || null)} />
            {file ? (
              <div>
                <div className="text-[13px] font-semibold text-navy">{file.name}</div>
                <div className="mt-0.5 text-[11px] text-gray-400">{(file.size / 1024).toFixed(1)} KB</div>
              </div>
            ) : (
              <div className="text-[13px] text-gray-400">Click to choose a file (PDF, image, Office, CSV)</div>
            )}
          </div>

          <div className="mb-3 grid grid-cols-2 gap-3">
            <div>
              <label className="label">Category</label>
              <select className="input" value={category} onChange={e => setCategory(e.target.value)}>
                {meta.categories.map(c => <option key={c} value={c}>{prettyCategory(c)}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Link to Service</label>
              <select className="input" value={serviceId} onChange={e => setServiceId(e.target.value)}>
                <option value="">None</option>
                {serviceOptions.map(s => <option key={s.id} value={s.id}>{prettyCategory(s.service_type)}</option>)}
              </select>
            </div>
            <div className="col-span-2">
              <label className="label">Notes</label>
              <textarea className="input min-h-[56px] resize-y" value={notes} onChange={e => setNotes(e.target.value)} />
            </div>
          </div>

          <div className="flex justify-end gap-2.5">
            <button type="button" onClick={onClose} className="btn btn-ghost">Cancel</button>
            <button type="submit" disabled={loading} className="btn btn-primary">
              {loading ? 'Uploading...' : 'Upload'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
