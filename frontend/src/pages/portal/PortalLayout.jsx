import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { usePortalAuth } from '../../PortalAuthContext';

const NAV = [
  { to: '/portal', label: 'Overview', end: true },
  { to: '/portal/invoices', label: 'Invoices' },
  { to: '/portal/documents', label: 'Documents' },
  { to: '/portal/services', label: 'Services' },
  { to: '/portal/profile', label: 'Profile' },
];

export default function PortalLayout() {
  const navigate = useNavigate();
  const { portalUser, logout } = usePortalAuth();
  const doLogout = () => { logout(); navigate('/portal/login'); };

  return (
    <div className="min-h-screen bg-page">
      <header className="flex h-[60px] items-center justify-between bg-navy px-7 text-white">
        <div className="flex items-center gap-7">
          <div className="text-base font-extrabold">🏢 {portalUser?.client?.company_name || 'Client Portal'}</div>
          <nav className="flex gap-1">
            {NAV.map(n => (
              <NavLink key={n.to} to={n.to} end={n.end}
                className={({ isActive }) => `rounded-md px-3 py-2 text-[13px] font-semibold ${isActive ? 'bg-white/[0.12] text-white' : 'text-white/60'}`}>
                {n.label}
              </NavLink>
            ))}
          </nav>
        </div>
        <div className="flex items-center gap-3.5">
          <span className="text-xs text-white/60">{portalUser?.email}</span>
          <button onClick={doLogout} className="rounded-md bg-white/[0.12] px-3.5 py-1.5 text-xs font-semibold text-white">Sign Out</button>
        </div>
      </header>
      <main className="mx-auto max-w-[1100px] p-7">
        <Outlet />
      </main>
    </div>
  );
}
