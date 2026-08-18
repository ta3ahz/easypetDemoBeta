'use client';

import { useActionState } from 'react';
import { changeWebPassword, type SettingsState } from '../actions';

const inputCls = 'w-full rounded-xl border-2 border-slate-200 px-4 py-2.5 text-slate-800 outline-none focus:border-blue-500 transition-colors';
const empty: SettingsState = {};

export function SettingsClient({ deviceName, uid, hasWeb }: { deviceName: string; uid: string; hasWeb: boolean }) {
  const [pwState, pwAction, pwPending] = useActionState(changeWebPassword, empty);

  return (
    <div className="grid md:grid-cols-2 gap-6">
      <div className="bg-white rounded-2xl border border-slate-200 p-6">
        <div className="font-semibold text-slate-700 mb-1">Device</div>
        <p className="text-xs text-slate-400 mb-3">Managed on the device itself (name, PIN, veterinarians).</p>
        <dl className="text-sm space-y-1">
          <div className="flex justify-between"><dt className="text-slate-400">Name</dt><dd className="font-medium text-slate-700">{deviceName || '—'}</dd></div>
          <div className="flex justify-between"><dt className="text-slate-400">Device ID</dt><dd className="font-mono text-slate-600">{uid}</dd></div>
        </dl>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 p-6">
        <div className="font-semibold text-slate-700 mb-1">Web password</div>
        <p className="text-xs text-slate-400 mb-3">The password for this web panel. (Separate from the device PIN.)</p>
        {hasWeb ? (
          <form action={pwAction} className="space-y-3">
            <input name="current" type="password" placeholder="Current password" className={inputCls} />
            <input name="next" type="password" placeholder="New password (min 6)" className={inputCls} />
            {pwState.error && <Msg tone="err">{pwState.error}</Msg>}
            {pwState.ok && <Msg tone="ok">{pwState.ok}</Msg>}
            <Submit pending={pwPending}>Change password</Submit>
          </form>
        ) : (
          <p className="text-sm text-slate-500">Set a username &amp; password on the device (Settings) to enable web access.</p>
        )}
      </div>
    </div>
  );
}

function Msg({ tone, children }: { tone: 'err' | 'ok'; children: React.ReactNode }) {
  return (
    <div className={`rounded-lg text-sm px-3 py-2 ${tone === 'err' ? 'bg-red-50 text-red-600' : 'bg-green-50 text-green-600'}`}>
      {children}
    </div>
  );
}
function Submit({ pending, children }: { pending: boolean; children: React.ReactNode }) {
  return (
    <button type="submit" disabled={pending} className="rounded-xl bg-blue-600 px-5 py-2.5 font-semibold text-white hover:bg-blue-700 disabled:opacity-60 transition-colors">
      {pending ? 'Saving…' : children}
    </button>
  );
}
