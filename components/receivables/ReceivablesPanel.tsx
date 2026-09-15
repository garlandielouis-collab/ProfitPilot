'use client';

// ─────────────────────────────────────────────────────────────────────────────
// Créances — l'écran le plus haïtien du produit (§6.3)
//
// Le crédit informel est au cœur du petit commerce : c'est ici que se joue la
// crédibilité du produit. Trois zones nettes, SANS un seul trait séparateur —
// la séparation naît de l'espace et du contraste, pas des bordures :
//
//   1. le total dû, en chasse fixe, seul en tête ;
//   2. les filtres en pastilles, au contact direct de la liste qu'ils filtrent ;
//   3. la liste, en lignes à contraste doux.
//
// Ce que la version junior faisait et qui a été retiré :
//   · le montant de chaque ligne en émeraude vif — l'appel à l'action de la
//     palette gaspillé sur une donnée répétée. Les montants sont en marine.
//   · le rouge partout. Il n'apparaît QUE sur les créances en retard — donc
//     il se voit.
//   · les détails en 8–9 px gris clair. À quoi bon afficher une information
//     qu'on ne peut pas lire en plein soleil ?
//   · trois tapes pour relancer un client. Un appui long suffit (§5.8).
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle2, Loader2, MessageCircle, Wallet } from 'lucide-react';
import { toast } from 'sonner';
import {
  listReceivables, markReceivablePaid, prepareReceivableReminder,
  recordReceivablePayment, setReceivableDueDate,
  type Receivable, type ReceivableRefusal, type ReceivableStatus, type ReceivablesSummary,
} from '../../app/actions/receivables';
import { Badge, BottomSheet, Button, FilterPill, Money, formatAmount, type BadgeTone } from '../ds';
import { cn } from '../../lib/utils';
import { unwrap, screenMessage  } from '../../lib/actionResult';

// Rouge = en retard, ambre = échéance qui approche, neutre = en cours.
// Trois tons, et rien d'autre : le jour où le marchand voit du rouge, il doit
// savoir sans lire que quelque chose réclame son attention (§4.2).
const STATUS: Record<ReceivableStatus, { label: string; tone: BadgeTone }> = {
  critical: { label: 'Critique',  tone: 'danger'  },
  overdue:  { label: 'En retard', tone: 'danger'  },
  due_soon: { label: 'Bientôt',   tone: 'warning' },
  open:     { label: 'En cours',  tone: 'neutral' },
  paid:     { label: 'Payé',      tone: 'success' },
};

type Filter = 'all' | 'late' | 'soon';

/** « il y a 12 j » se lit d'un coup d'œil ; une date ISO ne se lit pas. */
function ageLabel(saleDate: string): string {
  const days = Math.floor((Date.now() - new Date(`${saleDate}T00:00:00`).getTime()) / 86_400_000);
  if (days <= 0) return "aujourd'hui";
  if (days === 1) return 'hier';
  if (days < 31) return `il y a ${days} j`;
  return `il y a ${Math.floor(days / 30)} mois`;
}

/** Pourquoi rien n'a été encaissé, dit au marchand. */
function refusalMessage(res: { reason: ReceivableRefusal; balanceDue?: number; currency?: string }): string {
  switch (res.reason) {
    case 'forbidden':
      return "Votre rôle ne permet pas d'encaisser une créance.";
    case 'invalid_amount':
      return 'Entrez le montant reçu.';
    case 'exceeds_balance': {
      // Centimes affichés s'il y en a : arrondi à l'unité, le solde montré
      // (« 1 001 ») serait lui-même refusé une fois retapé.
      const due = res.balanceDue ?? 0;
      return `Le solde n'est que de ${formatAmount(due, res.currency ?? 'HTG', Number.isInteger(due) ? 0 : 2)} — rien n'a été encaissé.`;
    }
    case 'already_settled':
      return "Cette créance est déjà soldée — rien n'a été encaissé.";
    case 'cancelled':
      return "Cette vente a été annulée — rien n'a été encaissé.";
    case 'not_found':
      return "Créance introuvable — rien n'a été encaissé.";
    case 'changed':
      return "Cette créance vient d'être modifiée ailleurs — rien n'a été encaissé, vérifiez le solde.";
  }
}

