import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../AuthContext';
import { ThemeToggle } from '../ThemeContext';

/* Shared module shell: dark-green sidebar (brand + module pill + nav + footer)
   and a light/dark-aware content header. Used by the Agents / HR / Calendar /
   Partnerships layouts — each just passes a `moduleLabel` and `navItems`. */
export default function ModuleShell({ moduleLabel, navItems = [] }) {
  const { user } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="flex min-h-screen bg-page dark:bg-surface-dark">
      <aside className="fixed top-0 left-0 z-[100] flex h-screen w-60 flex-col bg-gradient-to-b from-primary to-primary-dark text-white">
        {/* Brand */}
        <div className="px-6 pt-7 pb-5 border-b border-white/10">
          <div className="text-[22px] font-extrabold tracking-tight">Sonic</div>
          <div className="mt-0.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-accent-light">
            Marketing CRM
          </div>
          {moduleLabel && (
            <span className="mt-3 inline-block rounded-md border border-accent/40 bg-accent/20 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-widest text-accent-light">
              {moduleLabel}
            </span>
          )}
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto px-3 py-4">
          {navItems.map(item => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.exact}
              className={({ isActive }) => 'nav-link' + (isActive ? ' nav-link-active' : '')}
            >
              <span className="text-base">{item.icon}</span>
              {item.label}
            </NavLink>
          ))}
        </nav>

        {/* Footer */}
        <div className="border-t border-white/10 px-3 py-4">
          <button
            onClick={() => navigate('/')}
            className="mb-2 w-full rounded-lg bg-white/10 px-3 py-2 text-[13px] font-semibold text-white/80 transition hover:bg-white/20"
          >
            ← Back to Home
          </button>
          <div className="truncate px-1 text-[11px] text-white/45">{user?.full_name}</div>
        </div>
      </aside>

      <div className="ml-60 flex min-h-screen flex-1 min-w-0 flex-col">
        <header className="sticky top-0 z-50 flex h-[60px] items-center gap-3 border-b border-[var(--border)] bg-[var(--surface)] px-7 shadow-soft">
          <span className="text-[13px] text-[var(--text-muted)]">{moduleLabel}</span>
          <span className="ml-auto text-[13px] font-semibold text-[var(--text)]">{user?.full_name}</span>
          <ThemeToggle className="rounded-lg px-2 py-1.5 text-base transition hover:bg-[var(--surface-2)]" />
        </header>
        <main className="flex-1 p-7">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
