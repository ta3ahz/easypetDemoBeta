import React from 'react';

export function Stat({ label, value, accent }: { label: string; value: React.ReactNode; accent?: string }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-5">
      <div className="text-sm text-slate-500">{label}</div>
      <div className={`text-3xl font-bold mt-1 ${accent ?? 'text-slate-800'}`}>{value}</div>
    </div>
  );
}

export function Section({ title, subtitle, children, action }: { title: string; subtitle?: React.ReactNode; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <section className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
      <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between gap-3">
        <div>
          <div className="font-semibold text-slate-700">{title}</div>
          {subtitle && <div className="text-xs text-slate-400 mt-0.5">{subtitle}</div>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

export function TableWrap({ children }: { children: React.ReactNode }) {
  return <div className="overflow-x-auto"><table className="w-full text-sm">{children}</table></div>;
}
export function Th({ children }: { children: React.ReactNode }) {
  return <th className="px-4 py-2 font-semibold text-slate-500 text-left whitespace-nowrap">{children}</th>;
}
export function Td({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <td className={`px-4 py-2 text-slate-600 whitespace-nowrap ${className}`}>{children}</td>;
}
export function Row({ children }: { children: React.ReactNode }) {
  return <tr className="border-t border-slate-100">{children}</tr>;
}

export function ResultBadge({ positive }: { positive?: boolean }) {
  return positive ? (
    <span className="inline-block rounded-full bg-red-50 text-red-600 px-2.5 py-0.5 text-xs font-semibold">POSITIVE</span>
  ) : (
    <span className="inline-block rounded-full bg-green-50 text-green-600 px-2.5 py-0.5 text-xs font-semibold">NEGATIVE</span>
  );
}

export function Pill({ children, tone = 'slate' }: { children: React.ReactNode; tone?: 'slate' | 'green' | 'amber' | 'blue' | 'red' }) {
  const map = {
    slate: 'bg-slate-100 text-slate-600',
    green: 'bg-green-50 text-green-600',
    amber: 'bg-amber-50 text-amber-600',
    blue: 'bg-blue-50 text-blue-600',
    red: 'bg-red-50 text-red-600',
  };
  return <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${map[tone]}`}>{children}</span>;
}

export const btn =
  'rounded-lg bg-blue-600 text-white px-3 py-1.5 text-xs font-semibold hover:bg-blue-700 transition-colors';
export const btnGhost =
  'rounded-lg border border-slate-200 text-slate-600 px-3 py-1.5 text-xs font-semibold hover:bg-slate-50 transition-colors';
export const input =
  'rounded-lg border border-slate-200 px-2.5 py-1.5 text-slate-800 outline-none focus:border-blue-500 transition-colors';
