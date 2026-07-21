'use client';

import { useState } from 'react';
import { ProtectedRoute } from '../../components/ProtectedRoute';
import { usePlan } from '../../hooks/usePlan';
import { useLanguage } from '../../components/LanguageWrapper';
import Link from 'next/link';

const AUTOMATIONS = [
  { id: 'low_stock',    icon: '📦', title: { fr: 'Alerte stock bas', ht: 'Alèt stock ba' },           desc: { fr: 'Notification quand un produit passe sous le seuil minimum', ht: 'Notifikasyon lè yon pwodwi desann anba sèy minimòm' }, active: true },
  { id: 'daily_report', icon: '📊', title: { fr: 'Rapport journalier', ht: 'Rapò chak jou' },         desc: { fr: 'Résumé des ventes et dépenses envoyé chaque soir', ht: 'Rezime vant ak depans voye chak aswè' }, active: false },
  { id: 'credit_alert', icon: '💳', title: { fr: 'Rappel dettes clients', ht: 'Raple dèt kliyan' },   desc: { fr: 'Rappel automatique pour les clients avec solde impayé', ht: 'Rapèl otomatik pou kliyan ki gen balans enpaye' }, active: true },
  { id: 'backup',       icon: '💾', title: { fr: 'Sauvegarde auto', ht: 'Sovgad otomatik' },          desc: { fr: 'Sauvegarde hebdomadaire de toutes vos données', ht: 'Sovgad chak semèn pou tout done ou yo' }, active: false },
  { id: 'invoice',      icon: '🧾', title: { fr: 'Facture automatique', ht: 'Fakti otomatik' },        desc: { fr: 'Générer une facture pour chaque vente à crédit', ht: 'Jenere yon fakti pou chak vant a kredi' }, active: false },
  { id: 'perf_alert',   icon: '🚨', title: { fr: 'Alerte performance', ht: 'Alèt pèfòmans' },         desc: { fr: 'Notification si les ventes chutent de plus de 20%', ht: 'Notifikasyon si vant yo tonbe plis pase 20%' }, active: false },
];

function UpgradeGate({ children }: { children: React.ReactNode }) {
  const plan = usePlan();
  const { t } = useLanguage();
  if (plan.loading) return <div className="flex h-64 items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-300 border-t-[#001F3F]" /></div>;
  if (!plan.can('automation')) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 rounded-2xl border border-orange-200 bg-orange-50 dark:border-orange-800 dark:bg-orange-900/20 p-12 text-center">
        <div className="text-4xl">⚡</div>
        <h2 className="text-xl font-bold text-[var(--color-text)]">{t({ fr: 'Automatisation', ht: 'Otomatizasyon' })}</h2>
        <p className="max-w-sm text-sm text-[var(--color-muted)]">{t({ fr: 'Disponible en plan Expert. Automatisez les tâches répétitives et recevez des alertes intelligentes.', ht: 'Disponib nan plan Expert. Otomatize travay repetitif ak resevwa alèt entelijan.' })}</p>
        <Link href="/pricing" className="rounded-xl bg-orange-500 px-6 py-2.5 text-sm font-bold text-white hover:bg-orange-600 transition">{t({ fr: 'Passer Expert', ht: 'Pase Expert' })}</Link>
      </div>
    );
  }
  return <>{children}</>;
}

export default function AutomationPage() {
  const { t } = useLanguage();
  const [states, setStates] = useState<Record<string, boolean>>(
    Object.fromEntries(AUTOMATIONS.map(a => [a.id, a.active]))
  );

  const toggle = (id: string) => setStates(s => ({ ...s, [id]: !s[id] }));
  const activeCount = Object.values(states).filter(Boolean).length;

  return (
    <ProtectedRoute>
      <div className="mx-auto max-w-3xl space-y-8 px-4 py-8 sm:px-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-[var(--color-text)]">{t({ fr: 'Automatisation', ht: 'Otomatizasyon' })}</h1>
            <p className="mt-1 text-sm text-[var(--color-muted)]">{t({ fr: 'Automatisez les tâches répétitives de votre business', ht: 'Otomatize travay repetitif biznis ou' })}</p>
          </div>
          <span className="flex-shrink-0 rounded-full bg-emerald-100 dark:bg-emerald-900/30 px-3 py-1 text-xs font-semibold text-emerald-700 dark:text-emerald-400">
            {activeCount} {t({ fr: 'active(s)', ht: 'aktif' })}
          </span>
        </div>

        <UpgradeGate>
          <div className="space-y-3">
            {AUTOMATIONS.map(auto => (
              <div key={auto.id} className="flex items-center gap-4 rounded-2xl border border-[var(--color-border)] bg-white dark:bg-[#0F172A] p-5 transition-shadow hover:shadow-sm">
                <span className="text-2xl">{auto.icon}</span>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-[var(--color-text)]">{t(auto.title)}</p>
                  <p className="mt-0.5 text-xs text-[var(--color-muted)]">{t(auto.desc)}</p>
                </div>
                <button
                  onClick={() => toggle(auto.id)}
                  className={`relative flex-shrink-0 h-6 w-11 rounded-full transition-colors duration-200 focus:outline-none ${states[auto.id] ? 'bg-emerald-500' : 'bg-slate-200 dark:bg-slate-700'}`}
                  role="switch"
                  aria-checked={states[auto.id]}
                >
                  <span className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform duration-200 ${states[auto.id] ? 'translate-x-5' : 'translate-x-0'}`} />
                </button>
              </div>
            ))}
          </div>

          <div className="rounded-2xl border border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-900/20 p-4 text-sm text-blue-700 dark:text-blue-300">
            💡 {t({ fr: "Les automatisations s'exécutent en arrière-plan. Les notifications sont envoyées par email et dans l'app.", ht: "Otomatizasyon yo kouri an fon. Notifikasyon yo voye pa imèl ak nan app la." })}
          </div>
        </UpgradeGate>
      </div>
    </ProtectedRoute>
  );
}
