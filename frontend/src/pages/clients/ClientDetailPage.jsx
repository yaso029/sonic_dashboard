import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../../api';
import toast from 'react-hot-toast';
import usePermissions from '../../hooks/usePermissions';
import ClientFormModal from './ClientFormModal';
import ServiceFormModal from './ServiceFormModal';
import TaskFormModal from './TaskFormModal';
import DocumentUploadModal from './DocumentUploadModal';
import PortalUsersModal from './PortalUsersModal';
import AnalyzeResultModal from './AnalyzeResultModal';

// status -> tailwind badge classes (covers client/service/task statuses)
const STATUS_BADGE = {
  active: 'bg-emerald-500/15 text-emerald-600', paused: 'bg-amber-500/15 text-amber-600',
  archived: 'bg-slate-400/15 text-slate-500', completed: 'bg-emerald-500/15 text-emerald-600',
  cancelled: 'bg-red-500/15 text-red-500', todo: 'bg-slate-500/15 text-slate-500',
  in_progress: 'bg-blue-500/15 text-blue-600', blocked: 'bg-red-500/15 text-red-500',
  done: 'bg-emerald-500/15 text-emerald-600',
};
const PRIORITY_BADGE = {
  low: 'bg-slate-400/15 text-slate-500', normal: 'bg-blue-500/15 text-blue-600',
  high: 'bg-amber-500/15 text-amber-600', urgent: 'bg-red-500/15 text-red-500',
};
const COMPLIANCE = {
  ok: { dot: 'bg-emerald-500', badge: 'bg-emerald-500/15 text-emerald-600' },
  action_needed: { dot: 'bg-red-500', badge: 'bg-red-500/15 text-red-500' },
  upcoming: { dot: 'bg-blue-500', badge: 'bg-blue-500/15 text-blue-600' },
  info: { dot: 'bg-slate-400', badge: 'bg-slate-400/15 text-slate-500' },
};

