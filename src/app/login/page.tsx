'use client';

import { useActionState, useState } from 'react';
import { clinicLogin, adminLogin, type LoginState } from './actions';

const empty: LoginState = {};

export default function LoginPage() {
  const [tab, setTab] = useState<'clinic' | 'admin'>('clinic');
  const [clinicState, clinicAction, clinicPending] = useActionState(clinicLogin, empty);
  const [adminState, adminAction, adminPending] = useActionState(adminLogin, empty);

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
      <div className="w-full max-w-md">
        <div className="flex items-center gap-3 justify-center mb-6">
          <div className="w-11 h-11 rounded-2xl grid place-items-center bg-gradient-to-b from-blue-600 to-blue-900 shadow-lg shadow-blue-600/30">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="white" aria-hidden>
              <path d="M12 2.2c3.8 4.9 6 8 6 11.1a6 6 0 1 1-12 0C6 10.2 8.2 7.1 12 2.2z" />
            </svg>
          </div>
          <div className="text-2xl font-bold text-slate-800">
            uri<span className="text-blue-600">BX</span>
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-xl border border-slate-100 overflow-hidden">
          <div className="grid grid-cols-2 text-sm font-semibold">
            {(['clinic', 'admin'] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`py-3 transition-colors ${
                  tab === t ? 'bg-white text-blue-600' : 'bg-slate-50 text-slate-400 hover:text-slate-600'
                }`}
              >
                {t === 'clinic' ? 'Clinic' : 'Admin'}
              </button>
            ))}
          </div>

          <div className="p-6">
            {tab === 'clinic' ? (
              <form action={clinicAction} className="space-y-4">
                <Field label="Clinic name" name="name" placeholder="Manisa Vet Lab" autoFocus />
                <Field label="PIN (6 digits)" name="pin" type="password" inputMode="numeric" maxLength={6} placeholder="••••••" />
                {clinicState.error && <Error msg={clinicState.error} />}
                <Submit pending={clinicPending}>Sign in</Submit>
              </form>
            ) : (
              <form action={adminAction} className="space-y-4">
                <Field label="Email" name="email" type="email" placeholder="admin@easypet.local" autoFocus />
                <Field label="Password" name="password" type="password" placeholder="••••••••" />
                {adminState.error && <Error msg={adminState.error} />}
                <Submit pending={adminPending}>Sign in</Submit>
              </form>
            )}
          </div>
        </div>
        <p className="text-center text-xs text-slate-400 mt-4">uriBX · urine biomarker platform</p>
      </div>
    </div>
  );
}

function Field({ label, ...props }: { label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="block">
      <span className="text-sm font-semibold text-slate-700">{label}</span>
      <input
        {...props}
        className="mt-1 w-full rounded-xl border-2 border-slate-200 px-4 py-2.5 text-slate-800 outline-none focus:border-blue-500 transition-colors"
      />
    </label>
  );
}
function Error({ msg }: { msg: string }) {
  return <div className="rounded-lg bg-red-50 text-red-600 text-sm px-3 py-2">{msg}</div>;
}
function Submit({ pending, children }: { pending: boolean; children: React.ReactNode }) {
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full rounded-xl bg-blue-600 py-2.5 font-semibold text-white hover:bg-blue-700 disabled:opacity-60 transition-colors"
    >
      {pending ? 'Signing in…' : children}
    </button>
  );
}