export function ReceivablesPanel() {
  const [data, setData]       = useState<ReceivablesSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter]   = useState<Filter>('all');
  const [sheet, setSheet]     = useState<Receivable | null>(null);
  // La ligne qui vient d'être soldée : elle se barre et glisse hors de la
  // liste pendant que le total décompte (§7, moment 2).
  const [settled, setSettled] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setData(unwrap(await listReceivables()));
    } catch (err) {
      toast.error(screenMessage(err, 'Chargement impossible.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const items = useMemo(() => {
    if (!data) return [];
    if (filter === 'late') return data.items.filter((r) => r.status === 'overdue' || r.status === 'critical');
    if (filter === 'soon') return data.items.filter((r) => r.status === 'due_soon');
    return data.items;
  }, [data, filter]);

  async function settle(r: Receivable) {
    // Un 2e appui pendant l'encaissement ne repart pas au serveur.
    if (settled) return;
    setSettled(r.saleId);
    try {
      const res = unwrap(await markReceivablePaid(r.saleId));
      if (!res.settled) {
        // Rien n'a été encaissé : la ligne ne se barre pas, et la liste
        // rechargée montre l'état réel (déjà soldée, montant modifié…).
        setSettled(null);
        toast.error(refusalMessage(res));
        await load();
        return;
      }
      // On laisse la chorégraphie se jouer avant de recharger : rembourser
      // doit faire du bien, au client comme au marchand.
      await new Promise((resolve) => setTimeout(resolve, 680));
      await load();
      toast.success(`${r.customerName} — ${formatAmount(res.amount, res.currency)} encaissés, créance soldée.`);
    } catch (err) {
      toast.error(screenMessage(err, 'Mise à jour impossible.'));
    } finally {
      setSettled(null);
      setSheet(null);
    }
  }

  if (loading) {
    return (
      <div className="space-y-2" aria-busy>
        <span className="pp-skeleton block h-20 rounded-surface" />
        <span className="pp-skeleton block h-16 rounded-surface" />
        <span className="pp-skeleton block h-16 rounded-surface" />
      </div>
    );
  }

  if (!data || data.items.length === 0) {
    return (
      <div className="py-16 text-center">
        <CheckCircle2 className="mx-auto h-10 w-10 text-success" strokeWidth={1.5} aria-hidden />
        <p className="mt-4 text-card font-bold text-primary dark:text-dark-text">
          Personne ne vous doit rien
        </p>
        <p className="mt-2 text-body text-text2 dark:text-dark-text2">
          Toutes vos ventes à crédit ont été encaissées.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ZONE 1 — le total dû, seul, en chasse fixe. La dominante de l'écran. */}
      <div>
        <p className="text-note font-bold uppercase tracking-wide text-muted dark:text-dark-muted">
          Total dû
        </p>
        <Money value={data.totalOutstanding} currency={data.currency} size="amount-lg" className="mt-1 block" />
        {data.totalOverdue > 0 && (
          <p className="mt-2 text-body text-danger">
            dont <Money value={data.totalOverdue} currency={data.currency} size="body" tone="down" className="font-bold" /> en retard
          </p>
        )}
      </div>

      {/* ZONE 2 — les filtres, au contact de la liste qu'ils affectent (§6.2) */}
      <div className="flex gap-2 overflow-x-auto scrollbar-none">
        <FilterPill label="Tout"      count={data.items.length}  selected={filter === 'all'}  onClick={() => setFilter('all')} />
        <FilterPill label="En retard" count={data.overdueCount}  selected={filter === 'late'} onClick={() => setFilter('late')} />
        <FilterPill label="Bientôt"   count={data.dueSoonCount}  selected={filter === 'soon'} onClick={() => setFilter('soon')} />
      </div>

      {/* ZONE 3 — la liste. Pas de bordure entre zones : l'espace suffit. */}
      <ul className="-mt-2 space-y-1">
        {items.map((r) => (
          <Row key={r.saleId} item={r} settled={settled === r.saleId} onOpen={() => setSheet(r)} />
        ))}
        {items.length === 0 && (
          <li className="py-10 text-center text-body text-muted dark:text-dark-muted">
            Aucune créance dans ce filtre.
          </li>
        )}
      </ul>

      {sheet && (
        <ActionSheet
          item={sheet}
          onClose={() => setSheet(null)}
          onSettled={() => settle(sheet)}
          onChanged={load}
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Une ligne — nom du client, montant, ancienneté, état. Et rien d'autre.
//
// L'appui long est le clic droit du mobile (§5.8) : il ouvre les actions
// rapides. Mais le geste n'est jamais le seul chemin — la ligne entière est
// aussi un bouton, donc un simple appui ouvre la même feuille.
// ─────────────────────────────────────────────────────────────────────────────

function Row({
  item, settled, onOpen,
}: {
  item: Receivable;
  settled: boolean;
  onOpen: () => void;
}) {
  const timer   = useRef<ReturnType<typeof setTimeout> | null>(null);
  const origin  = useRef<{ x: number; y: number } | null>(null);
  const fired   = useRef(false);
  const status = STATUS[item.status];
  const late = item.status === 'overdue' || item.status === 'critical';

  /** Un doigt ne tient pas immobile. En annulant au moindre pixel, l'appui
   *  long ne se déclenchait qu'en posant le téléphone sur une table : on
   *  tolère donc une dérive de 10 px, comme n'importe quel appui long natif. */
  const DRIFT_PX = 10;

  function startPress(e: React.TouchEvent) {
    const touch = e.touches[0];
    origin.current = { x: touch.clientX, y: touch.clientY };
    fired.current  = false;
    timer.current = setTimeout(() => {
      fired.current = true;
      // Un retour haptique confirme que le geste a pris, avant même que la
      // feuille ne monte.
      navigator.vibrate?.(12);
      onOpen();
    }, 420);
  }

  function movePress(e: React.TouchEvent) {
    if (!origin.current) return;
    const touch = e.touches[0];
    const drift = Math.hypot(touch.clientX - origin.current.x, touch.clientY - origin.current.y);
    // Au-delà, le doigt fait défiler la liste : ce n'est plus un appui long.
    if (drift > DRIFT_PX) endPress();
  }

  function endPress() {
    if (timer.current) clearTimeout(timer.current);
    timer.current  = null;
    origin.current = null;
  }

  return (
    <li
      className={cn(
        'rounded-surface bg-white dark:bg-dark-surface',
        settled && 'pp-settled',
      )}
    >
      <button
        type="button"
        // Le relâchement qui suit un appui long produit AUSSI un clic : sans
        // ce garde-fou, la feuille s'ouvrait deux fois pour un seul geste.
        onClick={() => { if (!fired.current) onOpen(); fired.current = false; }}
        onTouchStart={startPress}
        onTouchEnd={endPress}
        onTouchMove={movePress}
        onTouchCancel={endPress}
        onContextMenu={(e) => { e.preventDefault(); onOpen(); }}
        className="pressable flex min-h-13 w-full items-center gap-4 rounded-surface px-4 py-3 text-left hover:bg-surface dark:hover:bg-white/5"
      >
        <span className="min-w-0 flex-1">
          <span className={cn('block truncate text-body font-bold text-primary dark:text-dark-text', settled && 'line-through')}>
            {item.customerName}
          </span>
          <span className="mt-1 flex flex-wrap items-center gap-2">
            {/* 12 px minimum (§12) : ce qui ne se lit pas debout dans une boutique
                ne se livre pas (§5.2). */}
            <span className="text-note text-muted dark:text-dark-muted">{ageLabel(item.saleDate)}</span>
            {late && <Badge tone={status.tone}>{status.label}</Badge>}
          </span>
        </span>

        {/* Le montant en marine, chasse fixe : les lignes s'alignent et se
            comparent d'un regard. Pas de chevron — la ligne est déjà cliquable
            sur toute sa surface (§3.6). */}
        <Money value={item.balanceDue} currency={item.currency} size="card" />
      </button>
    </li>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// La feuille d'actions — relancer, solder, encaisser une partie.
// Elle monte par-dessus la liste, qui reste visible derrière : on sait toujours
// de quelle créance on parle (§5.7).
// ─────────────────────────────────────────────────────────────────────────────

function ActionSheet({
  item, onClose, onSettled, onChanged,
}: {
  item: Receivable;
  onClose: () => void;
  onSettled: () => void;
  onChanged: () => Promise<void>;
}) {
  const [busy, setBusy]       = useState<'remind' | 'partial' | null>(null);
  const [partial, setPartial] = useState('');

  async function remind() {
    setBusy('remind');
    try {
      const { message, whatsappUrl, hasPhone } = unwrap(await prepareReceivableReminder(item.saleId));
      window.open(whatsappUrl, '_blank', 'noopener,noreferrer');
      if (!hasPhone) {
        await navigator.clipboard?.writeText(message).catch(() => {});
        toast.info('Aucun numéro enregistré — message copié, choisissez le contact.');
      }
      await onChanged();
      onClose();
    } catch (err) {
      toast.error(screenMessage(err, 'Relance impossible.'));
    } finally {
      setBusy(null);
    }
  }

  async function payPartial() {
    const amount = Number(partial.replace(',', '.'));
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error('Entrez le montant reçu.');
      return;
    }
    if (amount > item.balanceDue) {
      toast.error(`Le solde n'est que de ${formatAmount(item.balanceDue, item.currency)}.`);
      return;
    }
    setBusy('partial');
    try {
      const res = await recordReceivablePayment(item.saleId, amount);
      if (!res.settled) {
        toast.error(refusalMessage(res));
        // Le reste dû affiché n'est plus le bon : on recharge et on referme,
        // la feuille rouverte montrera le montant réel.
        if (res.reason !== 'invalid_amount' && res.reason !== 'forbidden') {
          await onChanged();
          onClose();
        }
        return;
      }
      toast.success(
        res.fullyPaid
          ? `${formatAmount(res.amount, res.currency)} encaissés — créance soldée.`
          : `${formatAmount(res.amount, res.currency)} encaissés — reste ${formatAmount(res.balanceDue, res.currency)}.`,
      );
      await onChanged();
      onClose();
    } catch (err) {
      toast.error(screenMessage(err, 'Enregistrement impossible.'));
    } finally {
      setBusy(null);
    }
  }

  return (
    <BottomSheet open onClose={onClose} title={item.customerName}>
      <div className="space-y-6">
        <div>
          <p className="text-note font-bold uppercase tracking-wide text-muted dark:text-dark-muted">
            Reste à payer
          </p>
          <Money value={item.balanceDue} currency={item.currency} size="amount-lg" className="mt-1 block" />
          {item.paidAmount > 0 && (
            <p className="mt-2 text-note text-muted dark:text-dark-muted">
              déjà réglé {formatAmount(item.paidAmount, item.currency)}
            </p>
          )}
        </div>

        {/* L'action du quotidien, en tête et en un geste. */}
        <Button
          variant="primary"
          size="lg"
          block
          loading={busy === 'remind'}
          loadingLabel="Ouverture de WhatsApp…"
          onClick={remind}
          icon={<MessageCircle className="h-5 w-5" strokeWidth={1.8} aria-hidden />}
        >
          Relancer sur WhatsApp
        </Button>

        <div className="space-y-2">
          <label htmlFor="pp-due" className="block text-note font-bold uppercase tracking-wide text-muted dark:text-dark-muted">
            Échéance convenue
          </label>
          <input
            id="pp-due"
            type="date"
            defaultValue={item.dueDate ?? ''}
            onChange={async (e) => {
              if (!e.target.value) return;
              try {
                unwrap(await setReceivableDueDate(item.saleId, e.target.value));
                await onChanged();
                toast.success('Échéance mise à jour.');
              } catch (err) {
                toast.error(screenMessage(err, 'Mise à jour impossible.'));
              }
            }}
            className="min-h-13 w-full rounded-surface border border-border bg-surface px-4 text-body text-primary outline-none focus:border-accent dark:border-dark-border dark:bg-dark-surface2 dark:text-dark-text"
          />
        </div>

        <div className="space-y-2">
          <label htmlFor="pp-partial" className="block text-note font-bold uppercase tracking-wide text-muted dark:text-dark-muted">
            Remboursement partiel
          </label>
          <div className="flex gap-2">
            <input
              id="pp-partial"
              inputMode="decimal"
              value={partial}
              onChange={(e) => setPartial(e.target.value)}
              placeholder={`0 ${item.currency}`}
              className="amount min-h-13 min-w-0 flex-1 rounded-surface border border-border bg-surface px-4 text-body text-primary outline-none placeholder:text-muted focus:border-accent dark:border-dark-border dark:bg-dark-surface2 dark:text-dark-text"
            />
            {/* La paire du §21 : « Encaisser » est le second couteau de
                « Tout est payé ». Il s'efface par la LUMINOSITÉ de la même
                teinte, pas par une bordure seule — un bouton fantôme se lit
                sur une maquette et disparaît au soleil, sur le trottoir. */}
            <Button variant="soft" size="lg" loading={busy === 'partial'} onClick={payPartial}>
              Encaisser
            </Button>
          </div>
        </div>

        {/* Solder est l'action définitive : elle vient en dernier, et le vert
            qu'elle porte est un vert de SUCCÈS, pas l'émeraude de marque. */}
        <Button
          variant="accent"
          size="lg"
          block
          onClick={onSettled}
          icon={<Wallet className="h-5 w-5" strokeWidth={1.8} aria-hidden />}
        >
          Tout est payé
        </Button>

        {/* Le second appel à l'action ne pèse pas le même poids que le premier :
            c'est un lien, pas un bouton (§4.5). */}
        <button
          type="button"
          onClick={onClose}
          className="pressable min-h-touch w-full text-body text-muted underline underline-offset-4 dark:text-dark-muted"
        >
          Fermer
        </button>
      </div>
    </BottomSheet>
  );
}
