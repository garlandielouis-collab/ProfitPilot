'use client';

import { ProtectedRoute } from '../../components/ProtectedRoute';
import { ReceivablesPanel } from '../../components/receivables/ReceivablesPanel';

function CreancesInner() {
  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6">
      <header className="mb-6">
        <h1 className="text-2xl font-black text-[#001F3F] dark:text-slate-100">
          Créances clients
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Chaque gourde due, tracée et relançable — plus rien ne se perd.
        </p>
      </header>

      <ReceivablesPanel />
    </div>
  );
}

export default function CreancesPage() {
  return (
    <ProtectedRoute>
      <CreancesInner />
    </ProtectedRoute>
  );
}
