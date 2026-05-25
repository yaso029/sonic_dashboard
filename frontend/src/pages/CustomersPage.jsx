import { useEffect, useState, useRef } from 'react';
import api from '../api';
import toast from 'react-hot-toast';
import useIsMobile from '../hooks/useIsMobile';

const EMPTY_VALUES = new Set(['null', 'n/a', 'na', 'none', '-', '--', '', 'undefined', '#n/a', 'nil']);

function cleanValue(v) {
  const s = (v || '').toString().trim().replace(/^"|"$/g, '').trim();
  return EMPTY_VALUES.has(s.toLowerCase()) ? '' : s;
}

function formatPhone(raw) {
  if (!raw) return '';
  let digits = raw.replace(/[^\d+]/g, '').replace(/^\+/, '');
  if (digits.startsWith('00')) digits = digits.slice(2);
  if (digits.startsWith('05')) digits = '971' + digits.slice(1);
  if (digits.startsWith('5') && digits.length === 9) digits = '971' + digits;
  return '+' + digits;
}

function splitCSVLine(line) {
  const result = [];
  let cur = '', inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') { inQuotes = !inQuotes; continue; }
    if (ch === ',' && !inQuotes) { result.push(cur); cur = ''; continue; }
    cur += ch;
  }
  result.push(cur);
  return result;
}

function parseCSV(text) {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return { rows: [], skipped: 0 };
  const headers = splitCSVLine(lines[0]).map(h => h.trim().toLowerCase().replace(/[^a-z0-9_]/g, ''));
  let skipped = 0;
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const vals = splitCSVLine(lines[i]);
    const row = {};
    headers.forEach((h, idx) => { row[h] = cleanValue(vals[idx]); });
    const name = row['full_name'] || row['name'] || row['fullname'] || row['client_name'] || row['customer_name'] || '';
    const rawPhone = row['phone'] || row['phone_number'] || row['mobile'] || row['tel'] || row['telephone'] || '';
    const email = row['email'] || row['email_address'] || '';
    if (!name) { skipped++; continue; }
    const phone = rawPhone ? formatPhone(rawPhone) : '';
    const validPhone = phone.length >= 10;
    const validEmail = email.includes('@');
    if (!validPhone && !validEmail) { skipped++; continue; }
    rows.push({ full_name: name, phone: validPhone ? phone : '', email: validEmail ? email : '' });
  }
  return { rows, skipped };
}

