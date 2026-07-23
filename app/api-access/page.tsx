'use client';

import { useState } from 'react';
import { ProtectedRoute } from '../../components/ProtectedRoute';
import { usePlan } from '../../hooks/usePlan';
import { useLanguage } from '../../components/LanguageWrapper';
import { toast } from 'sonner';
import Link from 'next/link';

const ENDPOINTS = [
  { method: 'GET',    path: '/api/v1/sales',    desc: { fr: 'Lister toutes les ventes', ht: 'Liste tout vant yo' } },
  { method: 'GET',    path: '/api/v1/products', desc: { fr: 'Lister tous les produits', ht: 'Liste tout pwodwi yo' } },
  { method: 'GET',    path: '/api/v1/clients',  desc: { fr: 'Lister tous les clients',  ht: 'Liste tout kliyan yo' } },
  { method: 'POST',   path: '/api/v1/sales',    desc: { fr: 'Créer une vente',           ht: 'Kreye yon vant' } },
  { method: 'GET',    path: '/api/v1/reports',  desc: { fr: 'Rapport financier',          ht: 'Rapò finansye' } },
];

const METHOD_COLOR: Record<string, string> = {
  GET:    'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
  POST:   'bg-blue-100    text-blue-700    dark:bg-blue-900/30    dark:text-blue-400',
  PUT:    'bg-amber-100   text-amber-700   dark:bg-amber-900/30   dark:text-amber-400',
  DELETE: 'bg-red-100     text-red-700     dark:bg-red-900/30     dark:text-red-400',
};

function UpgradeGate({ children }: { children: React.ReactNode }) {
  const plan = usePlan();
  const { t } = useLanguage();
  if (plan.loading) return <div className="flex h-64 items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-300 border-t-[#001F3F]" /></div>;
  if (!plan.can('api_access')) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 rounded-2xl border border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800/30 p-12 text-center">
        <div className="text-4xl">🔌</div>
        <h2 className="text-xl font-bold text-[var(--color-text)]">{t({ fr: 'API Access', ht: 'API Access' })}</h2>
        <p className="max-w-sm text-sm text-[var(--color-muted)]">{t({ fr: 'Disponible en plan Expert. Connectez ProfitPilot à vos outils externes via notre API REST.', ht: 'Disponib nan plan Expert. Konekte ProfitPilot ak zouti ekstèn ou yo via API REST nou.' })}</p>
        <Link href="/pricing" className="rounded-xl bg-[#001F3F] px-6 py-2.5 text-sm font-bold text-white hover:bg-[#002D5B] transition">{t({ fr: 'Passer Expert', ht: 'Pase Expert' })}</Link>
      </div>
    );
  }
  return <>{children}</>;
}

function maskKey(key: string) {
  return key.slice(0, 8) + '•'.repeat(24) + key.slice(-4);
}

export default function ApiAccessPage() {
  const { t } = useLanguage();
  const [apiKey] = useState('pp_live_sk_' + Math.random().toString(36).slice(2, 18));
  const [revealed, setRevealed] = useState(false);

  const copy = () => {
    navigator.clipboard.writeText(apiKey);
    toast.success(t({ fr: 'Clé copiée !', ht: 'Kle kopye!' }));
  };

  return (
    <ProtectedRoute>
      <div className="mx-auto max-w-3xl space-y-8 px-4 py-8 sm:px-6">
        <div>
          <h1 className="text-2xl font-bold text-[var(--color-text)]">{t({ fr: 'API Access', ht: 'API Access' })}</h1>
          <p className="mt-1 text-sm text-[var(--color-muted)]">{t({ fr: 'Intégrez ProfitPilot à vos outils via notre API REST', ht: 'Entegre ProfitPilot ak zouti ou yo via API REST nou' })}</p>
        </div>

        <UpgradeGate>
          {/* API Key card */}
          <div className="rounded-2xl border border-[var(--color-border)] bg-white dark:bg-[#0F172A] p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-[var(--color-text)]">{t({ fr: 'Votre clé API', ht: 'Kle API ou' })}</h2>
              <span className="rounded-full bg-emerald-100 dark:bg-emerald-900/30 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 dark:text-emerald-400">Live</span>
            </div>
            <div className="flex items-center gap-3 rounded-xl bg-[var(--color-surface)] dark:bg-slate-800/50 border border-[var(--color-border)] px-4 py-3">
              <code className="flex-1 min-w-0 truncate text-xs font-mono text-[var(--color-text)]">
                {revealed ? apiKey : maskKey(apiKey)}
              </code>
              <button onClick={() => setRevealed(r => !r)} className="flex-shrink-0 text-xs text-[var(--color-muted)] hover:text-[var(--color-text)] transition">
                {revealed ? t({ fr: 'Masquer', ht: 'Kache' }) : t({ fr: 'Afficher', ht: 'Montre' })}
              </button>
              <button onClick={copy} className="flex-shrink-0 rounded-lg bg-[#001F3F] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#002D5B] transition">
                {t({ fr: 'Copier', ht: 'Kopye' })}
              </button>
            </div>
            <p className="text-xs text-[var(--color-muted)]">
              ⚠️ {t({ fr: 'Ne partagez jamais cette clé. Elle donne accès à toutes vos données.', ht: 'Pa janm pataje kle sa a. Li ba ou aksè nan tout done ou.' })}
            </p>
          </div>

          {/* Endpoints */}
          <div className="rounded-2xl border border-[var(--color-border)] bg-white dark:bg-[#0F172A] overflow-hidden">
            <div className="border-b border-[var(--color-border)] px-5 py-4">
              <h2 className="text-sm font-semibold text-[var(--color-text)]">{t({ fr: 'Endpoints disponibles', ht: 'Endpoint disponib yo' })}</h2>
              <p className="mt-0.5 text-xs text-[var(--color-muted)]">Base URL: <code className="font-mono">https://api.profitpilot.app/v1</code></p>
            </div>
            <div className="divide-y divide-[var(--color-border)]">
              {ENDPOINTS.map((ep, i) => (
                <div key={i} className="flex items-center gap-4 px-5 py-3.5">
                  <span className={`flex-shrink-0 rounded-md px-2 py-0.5 text-[0.65rem] font-bold font-mono ${METHOD_COLOR[ep.method] ?? ''}`}>{ep.method}</span>
                  <code className="flex-1 min-w-0 truncate text-xs font-mono text-[var(--color-text)]">{ep.path}</code>
                  <span className="text-xs text-[var(--color-muted)] hidden sm:block">{t(ep.desc)}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Code example */}
          <div className="rounded-2xl border border-[var(--color-border)] bg-[#0F172A] p-5 overflow-x-auto">
            <p className="mb-3 text-xs font-semibold text-slate-400 uppercase tracking-widest">{t({ fr: 'Exemple', ht: 'Egzanp' })}</p>
            <pre className="text-xs text-slate-300 leading-relaxed whitespace-pre">{`curl https://api.profitpilot.app/v1/sales \\
  -H "Authorization: Bearer ${revealed ? apiKey : maskKey(apiKey)}" \\
  -H "Content-Type: application/json"`}</pre>
          </div>
        </UpgradeGate>
      </div>
    </ProtectedRoute>
  );
}
