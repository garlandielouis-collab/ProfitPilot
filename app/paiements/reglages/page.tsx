'use client';

import Link from 'next/link';
import { ProtectedRoute } from '../../../components/ProtectedRoute';
import { PaymentSettings } from '../../../components/paymentBridge/PaymentSettings';
import { ScreenHeader } from '../../../components/ds';

function ReglagesInner() {
  return (
    <div className="pp-enter mx-auto w-full max-w-3xl px-4 py-6 sm:px-6">
      <ScreenHeader
        title="Recevoir des paiements"
        subtitle="Les numéros sur lesquels vos clients vous paient directement."
        action={
          <Link href="/paiements" className="text-note font-bold text-primary underline underline-offset-4 dark:text-dark-text">
            Paiements
          </Link>
        }
      />
      <div className="mt-6">
        <PaymentSettings />
      </div>
    </div>
  );
}

export default function ReglagesPaiementsPage() {
  return (
    <ProtectedRoute>
      <ReglagesInner />
    </ProtectedRoute>
  );
}
