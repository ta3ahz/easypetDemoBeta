'use client';

import { useActionState } from 'react';
import { updateOwnVets, changeOwnPin, type SettingsState } from '../actions';

const inputCls = 'w-full rounded-xl border-2 border-slate-200 px-4 py-2.5 text-slate-800 outline-none focus:border-blue-500 transition-colors';
const empty: SettingsState = {};

export function SettingsClient({ vets }: { vets: string }) {
  const [vetState, vetAction, vetPending] = useActionState(updateOwnVets, empty);
  const [pinState, pinAction, pinPending] = useActionState(changeOwnPin, empty);

  return (
    <div className="grid md:grid-cols-2 gap-6">
      <div className="bg-white rounded-2xl border border-slate-200 p-6">
        <div className="font-semibold text-slate-700 mb-1">Veterinarians</div>
        <p className="text-xs text-slate-400 mb-3">Shown on the device login and labeled on results (max 3, comma-separated).</p>
        <form action={vetAction} className="space-y-3">
          <input name="vets" defaultValue={vets} placeholder="Dr. Ozan, Dr. Kaan" className={inputCls} />
          {vetState.error && <Msg tone="err">{vetState.error}</Msg>}
          {vetState.ok && <Msg tone="ok">{vetState.ok}</Msg>}
          <Submit pending={vetPending}>Save</Submit>
        </form>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 p-6">
        <div className="font-semibold text-slate-700 mb-1">Change PIN</div>
        <p className="text-xs text-slate-400 mb-3">The 6-digit PIN is used to log in on the device and here.</p>
        <form action={pinAction} className="space-y-3">
          <input name="current" type="password" inputMode="numeric" placeholder="Current PIN" className={inputCls} />
          <input name="next" type="password" inputMode="numeric" maxLength={6} placeholder="New 6-digit PIN" className={inputCls} />
          {pinState.error && <Msg tone="err">{pinState.error}</Msg>}
          {pinState.ok && <Msg tone="ok">{pinState.ok}</Msg>}
          <Submit pending={pinPending}>Change PIN</Submit>
        </form>
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
