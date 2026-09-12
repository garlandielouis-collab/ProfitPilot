'use client';

// ─────────────────────────────────────────────────────────────────────────────
// Rejeu de la file hors-ligne — Bonus 4
//
// Monté une seule fois dans l'AppShell. Il rejoue les ventes en attente dès
// que la connexion revient, en série (pas en parallèle) : le stock est vérifié
// vente par vente côté serveur, et un rejeu concurrent produirait des refus
// incohérents.
//
// La bannière n'apparaît que s'il y a réellement quelque chose en attente :
// un indicateur permanent « hors ligne » finit par ne plus être lu.
//
// Deux sortes d'échec, traitées différemment :
//
//   passager (réseau, stock, client supprimé…) → un essai consommé ; au-delà
//     de MAX_ATTEMPTS, la vente n'est plus rejouée automatiquement, seulement
//     sur le bouton « Sinkronize ». Elle ne quitte jamais la file.
//
//   taux de change manquant → refus définitif TANT QUE le marchand n'a pas saisi
//     son taux USD/HTG. Aucun essai consommé : la vente est marquée « en attente
//     du taux », la bannière le dit, et elle repart à chaque passage (montage,
//     retour du réseau, bouton). Le serveur refuse avant toute écriture : c'est
//     une requête par passage, pas une boucle. Dès que le taux existe, elle passe.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { CloudOff, Loader2, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { createSaleAction } from '../../app/actions/sales';
import {
  listPendingSales, markAttempt, markWaitingForRate, removePendingSale,
  type PendingSale,
} from '../../lib/offlineQueue';

/** Au-delà, la vente est probablement invalide (stock, client supprimé…). */
const MAX_ATTEMPTS = 5;

/**
 * Le refus « taux de change manquant » de `createSaleAction` : une erreur sur
 * le champ `currency` (vente en USD, ou coût d'un produit dans l'autre devise),
 * renvoyée avant toute écriture. La validation Zod ne signale `currency` que
 * pour une devise hors HTG/USD : on l'écarte en vérifiant celle du payload.
 */
function isRateMissing(entry: PendingSale, errors: Array<{ field: string }>): boolean {
  const cur = String(entry.payload.currency ?? 'HTG');
  return (cur === 'HTG' || cur === 'USD') && errors.some((e) => e.field === 'currency');
}

export function OfflineSalesSync() {
  const [pending, setPending] = useState(0);
  const [waitingRate, setWaitingRate] = useState(0);
  const [syncing, setSyncing] = useState(false);

  // Le verrou vit dans une ref, pas dans l'état : s'il dépendait de `syncing`,
  // `flush` serait recréé à chaque bascule, l'effet de montage se rejouerait et
  // rappellerait `flush` — une vente définitivement en échec ferait alors
  // tourner la boucle sans fin. L'état ne sert plus qu'à l'affichage.
  const syncingRef = useRef(false);

  const refresh = useCallback(async () => {
    const queue = await listPendingSales();
    setPending(queue.length);
    setWaitingRate(queue.filter((e) => e.waitingFor === 'exchange_rate').length);
  }, []);

  /** `manual` : geste du marchand — les ventes aux essais épuisés repartent aussi. */
  const flush = useCallback(async (manual: boolean = false) => {
    if (syncingRef.current || typeof navigator === 'undefined' || !navigator.onLine) return;

    const queue = await listPendingSales();
    if (queue.length === 0) { setPending(0); setWaitingRate(0); return; }

    syncingRef.current = true;
    setSyncing(true);
    let replayed = 0;
    let newlyWaiting = 0;

    // Ordre de saisie : les ventes doivent repartir dans l'ordre où le
    // marchand les a faites, sinon les numéros de facture perdent leur sens.
    const ordered = [...queue].sort((a, b) => a.queuedAt.localeCompare(b.queuedAt));

    for (const entry of ordered) {
      const waiting = entry.waitingFor === 'exchange_rate';
      if (!waiting && !manual && entry.attempts >= MAX_ATTEMPTS) continue;
      try {
        const res = await createSaleAction(entry.payload as any);
        if (res.success) {
          await removePendingSale(entry.clientRef);
          replayed++;
        } else if (isRateMissing(entry, res.errors)) {
          if (!waiting) newlyWaiting++;
          await markWaitingForRate(entry, res.errors.map((e) => e.message).join(' · '));
        } else {
          await markAttempt(entry, res.errors.map((e) => e.message).join(' · '));
        }
      } catch (e) {
        // Réseau encore coupé : on s'arrête, la file reste intacte.
        await markAttempt(entry, e instanceof Error ? e.message : 'Erreur réseau');
        break;
      }
    }

    syncingRef.current = false;
    setSyncing(false);
    await refresh();

    if (replayed > 0) {
      toast.success(
        replayed === 1
          ? '1 vant ki te ann atant anrejistre.'
          : `${replayed} vant ki te ann atant anrejistre.`,
      );
    }
    if (newlyWaiting > 0) {
      toast.error(
        `${newlyWaiting} vant ap tann to chanj USD/HTG la. Mete to a nan Paramèt, epi peze « Sinkronize ».`,
      );
    }
  }, [refresh]);

  useEffect(() => {
    refresh();
    flush();

    const onOnline = () => { flush(); };
    const onQueued = () => { refresh(); };

    window.addEventListener('online', onOnline);
    window.addEventListener('pp:sale-queued', onQueued);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('pp:sale-queued', onQueued);
    };
    // `flush` et `refresh` sont désormais stables : l'effet ne se rejoue pas.
  }, [flush, refresh]);

  if (pending === 0) return null;

  return (
    <div className="fixed bottom-4 left-1/2 z-40 flex max-w-[calc(100vw-2rem)] -translate-x-1/2 flex-col gap-2 rounded-2xl border border-amber-300 bg-amber-50 px-4 py-2.5 shadow-lg">
      <div className="flex items-center gap-3">
        <CloudOff className="h-4 w-4 shrink-0 text-amber-600" />
        <p className="text-sm text-amber-800">
          <b>{pending}</b> vant ann atant sinkronizasyon
        </p>
        <button
          onClick={() => flush(true)}
          disabled={syncing}
          className="min-h-touch min-w-touch inline-flex items-center gap-1.5 rounded-xl bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-amber-700 disabled:opacity-60"
        >
          {syncing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          {syncing ? 'Ap sinkronize…' : 'Sinkronize'}
        </button>
      </div>
      {/* Ventes refusées faute de taux : elles restent sur le téléphone et
          partiront dès que le taux sera saisi. */}
      {waitingRate > 0 && (
        <p role="status" className="text-xs text-amber-800">
          <b>{waitingRate}</b> ap tann to chanj USD/HTG la.{' '}
          <Link href="/settings" className="font-semibold underline underline-offset-2">Mete to a</Link>
          , epi peze « Sinkronize ».
        </p>
      )}
    </div>
  );
}
