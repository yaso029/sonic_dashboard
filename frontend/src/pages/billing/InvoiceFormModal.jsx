import { useEffect, useState } from 'react';
import api from '../../api';
import toast from 'react-hot-toast';

const money = (n) => Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function InvoiceFormModal({ clientId: presetClient, onClose, onSaved }) {
  const [clients, setClients] = useState([]);
  const [clientId, setClientId] = useState(presetClient || '');
  const [vatRate, setVatRate] = useState(5);
  const [dueDate, setDueDate] = useState('');
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState([{ description: '', quantity: 1, unit_price: 0 }]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!presetClient) {
      api.get('/api/clients').then(r => setClients(r.data)).catch(() => {});
    }
  }, [presetClient]);

  const setItem = (i, k, v) => setItems(arr => arr.map((it, idx) => idx === i ? { ...it, [k]: v } : it));
  const addItem = () => setItems(arr => [...arr, { description: '', quantity: 1, unit_price: 0 }]);
  const removeItem = (i) => setItems(arr => arr.filter((_, idx) => idx !== i));

  const subtotal = items.reduce((s, it) => s + (parseFloat(it.quantity) || 0) * (parseFloat(it.unit_price) || 0), 0);
  const vat = subtotal * (parseFloat(vatRate) || 0) / 100;
  const total = subtotal + vat;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!clientId) { toast.error('Select a client'); return; }
    const cleanItems = items.filter(it => it.description.trim());
    if (!cleanItems.length) { toast.error('Add at least one line item'); return; }
    setLoading(true);
    try {
      const payload = {
        client_id: parseInt(clientId),
        vat_rate: parseFloat(vatRate) || 0,
        due_date: dueDate || null,
        notes: notes || null,
        line_items: cleanItems.map(it => ({
          description: it.description,
          quantity: parseFloat(it.quantity) || 0,
          unit_price: parseFloat(it.unit_price) || 0,
        })),
      };
      const { data } = await api.post('/api/invoices', payload);
      toast.success('Invoice created (draft)');
      onSaved(data);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal w-[640px] max-h-[90vh] overflow-y-auto p-7">
        <div className="mb-[18px] flex items-center justify-between">
          <h2 className="text-lg font-bold text-[var(--text)]">New Invoice</h2>
          <button onClick={onClose} className="btn btn-ghost btn-sm text-[22px] leading-none">×</button>
        </div>
        <form onSubmit={handleSubmit}>
          {!presetClient && (
            <div className="mb-3.5">
              <label className="label">Client *</label>
              <select className="input" value={clientId} onChange={e => setClientId(e.target.value)} required>
                <option value="">Select client...</option>
                {clients.map(c => <option key={c.id} value={c.id}>{c.company_name}</option>)}
              </select>
            </div>
          )}

          <label className="label">Line Items</label>
          <div className="mb-3">
            {items.map((it, i) => (
              <div key={i} className="mb-2 grid grid-cols-[1fr_70px_100px_90px_28px] items-center gap-2">
                <input className="input" placeholder="Description" value={it.description} onChange={e => setItem(i, 'description', e.target.value)} />
                <input className="input" type="number" step="0.01" placeholder="Qty" value={it.quantity} onChange={e => setItem(i, 'quantity', e.target.value)} />
                <input className="input" type="number" step="0.01" placeholder="Unit price" value={it.unit_price} onChange={e => setItem(i, 'unit_price', e.target.value)} />
                <div className="text-right text-xs text-[var(--text-muted)]">{money((parseFloat(it.quantity) || 0) * (parseFloat(it.unit_price) || 0))}</div>
                <button type="button" onClick={() => removeItem(i)} disabled={items.length === 1}
                  className="border-none bg-transparent text-lg text-red-500 disabled:cursor-not-allowed disabled:opacity-30">×</button>
              </div>
            ))}
            <button type="button" onClick={addItem} className="btn btn-outline btn-sm border-dashed text-accent">+ Add line</button>
          </div>

          <div className="mb-3.5 grid grid-cols-2 gap-3">
            <div>
              <label className="label">VAT Rate (%)</label>
              <input className="input" type="number" step="0.1" value={vatRate} onChange={e => setVatRate(e.target.value)} />
            </div>
            <div>
              <label className="label">Due Date</label>
              <input className="input" type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} />
            </div>
            <div className="col-span-2">
              <label className="label">Notes</label>
              <textarea className="input min-h-[50px] resize-y" value={notes} onChange={e => setNotes(e.target.value)} />
            </div>
          </div>

          <div className="mb-4 rounded-lg bg-[var(--surface-2)] px-4 py-3 text-[13px]">
            <div className="flex justify-between text-[var(--text-muted)]"><span>Subtotal</span><span>AED {money(subtotal)}</span></div>
            <div className="mt-1 flex justify-between text-[var(--text-muted)]"><span>VAT ({vatRate || 0}%)</span><span>AED {money(vat)}</span></div>
            <div className="mt-1.5 flex justify-between text-[15px] font-extrabold text-[var(--text)]"><span>Total</span><span>AED {money(total)}</span></div>
          </div>

          <div className="flex justify-end gap-2.5">
            <button type="button" onClick={onClose} className="btn btn-ghost">Cancel</button>
            <button type="submit" disabled={loading} className="btn btn-primary">
              {loading ? 'Creating...' : 'Create Draft'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
