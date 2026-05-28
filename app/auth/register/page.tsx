'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function RegisterPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/dashboard');
  }, [router]);

  return (
    <main className="min-h-screen bg-background text-text px-4 py-10 sm:px-6">
      <div className="mx-auto max-w-xl rounded-[32px] border border-slate-200 bg-white p-8 shadow-sm">
        <div className="space-y-3">
          <p className="text-sm uppercase tracking-[0.3em] text-primary/80">Inscription désactivée</p>
          <h1 className="text-3xl font-semibold text-anthracite">Accès libre activé</h1>
          <p className="text-sm text-anthracite/70">Vous êtes redirigé automatiquement vers votre tableau de bord.</p>
        </div>
      </div>
    </main>
  );
}
