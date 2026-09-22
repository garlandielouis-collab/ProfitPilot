'use client';

import { Suspense } from 'react';
import { ProtectedRoute } from '../../components/ProtectedRoute';
import { PaymentInbox } from '../../components/paymentBridge/PaymentInbox';
import { ScreenHeader } from '../../components/ds';

// Un écran = une tâche (§5.6) : savoir quels paiements sont arrivés, et décider
// de ceux qui attendent. Les réglages vivent à côté, dans /paiements/reglages.
function PaiementsInner() {
  return (
    <div className="pp-enter mx-auto w-full max-w-3xl px-4 py-6 sm:px-6">
      <ScreenHeader
        title="Paiements"
        subtitle="Les paiements MonCash et NatCash reçus directement sur votre numéro."
      />
      <div className="mt-6">
        {/* `useSearchParams` (l'arrivée depuis une notification) demande une
            frontière Suspense, sinon la page entière sort du rendu statique. */}
        <Suspense fallback={<div className="pp-skeleton h-40 rounded-surface" />}>
          <PaymentInbox />
        </Suspense>
      </div>
    </div>
  );
}

export default function PaiementsPage() {
  return (
    <ProtectedRoute>
      <PaiementsInner />
    </ProtectedRoute>
  );
}
