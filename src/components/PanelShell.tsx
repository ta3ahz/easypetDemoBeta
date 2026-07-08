import Link from 'next/link';
import { logout } from '@/app/login/actions';

export type NavItem = { href: string; label: string };

function Droplet() {
  return (
    <div className="w-8 h-8 rounded-xl grid place-items-center bg-gradient-to-b from-blue-600 to-blue-900 shadow-sm">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="white" aria-hidden>
        <path d="M12 2.2c3.8 4.9 6 8 6 11.1a6 6 0 1 1-12 0C6 10.2 8.2 7.1 12 2.2z" />
      </svg>
    </div>
  );
}

export function PanelShell({
  role,
  user,
  nav,
  active,
  children,
}: {
  role: 'Admin' | 'Clinic';
  user: string;
  nav: NavItem[];
  active: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between gap-4">
          <div className="flex items-center gap-6 min-w-0">
            <div className="flex items-center gap-2 shrink-0">
              <Droplet />
              <div className="font-bold text-slate-800 leading-none">
                uri<span className="text-blue-600">BX</span>
                <span className="ml-2 text-xs font-semibold text-slate-400 align-middle">{role}</span>
              </div>
            </div>
            <nav className="flex items-center gap-1 text-sm font-medium overflow-x-auto">
              {nav.map((n) => (
                <Link
                  key={n.href}
                  href={n.href}
                  className={`px-3 py-1.5 rounded-lg whitespace-nowrap transition-colors ${
                    active === n.href
                      ? 'bg-blue-50 text-blue-700'
                      : 'text-slate-500 hover:text-slate-800 hover:bg-slate-50'
                  }`}
                >
                  {n.label}
                </Link>
              ))}
            </nav>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <span className="text-sm text-slate-500 hidden sm:block max-w-[180px] truncate">{user}</span>
            <form action={logout}>
              <button className="text-sm font-semibold text-slate-500 hover:text-red-600 transition-colors">
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>
      <main className="max-w-6xl mx-auto px-6 py-6 space-y-6">{children}</main>
    </div>
  );
}