export default function ClientDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { can } = usePermissions();
  const [client, setClient] = useState(null);
  const [services, setServices] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [documents, setDocuments] = useState([]);
  const [checklist, setChecklist] = useState(null);
  const [aiEnabled, setAiEnabled] = useState(false);
  const [analyzingId, setAnalyzingId] = useState(null);
  const [analyzeResult, setAnalyzeResult] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('services');
  const [editingClient, setEditingClient] = useState(false);
  const [showServiceModal, setShowServiceModal] = useState(false);
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [showDocModal, setShowDocModal] = useState(false);
  const [showPortalModal, setShowPortalModal] = useState(false);

  const fetchAll = async () => {
    setLoading(true);
    try {
      const [c, s, t, d, cl] = await Promise.all([
        api.get(`/api/clients/${id}`).then(r => r.data),
        api.get(`/api/services?client_id=${id}`).then(r => r.data),
        api.get(`/api/tasks?client_id=${id}`).then(r => r.data),
        api.get(`/api/documents?client_id=${id}`).then(r => r.data).catch(() => []),
        api.get(`/api/clients/${id}/tax-checklist`).then(r => r.data).catch(() => null),
      ]);
      setClient(c); setServices(s); setTasks(t); setDocuments(d); setChecklist(cl);
    } catch {
      toast.error('Client not found');
      navigate('/clients');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchAll(); }, [id]);
  useEffect(() => {
    api.get('/api/ai/config').then(r => setAiEnabled(r.data.ai_enabled)).catch(() => {});
  }, []);

  const analyzeDoc = async (docId) => {
    setAnalyzingId(docId);
    try {
      const { data } = await api.post(`/api/documents/${docId}/analyze`);
      setAnalyzeResult(data);
      fetchAll();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Analysis failed');
    } finally {
      setAnalyzingId(null);
    }
  };

  const markTaskDone = async (taskId) => {
    try { await api.put(`/api/tasks/${taskId}`, { status: 'done' }); fetchAll(); toast.success('Task completed'); }
    catch { toast.error('Failed'); }
  };

  const downloadDoc = async (docId) => {
    try {
      const { data } = await api.get(`/api/documents/${docId}/signed-url`);
      window.open(`${api.defaults.baseURL || ''}${data.url}`, '_blank');
    } catch { toast.error('Could not generate download link'); }
  };

  const deleteDoc = async (docId) => {
    if (!window.confirm('Delete this document? This cannot be undone.')) return;
    try { await api.delete(`/api/documents/${docId}`); fetchAll(); toast.success('Document deleted'); }
    catch (err) { toast.error(err.response?.data?.detail || 'Delete failed'); }
  };

  const fmtBytes = (b) => !b ? '—' : b < 1024 ? `${b} B` : b < 1048576 ? `${(b / 1024).toFixed(1)} KB` : `${(b / 1048576).toFixed(1)} MB`;
  const prettyCat = (c) => (c || '').replace(/_/g, ' ').replace(/\b\w/g, ch => ch.toUpperCase());

  if (loading || !client) return <div className="p-10 text-gray-400">Loading...</div>;

  const fields = [
    ['Primary Contact', client.primary_contact_name],
    ['Email', client.primary_email],
    ['Phone', client.primary_phone],
    ['Industry', client.industry],
    ['Assigned', client.assigned_accountant_name],
  ];

  return (
    <div className="min-h-screen bg-page p-7">
      <button onClick={() => navigate('/clients')} className="mb-3 rounded-md border-[1.5px] border-gray-200 bg-white px-3 py-1.5 text-xs text-gray-600">← All Clients</button>

      {/* Header */}
      <div className="card mb-5 px-7 py-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <h1 className="text-2xl font-extrabold text-ink">{client.company_name}</h1>
            <div className="mt-1.5 flex flex-wrap items-center gap-3">
              <span className={`badge capitalize ${STATUS_BADGE[client.status] || 'bg-gray-100 text-gray-500'}`}>{client.status}</span>
              {client.industry && <span className="text-xs text-gray-400">{client.industry}</span>}
              {client.legal_form && <span className="text-xs uppercase text-gray-400">{client.legal_form}</span>}
            </div>
          </div>
          <div className="flex gap-2">
            {can('clients', 'update') && (
              <button onClick={() => setShowPortalModal(true)} className="btn btn-ghost">Portal Access</button>
            )}
            {can('clients', 'update') && (
              <button onClick={() => setEditingClient(true)} className="btn btn-outline">Edit</button>
            )}
          </div>
        </div>

        <div className="mt-5 grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
          {fields.map(([k, v]) => (
            <div key={k}>
              <div className="mb-0.5 text-[10px] font-semibold uppercase tracking-wide text-gray-400">{k}</div>
              <div className="text-[13px] text-ink">{v || '—'}</div>
            </div>
          ))}
        </div>

        {client.notes && (
          <div className="mt-4 rounded-lg bg-gray-50 px-4 py-3 text-[13px] leading-relaxed text-gray-600">{client.notes}</div>
        )}
      </div>

      {/* Tabs */}
      <div className="mb-4 flex gap-0.5 border-b border-gray-200">
        {[
          { key: 'services', label: `Services (${services.length})` },
          { key: 'tasks', label: `Tasks (${tasks.length})` },
          { key: 'documents', label: `Documents (${documents.length})` },
          { key: 'compliance', label: 'Marketing Audit' },
        ].map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`-mb-px border-b-[3px] px-5 py-2.5 text-sm font-semibold ${tab === t.key ? 'border-navy text-navy' : 'border-transparent text-gray-400'}`}>
            {t.label}
          </button>
        ))}
        <div className="flex-1" />
        {(() => {
          const cfg = {
            services: { perm: 'services', label: 'Service', open: () => setShowServiceModal(true) },
            tasks: { perm: 'tasks', label: 'Task', open: () => setShowTaskModal(true) },
            documents: { perm: 'documents', label: 'Document', open: () => setShowDocModal(true) },
          }[tab];
          return cfg && can(cfg.perm, 'create') && (
            <button onClick={cfg.open} className="btn btn-green btn-sm mb-2 px-4 py-2 text-[13px]">+ {cfg.label}</button>
          );
        })()}
      </div>

      {/* Content */}
      <div className="card overflow-hidden">
        {tab === 'services' ? (
          services.length === 0 ? (
            <div className="p-10 text-center text-gray-400">No services yet. Add one (Social Media Management, SEO, etc.)</div>
          ) : (
            <table className="data-table">
              <thead><tr>{['Service', 'Recurrence', 'Status', 'Assigned', 'Fee', 'Start'].map(h => <th key={h} className="th">{h}</th>)}</tr></thead>
              <tbody>
                {services.map(s => (
                  <tr key={s.id}>
                    <td className="td font-semibold text-ink">{s.service_type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}</td>
                    <td className="td capitalize text-gray-600">{s.recurrence.replace('_', ' ')}</td>
                    <td className="td"><span className={`badge capitalize ${STATUS_BADGE[s.status] || ''}`}>{s.status}</span></td>
                    <td className="td text-gray-600">{s.assigned_to_name || '—'}</td>
                    <td className="td font-semibold text-gold">{s.fee_amount ? `${s.fee_currency} ${Number(s.fee_amount).toLocaleString()}` : '—'}</td>
                    <td className="td text-xs text-gray-400">{s.start_date || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )
        ) : tab === 'tasks' ? (
          tasks.length === 0 ? (
            <div className="p-10 text-center text-gray-400">No tasks yet.</div>
          ) : (
            <table className="data-table">
              <thead><tr>{['Task', 'Due', 'Priority', 'Status', 'Assigned', ''].map(h => <th key={h} className="th">{h}</th>)}</tr></thead>
              <tbody>
                {tasks.map(t => (
                  <tr key={t.id}>
                    <td className="td font-semibold text-ink">{t.title}</td>
                    <td className="td text-xs text-gray-400">{t.due_date || '—'}</td>
                    <td className="td"><span className={`badge capitalize ${PRIORITY_BADGE[t.priority] || ''}`}>{t.priority}</span></td>
                    <td className="td"><span className={`badge capitalize ${STATUS_BADGE[t.status] || ''}`}>{t.status.replace('_', ' ')}</span></td>
                    <td className="td text-gray-600">{t.assigned_to_name || '—'}</td>
                    <td className="td">
                      {t.status !== 'done' && can('tasks', 'update') && (
                        <button onClick={() => markTaskDone(t.id)} className="rounded-md border-[1.5px] border-emerald-500 bg-white px-2.5 py-1 text-[11px] font-semibold text-emerald-600">Done</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )
        ) : tab === 'documents' ? (
          documents.length === 0 ? (
            <div className="p-10 text-center text-gray-400">
              No documents yet. {can('documents', 'create') ? 'Upload trade licenses, VAT returns, statements, etc.' : ''}
            </div>
          ) : (
            <table className="data-table">
              <thead><tr>{['File', 'Category', 'Size', 'Uploaded By', 'Date', ''].map(h => <th key={h} className="th">{h}</th>)}</tr></thead>
              <tbody>
                {documents.map(d => (
                  <tr key={d.id}>
                    <td className="td font-semibold text-ink">
                      {d.file_name}
                      {d.service_type && <div className="mt-0.5 text-[11px] text-gray-400">↳ {prettyCat(d.service_type)}</div>}
                      {d.ai_summary && <div className="mt-0.5 max-w-[320px] text-[11px] font-normal text-purple-600">✨ {d.ai_summary}</div>}
                    </td>
                    <td className="td"><span className="rounded-full bg-indigo-50 px-2.5 py-0.5 text-[11px] font-semibold text-navy">{prettyCat(d.category)}</span></td>
                    <td className="td text-xs text-gray-400">{fmtBytes(d.size_bytes)}</td>
                    <td className="td text-gray-600">{d.uploaded_by_name || '—'}</td>
                    <td className="td text-xs text-gray-400">{d.created_at ? new Date(d.created_at).toLocaleDateString() : '—'}</td>
                    <td className="td whitespace-nowrap">
                      <button onClick={() => downloadDoc(d.id)} className="mr-1.5 rounded-md border-[1.5px] border-navy bg-white px-2.5 py-1 text-[11px] font-semibold text-navy">Download</button>
                      {aiEnabled && (
                        <button onClick={() => analyzeDoc(d.id)} disabled={analyzingId === d.id}
                          className="mr-1.5 rounded-md border-[1.5px] border-purple-600 bg-white px-2.5 py-1 text-[11px] font-semibold text-purple-600 disabled:opacity-50">
                          {analyzingId === d.id ? 'Analyzing…' : (d.ai_analyzed_at ? 'Re-analyze' : '✨ Analyze')}
                        </button>
                      )}
                      {can('documents', 'delete') && (
                        <button onClick={() => deleteDoc(d.id)} className="rounded-md border-[1.5px] border-red-500 bg-white px-2.5 py-1 text-[11px] font-semibold text-red-500">Delete</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )
        ) : (
          /* Marketing Audit tab — deterministic, service-driven checklist */
          !checklist ? (
            <div className="p-10 text-center text-gray-400">No checklist available.</div>
          ) : (
            <div className="px-1 py-2">
              {checklist.items.map(it => {
                const c = COMPLIANCE[it.status] || COMPLIANCE.info;
                return (
                  <div key={it.key} className="flex items-start gap-3.5 border-b border-gray-100 px-4 py-3.5">
                    <span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${c.dot}`} />
                    <div className="flex-1">
                      <div className="flex flex-wrap items-center gap-2.5">
                        <span className="text-sm font-semibold text-ink">{it.title}</span>
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${c.badge}`}>{it.status.replace('_', ' ')}</span>
                        {it.due_date && <span className="text-xs text-gray-400">Due {it.due_date}</span>}
                      </div>
                      <div className="mt-1 text-[12.5px] leading-relaxed text-gray-600">{it.detail}</div>
                    </div>
                  </div>
                );
              })}
              <div className="px-4 py-3.5 text-[11px] italic leading-relaxed text-gray-400">{checklist.disclaimer}</div>
            </div>
          )
        )}
      </div>

      {editingClient && (
        <ClientFormModal client={client} onClose={() => setEditingClient(false)} onSaved={() => { setEditingClient(false); fetchAll(); }} />
      )}
      {showServiceModal && (
        <ServiceFormModal clientId={client.id} onClose={() => setShowServiceModal(false)} onSaved={() => { setShowServiceModal(false); fetchAll(); }} />
      )}
      {showTaskModal && (
        <TaskFormModal clientId={client.id} services={services} onClose={() => setShowTaskModal(false)} onSaved={() => { setShowTaskModal(false); fetchAll(); }} />
      )}
      {showDocModal && (
        <DocumentUploadModal clientId={client.id} services={services} onClose={() => setShowDocModal(false)} onSaved={() => { setShowDocModal(false); fetchAll(); }} />
      )}
      {showPortalModal && (
        <PortalUsersModal clientId={client.id} onClose={() => setShowPortalModal(false)} />
      )}
      {analyzeResult && (
        <AnalyzeResultModal result={analyzeResult} onClose={() => setAnalyzeResult(null)} />
      )}
    </div>
  );
}
