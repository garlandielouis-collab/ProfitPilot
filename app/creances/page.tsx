'use client';

import { ProtectedRoute } from '../../components/ProtectedRoute';
import { ReceivablesPanel } from '../../components/receivables/ReceivablesPanel';
import { ScreenHeader } from '../../components/ds';

// Un écran = une tâche = un fichier (§5.6). Celui-ci fait une chose : suivre et
// relancer ce que les clients doivent. Le sous-titre explique la tâche ; il ne
// répète pas le titre (§4.5).
function CreancesInner() {
  return (
    <div className="pp-enter mx-auto w-full max-w-3xl px-4 py-6 sm:px-6">
      <ScreenHeader
        title="Créances"
        subtitle="Ce que vos clients vous doivent — appuyez longuement sur une ligne pour relancer."
      />
      <div className="mt-6">
        <ReceivablesPanel />
      </div>
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
