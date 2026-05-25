import { useEffect, useRef, useState } from 'react';
import portalApi, { BASE } from '../../portalApi';
import toast from 'react-hot-toast';

const prettyCat = (c) => (c || '').replace(/_/g, ' ').replace(/\b\w/g, ch => ch.toUpperCase());
const fmtBytes = (b) => !b ? '—' : b < 1024 ? `${b} B` : b < 1048576 ? `${(b / 1024).toFixed(1)} KB` : `${(b / 1048576).toFixed(1)} MB`;

export default function PortalDocuments() {
  const [docs, setDocs] = useState([]);
  const [meta, setMeta] = useState({ categories: [] });
  const [category, setCategory] = useState('other');
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef(null);

  const fetchDocs = () => portalApi.get('/api/portal/documents').then(r => setDocs(r.data)).catch(() => {});

  useEffect(() => {
    fetchDocs();
    portalApi.get('/api/portal/documents/meta').then(r => { setMeta(r.data); if (r.data.categories?.[0]) setCategory(r.data.categories[0]); }).catch(() => {});
  }, []);

  const download = async (id) => {
    try {
      const { data } = await portalApi.get(`/api/portal/documents/${id}/signed-url`);
      window.open(`${BASE}${data.url}`, '_blank');
    } catch { toast.error('Could not download'); }
  };

  const onFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('category', category);
      await portalApi.post('/api/portal/documents', fd);
      toast.success('Uploaded');
      fetchDocs();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Upload failed');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  return (
    <div>
      <div className="mb-[18px] flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-[22px] font-extrabold text-ink">Documents</h1>
        <div className="flex items-center gap-2">
          <select value={category} onChange={e => setCategory(e.target.value)} className="input max-w-[200px] py-2">
            {meta.categories.map(c => <option key={c} value={c}>{prettyCat(c)}</option>)}
          </select>
          <input ref={fileRef} type="file" className="hidden" onChange={onFile} />
          <button onClick={() => fileRef.current?.click()} disabled={uploading} className="btn btn-primary">
            {uploading ? 'Uploading...' : '+ Upload'}
          </button>
        </div>
      </div>

      <div className="card overflow-hidden">
        <table className="data-table">
          <thead><tr>{['File', 'Category', 'Size', 'Date', ''].map(h => <th key={h} className="th">{h}</th>)}</tr></thead>
          <tbody>
            {docs.length === 0 ? (
              <tr><td colSpan={5} className="p-10 text-center text-gray-400">No documents yet. Upload requested files here.</td></tr>
            ) : docs.map(d => (
              <tr key={d.id}>
                <td className="td font-semibold text-ink">{d.file_name}</td>
                <td className="td"><span className="rounded-full bg-indigo-50 px-2.5 py-0.5 text-[11px] font-semibold text-navy">{prettyCat(d.category)}</span></td>
                <td className="td text-xs text-gray-400">{fmtBytes(d.size_bytes)}</td>
                <td className="td text-xs text-gray-400">{d.created_at ? new Date(d.created_at).toLocaleDateString() : '—'}</td>
                <td className="td">
                  <button onClick={() => download(d.id)} className="rounded-md border-[1.5px] border-navy bg-white px-2.5 py-1 text-[11px] font-semibold text-navy">Download</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
