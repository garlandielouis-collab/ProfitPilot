'use client';

import { useState } from 'react';
import { ProtectedRoute } from '../../../components/ProtectedRoute';
import { CreditFileReport } from '../../../components/credit/CreditFileReport';

const RANGES = [6, 12, 24];

function CreditInner() {
  const [months, setMonths] = useState(12);

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-6 sm:px-6">
      <header className="mb-6 print:hidden">
        <p className="text-xs uppercase tracking-[0.3em] text-primary/70">Rapò</p>
        <h1 className="mt-1 text-2xl font-black text-primary dark:text-slate-100">
          Dosye kredi & mikwofinans
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Yon dokiman yon bank oswa yon enstitisyon mikwofinans ka li : istorik
          chif dafè ak mòj, san depans pèsonèl yo.
        </p>

        <div className="mt-4 inline-flex overflow-hidden rounded-xl border border-slate-200">
          {RANGES.map((m) => (
            <button
              key={m}
              onClick={() => setMonths(m)}
              className={months === m
                ? 'bg-primary px-4 py-2 text-sm font-semibold text-white'
                : 'bg-white px-4 py-2 text-sm font-medium text-slate-500 transition hover:bg-slate-50'}
            >
              {m} mwa
            </button>
          ))}
        </div>
      </header>

      <CreditFileReport key={months} months={months} />
    </div>
  );
}

export default function CreditPage() {
  return (
    <ProtectedRoute>
      <CreditInner />
    </ProtectedRoute>
  );
}
