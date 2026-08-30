'use client';

import { ProtectedRoute } from '../../components/ProtectedRoute';
import { ProfitabilityTable } from '../../components/profitability/ProfitabilityTable';

function RentabiliteInner() {
  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6">
      <header className="mb-6">
        <p className="text-xs uppercase tracking-[0.3em] text-primary/70">Katalòg</p>
        <h1 className="mt-1 text-2xl font-black text-primary dark:text-slate-100">
          Rantabilite pwodwi
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Klase pa mòj total yo rapòte — pa pa kantite yo vann. Se konsa kapital
          ou a ale kote li rapòte vre.
        </p>
      </header>

      <ProfitabilityTable />
    </div>
  );
}

export default function RentabilitePage() {
  return (
    <ProtectedRoute>
      <RentabiliteInner />
    </ProtectedRoute>
  );
}