export default function CustomersPage() {
  const isMobile = useIsMobile();
  const [dashboard, setDashboard] = useState(null);
  const [customers, setCustomers] = useState([]);
  const [loadingDash, setLoadingDash] = useState(true);
  const [loadingList, setLoadingList] = useState(true);
  const [syncingSelected, setSyncingSelected] = useState(false);
  const [syncingId, setSyncingId] = useState(null);
  const [search, setSearch] = useState('');
  const [syncFilter, setSyncFilter] = useState('all');
  const [selected, setSelected] = useState(new Set());
  const [tab, setTab] = useState('list'); // 'list' | 'log'
  const fileRef = useRef();

  const fetchDashboard = async () => {
    try {
      const { data } = await api.get('/api/customers/dashboard');
      setDashboard(data);
    } catch {}
    finally { setLoadingDash(false); }
  };

  const fetchCustomers = async () => {
    try {
      const { data } = await api.get('/api/customers');
      setCustomers(data.customers);
      setSelected(new Set());
    } catch { toast.error('Failed to load customers'); }
    finally { setLoadingList(false); }
  };

  useEffect(() => {
    fetchDashboard();
    fetchCustomers();
    const iv = setInterval(fetchDashboard, 60000);
    return () => clearInterval(iv);
  }, []);

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const text = await file.text();
    const { rows, skipped } = parseCSV(text);
    if (!rows.length) { toast.error('No valid rows found.'); e.target.value = ''; return; }
    try {
      const { data } = await api.post('/api/customers/import', { customers: rows });
      toast.success(`${data.added} imported, ${skipped} skipped`);
      fetchDashboard();
      fetchCustomers();
    } catch { toast.error('Import failed'); }
    e.target.value = '';
  };

  const syncSelected = async () => {
    if (!selected.size) return;
    setSyncingSelected(true);
    try {
      const { data } = await api.post('/api/customers/sync-selected', [...selected]);
      toast.success(`${data.synced} synced to Meta`);
      fetchDashboard();
      fetchCustomers();
    } catch { toast.error('Sync failed'); }
    finally { setSyncingSelected(false); }
  };

  const syncOne = async (id) => {
    setSyncingId(id);
    try {
      await api.post(`/api/customers/${id}/sync`);
      toast.success('Synced to Meta');
      fetchDashboard();
      fetchCustomers();
    } catch { toast.error('Sync failed'); }
    finally { setSyncingId(null); }
  };

  const deleteCustomer = async (id) => {
    if (!confirm('Delete this customer?')) return;
    try {
      await api.delete(`/api/customers/${id}`);
      fetchDashboard();
      fetchCustomers();
    } catch { toast.error('Delete failed'); }
  };

  const toggleOne = (id) => {
    setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  };

  const filtered = customers.filter(c => {
    if (syncFilter === 'synced' && !c.synced_to_meta) return false;
    if (syncFilter === 'not_synced' && c.synced_to_meta) return false;
    if (search && !c.full_name.toLowerCase().includes(search.toLowerCase()) &&
        !c.phone?.includes(search) && !c.email?.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const unsyncedInFilter = filtered.filter(c => !c.synced_to_meta);
  const allUnsyncedSelected = unsyncedInFilter.length > 0 && unsyncedInFilter.every(c => selected.has(c.id));

  const statCard = (label, value, icon, filter) => (
    <div
      onClick={() => filter && setSyncFilter(filter)}
      className={`stat-card min-w-[100px] flex-1 gap-0 p-3.5 ${filter ? 'cursor-pointer' : ''} ${syncFilter === filter ? 'bg-primary' : ''}`}
    >
      <div className="text-xl">{icon}</div>
      <div className={`text-2xl font-bold leading-tight ${syncFilter === filter ? 'text-white' : 'text-[var(--text)]'}`}>{value ?? '—'}</div>
      <div className={`mt-0.5 text-xs ${syncFilter === filter ? 'text-white/80' : 'text-[var(--text-muted)]'}`}>{label}</div>
    </div>
  );

  return (
    <div>
      {/* Header */}
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="page-title">Old Customers</h1>
          <p className="page-subtitle">Auto-syncs 7–10 random customers to Meta every hour</p>
        </div>
        <button onClick={() => fileRef.current.click()} className="btn btn-outline">
          Import CSV
        </button>
        <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={handleFileUpload} />
      </div>

      {/* Dashboard stats */}
      <div className="mb-5 flex flex-wrap gap-3">
        {statCard('Total', dashboard?.total, '👥', 'all')}
        {statCard('Synced to Meta', dashboard?.synced, '✅', 'synced')}
        {statCard('Not Synced', dashboard?.not_synced, '⏳', 'not_synced')}
        {statCard('Synced Today', dashboard?.synced_today, '📅', null)}
      </div>

      {/* Auto-sync status */}
      <div className="mb-4 flex items-center gap-2.5 rounded-[10px] border border-emerald-200 bg-emerald-50 px-4 py-2.5 dark:border-emerald-500/30 dark:bg-emerald-500/10">
        <span className="inline-block h-2.5 w-2.5 rounded-full bg-emerald-500" />
        <span className="text-[13px] font-medium text-emerald-800 dark:text-emerald-300">
          Auto-sync active — sending 7–10 random customers to Meta every hour automatically
        </span>
      </div>

      {/* Tabs */}
      <div className="mb-4 flex w-fit gap-1 rounded-lg bg-[var(--surface-2)] p-1">
        {[['list', 'Customers'], ['log', 'Sync Log']].map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`rounded-md px-[18px] py-1.5 text-[13px] font-semibold transition ${tab === key ? 'bg-[var(--surface)] text-primary shadow-sm dark:text-accent-light' : 'text-[var(--text-muted)]'}`}
          >{label}</button>
        ))}
      </div>

      {tab === 'log' ? (
        /* Sync Log */
        <div className="card overflow-hidden">
          {!dashboard?.logs?.length ? (
            <div className="p-10 text-center text-[var(--text-muted)]">No sync activity yet</div>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  {['Time', 'Synced', 'Failed', 'Triggered By'].map(h => (
                    <th key={h} className="th">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {dashboard.logs.map(l => (
                  <tr key={l.id}>
                    <td className="td text-[var(--text-muted)]">{new Date(l.created_at).toLocaleString()}</td>
                    <td className="td">
                      <span className="badge badge-success">
                        +{l.synced_count}
                      </span>
                    </td>
                    <td className={`td ${l.failed_count > 0 ? 'text-red-500' : 'text-[var(--text-muted)]'}`}>
                      {l.failed_count > 0 ? l.failed_count : '—'}
                    </td>
                    <td className="td">
                      <span className={`badge ${l.triggered_by === 'auto' ? 'bg-violet-500/15 text-violet-700 dark:text-violet-300' : 'badge-warning'}`}>
                        {l.triggered_by === 'auto' ? '🤖 Auto' : '👤 Manual'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      ) : (
        /* Customers list */
        <>
          {/* Sync selected bar */}
          {selected.size > 0 && (
            <div className="mb-3.5 flex flex-wrap items-center gap-3 rounded-[10px] bg-primary px-4 py-2.5">
              <span className="text-[13px] font-semibold text-white">{selected.size} selected</span>
              <button onClick={syncSelected} disabled={syncingSelected} className="btn btn-accent btn-sm">
                {syncingSelected ? 'Syncing...' : `Sync ${selected.size} to Meta`}
              </button>
              <button onClick={() => setSelected(new Set())} className="ml-auto rounded-md bg-white/15 px-3.5 py-1.5 text-xs text-white hover:bg-white/25">
                Clear
              </button>
            </div>
          )}

          {/* CSV hint */}
          <div className="mb-3 rounded-[10px] border border-[var(--border)] bg-[var(--surface-2)] px-3.5 py-2.5 text-xs text-[var(--text-muted)]">
            <strong>CSV columns:</strong> <code>name</code>, <code>phone</code>, <code>email</code> — rows without name + phone/email are skipped automatically.
          </div>

          {/* Search */}
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search customers..."
            className="input mb-3" />

          {loadingList ? (
            <div className="p-10 text-center text-[var(--text-muted)]">Loading...</div>
          ) : filtered.length === 0 ? (
            <div className="p-10 text-center text-[var(--text-muted)]">
              {customers.length === 0 ? 'No customers yet. Import a CSV to get started.' : 'No results found.'}
            </div>
          ) : isMobile ? (
            <div className="flex flex-col gap-2.5">
              {filtered.map(c => (
                <div key={c.id} className={`card border-[1.5px] p-4 ${selected.has(c.id) ? 'border-primary bg-accent-soft dark:bg-accent/15' : 'border-transparent'}`}>
                  <div className="flex items-start justify-between">
                    <div className="flex flex-1 items-start gap-2.5">
                      {!c.synced_to_meta && (
                        <input type="checkbox" checked={selected.has(c.id)} onChange={() => toggleOne(c.id)}
                          className="mt-0.5 h-4 w-4 cursor-pointer accent-[var(--color-primary)]" />
                      )}
                      <div>
                        <div className="text-sm font-bold text-[var(--text)]">{c.full_name}</div>
                        <div className="mt-0.5 text-xs text-[var(--text-muted)]">{c.phone || '—'}</div>
                        <div className="text-xs text-[var(--text-muted)]">{c.email || '—'}</div>
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1.5">
                      <span className={`badge ${c.synced_to_meta ? 'badge-success' : 'badge-warning'}`}>{c.synced_to_meta ? 'Synced' : 'Pending'}</span>
                      {!c.synced_to_meta && (
                        <button onClick={() => syncOne(c.id)} disabled={syncingId === c.id} className="btn btn-primary btn-sm">
                          {syncingId === c.id ? '...' : 'Sync'}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="card overflow-hidden">
              <table className="data-table">
                <thead>
                  <tr>
                    <th className="th w-10">
                      <input type="checkbox" checked={allUnsyncedSelected} onChange={() => {
                        const ids = unsyncedInFilter.map(c => c.id);
                        const all = ids.every(id => selected.has(id));
                        setSelected(all ? new Set() : new Set(ids));
                      }} className="h-[15px] w-[15px] cursor-pointer accent-[var(--color-primary)]" />
                    </th>
                    {['Name', 'Phone', 'Email', 'Status', 'Synced At', 'Actions'].map(h => (
                      <th key={h} className="th">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(c => (
                    <tr key={c.id} className={selected.has(c.id) ? 'bg-accent-soft dark:bg-accent/15' : ''}>
                      <td className="td">
                        {!c.synced_to_meta && (
                          <input type="checkbox" checked={selected.has(c.id)} onChange={() => toggleOne(c.id)}
                            className="h-[15px] w-[15px] cursor-pointer accent-[var(--color-primary)]" />
                        )}
                      </td>
                      <td className="td font-semibold text-[var(--text)]">{c.full_name}</td>
                      <td className="td text-[var(--text-muted)]">{c.phone || '—'}</td>
                      <td className="td text-[var(--text-muted)]">{c.email || '—'}</td>
                      <td className="td">
                        <span className={`badge ${c.synced_to_meta ? 'badge-success' : 'badge-warning'}`}>{c.synced_to_meta ? '✓ Synced' : '⏳ Pending'}</span>
                      </td>
                      <td className="td text-xs text-[var(--text-muted)]/70">
                        {c.synced_at ? new Date(c.synced_at).toLocaleDateString() : '—'}
                      </td>
                      <td className="td">
                        <div className="flex gap-2">
                          {!c.synced_to_meta && (
                            <button onClick={() => syncOne(c.id)} disabled={syncingId === c.id} className="btn btn-primary btn-sm">
                              {syncingId === c.id ? 'Syncing...' : 'Sync'}
                            </button>
                          )}
                          <button onClick={() => deleteCustomer(c.id)} className="btn btn-danger btn-sm">
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
