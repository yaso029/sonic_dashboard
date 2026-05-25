import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import portalApi from '../../portalApi';
import { usePortalAuth } from '../../PortalAuthContext';
import toast from 'react-hot-toast';

export default function PortalLogin() {
  const navigate = useNavigate();
  const { login } = usePortalAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { data } = await portalApi.post('/api/portal/auth/login', { email, password });
      login({ ...data.user, client: data.client }, data.access_token);
      navigate('/portal');
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-navy to-navy-light p-5">
      <div className="w-[400px] rounded-2xl bg-white px-11 py-10 shadow-2xl">
        <div className="mb-7 text-center">
          <div className="text-3xl">🏢</div>
          <h1 className="mt-2 text-[22px] font-extrabold text-navy">Client Portal</h1>
          <p className="mt-1 text-[13px] text-gray-400">Sign in to view invoices, documents and more</p>
        </div>
        <form onSubmit={submit}>
          <label className="mb-1.5 block text-xs font-semibold text-gray-600">Email</label>
          <input type="email" value={email} onChange={e => setEmail(e.target.value)} required className="input mb-4 px-3.5 py-2.5 text-sm" />
          <label className="mb-1.5 block text-xs font-semibold text-gray-600">Password</label>
          <input type="password" value={password} onChange={e => setPassword(e.target.value)} required className="input mb-5 px-3.5 py-2.5 text-sm" />
          <button type="submit" disabled={loading} className="w-full rounded-lg bg-navy py-3 text-[15px] font-bold text-white disabled:opacity-70">
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  );
}
