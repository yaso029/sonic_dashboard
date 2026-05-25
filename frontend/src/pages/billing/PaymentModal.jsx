import { useState } from 'react';
import api from '../../api';
import toast from 'react-hot-toast';

const METHODS = ['bank_transfer', 'cash', 'card', 'cheque', 'other'];

export default function PaymentModal({ invoice, onClose, onSaved }) {
  const [amount, setAmount] = useState(invoice.balance);
  const [method, setMethod] = useState('bank_transfer');
  const [reference, setReference] = useState('');
  const [paidAt, setPaidAt] = useState(new Date().toISOString().slice(0, 10));
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) { toast.error('Enter a valid amount'); return; }
    setLoading(true);
    try {
      await api.post(`/api/invoices/${invoice.id}/payments`, {
        amount: amt, method, reference: reference || null, paid_at: paidAt,
      });
      toast.success('Payment recorded');
      onSaved();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal w-[440px] p-7">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-[var(--text)]">Record Payment</h2>
          <button onClick={onClose} className="btn btn-ghost btn-sm text-[22px] leading-none">×</button>
        </div>
        <div className="mb-4 text-xs text-[var(--text-muted)]">
          {invoice.invoice_number} · Balance <strong>{invoice.currency} {Number(invoice.balance).toFixed(2)}</strong>
        </div>
        <form onSubmit={submit}>
          <div className="mb-3.5 grid grid-cols-2 gap-3">
            <div>
              <label className="label">Amount</label>
              <input className="input" type="number" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} />
            </div>
            <div>
              <label className="label">Method</label>
              <select className="input" value={method} onChange={e => setMethod(e.target.value)}>
                {METHODS.map(m => <option key={m} value={m}>{m.replace('_', ' ')}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Paid On</label>
              <input className="input" type="date" value={paidAt} onChange={e => setPaidAt(e.target.value)} />
            </div>
            <div>
              <label className="label">Reference</label>
              <input className="input" value={reference} onChange={e => setReference(e.target.value)} placeholder="optional" />
            </div>
          </div>
          <div className="flex justify-end gap-2.5">
            <button type="button" onClick={onClose} className="btn btn-ghost">Cancel</button>
            <button type="submit" disabled={loading} className="btn btn-accent">
              {loading ? 'Saving...' : 'Record Payment'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
