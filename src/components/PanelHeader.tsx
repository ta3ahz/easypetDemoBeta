import { logout } from '@/app/login/actions';

export function PanelHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <header className="bg-white border-b border-slate-200">
      <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-blue-600 grid place-items-center text-white text-lg font-bold">+</div>
          <div>
            <div className="font-bold text-slate-800 leading-tight">
              easy<span className="text-blue-600">PET</span>
              <span className="text-slate-400 font-medium"> · {title}</span>
            </div>
            {subtitle && <div className="text-xs text-slate-500">{subtitle}</div>}
          </div>
        </div>
        <form action={logout}>
          <button className="text-sm font-semibold text-slate-500 hover:text-red-600 transition-colors">
            Sign out
          </button>
        </form>
      </div>
    </header>
  );
}

export function Stat({ label, value, accent }: { label: string; value: string | number; accent?: string }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-5">
      <div className="text-sm text-slate-500">{label}</div>
      <div className={`text-3xl font-bold mt-1 ${accent ?? 'text-slate-800'}`}>{value}</div>
    </div>
  );
}
