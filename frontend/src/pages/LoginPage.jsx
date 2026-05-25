import { useState } from 'react';
import { useAuth } from '../AuthContext';
import api from '../api';
import toast from 'react-hot-toast';

export default function LoginPage() {
  const { login } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { data } = await api.post('/api/auth/login', { username, password });
      login(data.user, data.access_token);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  const lightInput =
    'w-full mb-4 rounded-lg border-[1.5px] border-[#E3E9E6] bg-white px-3.5 py-3 ' +
    'text-sm text-ink outline-none transition-colors focus:border-accent focus:ring-2 focus:ring-accent/20 placeholder:text-muted/50';

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-primary to-secondary p-4">
      <div className="w-[400px] rounded-2xl border border-black/5 bg-gradient-to-b from-white to-[#F4F4F4] px-10 py-12 shadow-2xl">
        <div className="mb-8 text-center">
          <img src="/sonic-logo.svg" alt="Sonic System" className="mx-auto mb-2 h-28 w-28 object-contain" />
          <div className="mt-1 text-2xl font-extrabold tracking-tight text-primary">Sonic System</div>
          <div className="mt-1 text-[11px] uppercase tracking-[2px] text-accent">Marketing Agency CRM</div>
          <div className="mx-auto mt-3 mb-8 h-0.5 w-16 rounded bg-gradient-to-r from-transparent via-accent to-transparent" />
        </div>
        <h2 className="mb-6 text-lg font-semibold text-ink">Sign in to your account</h2>
        <form onSubmit={handleSubmit}>
          <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-muted">Username</label>
          <input
            className={lightInput}
            type="text"
            value={username}
            onChange={e => setUsername(e.target.value)}
            placeholder="Your name"
            required
          />
          <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-muted">Password</label>
          <input
            className={lightInput}
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="••••••••"
            required
          />
          <button
            className="w-full rounded-lg bg-primary py-3 text-[15px] font-bold text-white transition hover:bg-primary-dark disabled:opacity-70"
            type="submit"
            disabled={loading}
          >
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  );
}
