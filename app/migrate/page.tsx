'use client';

import { useCallback, useEffect, useState } from 'react';
import { useLanguage } from '../../components/LanguageWrapper';
import { cleanupOrphans } from '../actions/cleanup';

type State = {
  status: 'idle' | 'loading' | 'success' | 'error';
  message: string;
  sql?: string;
  hint?: string;
};

type CleanupState = {
  status: 'idle' | 'loading' | 'success' | 'error';
  message: string;
  deleted?: Record<string, number>;
};

export default function MigratePage() {
  const { t } = useLanguage();
  const [state, setState] = useState<State>({ status: 'idle', message: '' });
  const [cleanup, setCleanup] = useState<CleanupState>({ status: 'idle', message: '' });
  const [sql, setSql] = useState('');

  useEffect(() => {
    fetch('/api/migrate')
      .then(r => r.json())
      .then(d => { if (d.sql) setSql(d.sql); })
      .catch(() => {});
  }, []);

  const run = useCallback(async () => {
    setState({ status: 'loading', message: 'Exécution…' });
    try {
      const r = await fetch('/api/migrate', { method: 'POST' });
      const d = await r.json();
      if (d.success) {
        setState({ status: 'success', message: d.message || t({ fr: 'Migration réussie !', ht: 'Migrasyon reyisi !' }) });
      } else {
        setState({ status: 'error', message: d.error, sql: d.sql, hint: d.hint });
      }
    } catch (e: any) {
      setState({ status: 'error', message: e.message, sql, hint: t({ fr: 'Erreur réseau', ht: 'Erè rezo' }) });
    }
  }, [sql]);

  const runCleanup = useCallback(async () => {
    setCleanup({ status: 'loading', message: t({ fr: 'Nettoyage en cours…', ht: 'Netwayaj an kou…' }) });
    try {
      const r = await cleanupOrphans();
      if (r.success) {
        const parts: string[] = [];
        for (const [table, count] of Object.entries(r.deleted)) {
          if (count > 0) parts.push(`${table}: ${count}`);
        }
        const msg = parts.length > 0
          ? `✅ ${parts.join(' · ')} supprimé(s)`
          : '✅ Aucune donnée orpheline trouvée';
        setCleanup({ status: 'success', message: msg, deleted: r.deleted });
      } else {
        setCleanup({ status: 'error', message: r.errors.join(' | ') });
      }
    } catch (e: any) {
      setCleanup({ status: 'error', message: e.message ?? 'Erreur inconnue' });
    }
  }, []);

  return (
    <main className="mx-auto max-w-3xl space-y-6 p-6">
      <h1 className="text-2xl font-bold">Administration</h1>

      {/* ── Migration SQL ── */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="mb-2 text-lg font-semibold">{t({ fr: 'Migration RLS Products', ht: 'Migrasyon RLS Pwodui yo' })}</h2>
        <p className="mb-4 text-sm text-slate-600">
          Applique le fix RLS + trigger sur la table <code>products</code>.
        </p>

        <button
          onClick={run}
          disabled={state.status === 'loading'}
          className="rounded-xl bg-[#001F3F] px-6 py-3 font-semibold text-white transition hover:bg-[#002D5B] disabled:opacity-50"
        >
          {state.status === 'loading' ? t({ fr: 'Exécution…', ht: 'Ekzekisyon…' }) : t({ fr: '▶ Exécuter la Migration', ht: '▶ Ekzekite Migrasyon an' })}
        </button>

        {state.status === 'success' && (
          <div className="mt-4 rounded-xl bg-emerald-50 px-4 py-3 text-emerald-700">{state.message}</div>
        )}

        {state.status === 'error' && (
          <div className="mt-4 space-y-4">
            <div className="rounded-xl bg-red-50 px-4 py-3 text-red-600 text-sm">{state.message}</div>
            {state.hint && (
              <div className="rounded-xl bg-amber-50 px-4 py-3 text-amber-700 text-sm">💡 {state.hint}</div>
            )}
            {state.sql && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">SQL à exécuter manuellement</p>
                  <button onClick={() => navigator.clipboard.writeText(state.sql || '')}
                    className="rounded-lg border border-slate-200 px-3 py-1 text-xs text-slate-500 hover:bg-slate-50">
                    Copier
                  </button>
                </div>
                <pre className="overflow-x-auto rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs text-slate-700">{state.sql}</pre>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Cleanup orphelins ── */}
      <div className="rounded-2xl border border-red-200 bg-white p-6 shadow-sm">
        <h2 className="mb-2 text-lg font-semibold text-red-700">🧹 Nettoyage Données Orphelines</h2>
        <p className="mb-4 text-sm text-slate-600">
          Supprime les enregistrements (clients, produits, ventes, dépenses, achats, préférences, conversations AI)
          dont le <code className="text-red-600">owner_id</code> ou <code className="text-red-600">user_id</code> ne correspond
          à aucun utilisateur Auth existant.
        </p>

        <button
          onClick={runCleanup}
          disabled={cleanup.status === 'loading'}
          className="rounded-xl bg-red-600 px-6 py-3 font-semibold text-white transition hover:bg-red-700 disabled:opacity-50"
        >
          {cleanup.status === 'loading' ? t({ fr: 'Nettoyage…', ht: 'Netwayaj…' }) : t({ fr: '🧹 Nettoyer les Orphelins', ht: '🧹 Netwaye òfelen yo' })}
        </button>

        {cleanup.status === 'success' && (
          <div className="mt-4 rounded-xl bg-emerald-50 px-4 py-3 text-emerald-700 text-sm">{cleanup.message}</div>
        )}

        {cleanup.status === 'error' && (
          <div className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-red-600 text-sm">{cleanup.message}</div>
        )}
      </div>
    </main>
  );
}
