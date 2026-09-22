'use client';

// ─────────────────────────────────────────────────────────────────────────────
// La boîte de réception des paiements
//
// Un commerçant ouvre cet écran avec une question : « est-ce que j'ai été payé,
// et qu'est-ce que je dois faire ? ». L'écran y répond dans cet ordre :
//
//   1. ce qui attend une décision de SA part   (« À vérifier » — l'onglet d'entrée)
//   2. ce qui cloche                           (« Problèmes »)
//   3. ce qui est réglé                        (« Confirmés »)
//
// Le rangement et les boutons de chaque carte viennent de
// lib/paymentBridge/inbox.ts, pur et testé. Ce fichier ne décide rien : il
// affiche, et il ouvre la bonne feuille.
//
// ── Les mots ───────────────────────────────────────────────────────────────
//
// « Paiement détecté », « Paiement signalé », « Montant reçu ». Jamais « solde »,
// « portefeuille », « disponible » ni « retirer » : ProfitPilot ne détient pas
// cet argent (§52), et un mot qui suggère le contraire est une promesse qu'on ne
// peut pas tenir.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { History, Plus, Settings2, Smartphone, Wallet } from 'lucide-react';
import { toast } from 'sonner';
import {
  Badge, BottomSheet, Button, Card, FilterPill, FirstRun, Money, Section, Stack,
  AmountField, Field, TextField, SelectField, formatAmount, type BadgeTone,
} from '../ds';
import {
  cancelPayment,
  confirmPayment,
  getPaymentInbox,
  getPaymentTimeline,
  linkPaymentReceipt,
  listOpenIntents,
  recordReceivedPayment,
  rejectPayment,
  resolvePaymentReceipt,
  type OpenIntentOption,
  type PaymentInbox as InboxData,
  type PaymentTimelineEntry,
} from '../../app/actions/paymentBridge';
import { cardsForTab, type InboxAction, type InboxCard } from '../../lib/paymentBridge/inbox';
import type { Resolution } from '../../lib/paymentBridge/types';
import { cn } from '../../lib/utils';

type Tab = 'review' | 'problems' | 'confirmed' | 'all';

const TABS: { key: Tab; label: string }[] = [
  { key: 'review',    label: 'À vérifier' },
  { key: 'problems',  label: 'Problèmes' },
  { key: 'confirmed', label: 'Confirmés' },
  { key: 'all',       label: 'Tous' },
];

const TONE: Record<InboxCard['tone'], BadgeTone> = {
  success: 'success', warning: 'warning', danger: 'danger', info: 'info', neutral: 'neutral',
};

const SOURCE_LABEL: Record<string, string> = {
  sms_companion:         'Détecté par le téléphone',
  manual_entry:          'Saisi par vous',
  merchant_confirmation: 'Confirmé par vous',
  provider_api:          "Confirmé par l'opérateur",
  provider_webhook:      "Confirmé par l'opérateur",
};

type Sheet =
  | { kind: 'confirm_manual'; card: InboxCard }
  | { kind: 'confirm';        card: InboxCard }
  | { kind: 'reject';         card: InboxCard }
  | { kind: 'cancel';         card: InboxCard }
  | { kind: 'link';           card: InboxCard }
  | { kind: 'resolve';        card: InboxCard }
  | { kind: 'ignore';         card: InboxCard }
  | { kind: 'timeline';       card: InboxCard }
  | { kind: 'record' }
  | null;

export function PaymentInbox() {
  const params = useSearchParams();
  const focusId = params.get('id');

  const [data, setData]   = useState<InboxData | null>(null);
  const [error, setError] = useState('');
  const [tab, setTab]     = useState<Tab>('review');
  const [sheet, setSheet] = useState<Sheet>(null);

  const load = useCallback(async () => {
    const res = await getPaymentInbox();
    if (!res.ok) { setError(res.message); return; }
    setError('');
    setData(res.data);
  }, []);

  useEffect(() => { void load(); }, [load]);

  // Arrivé depuis une notification : on ouvre l'onglet où se trouve la carte.
  useEffect(() => {
    if (!data || !focusId) return;
    const card = data.cards.find((c) => c.intentId === focusId);
    if (card && (card.tab === 'review' || card.tab === 'problems' || card.tab === 'confirmed')) {
      setTab(card.tab);
    } else if (card) {
      setTab('all');
    }
  }, [data, focusId]);

  const counts = useMemo(() => {
    const cards = data?.cards ?? [];
    return {
      review:    cardsForTab(cards, 'review').length,
      problems:  cardsForTab(cards, 'problems').length,
      confirmed: cardsForTab(cards, 'confirmed').length,
      all:       cards.length,
    };
  }, [data]);

  const visible = useMemo(() => cardsForTab(data?.cards ?? [], tab), [data, tab]);

  const done = useCallback(async (message?: string) => {
    setSheet(null);
    if (message) toast.success(message);
    await load();
  }, [load]);

  if (error && !data) {
    return <p className="rounded-surface bg-danger-sub p-4 text-body text-danger">{error}</p>;
  }

  if (!data) {
    return (
      <div className="space-y-2" aria-busy>
        {[0, 1, 2].map((i) => <div key={i} className="pp-skeleton h-28 rounded-surface" />)}
      </div>
    );
  }

  if (!data.configured && data.cards.length === 0) {
    return (
      <FirstRun
        illustration={<Wallet className="h-12 w-12" strokeWidth={1.5} />}
        title="Recevez MonCash et NatCash sans contrat API."
        hint="Indiquez le numéro sur lequel vos clients vous paient. Vos commandes en ligne afficheront ce numéro, et les paiements arriveront ici pour être confirmés."
        action={
          <Link href="/paiements/reglages" className="block">
            <Button block>Ajouter mon numéro</Button>
          </Link>
        }
      />
    );
  }

  const s = data.stats;

  return (
    <Stack>
      {/* ── Les chiffres du jour — des constats, pas un solde ── */}
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        <Card className="flex flex-col gap-2 p-4">
          <p className="text-note font-bold uppercase tracking-wide text-muted dark:text-dark-muted">Reçu aujourd'hui</p>
          <Money value={s.todayReceived} size="amount" />
          <p className="text-note text-muted dark:text-dark-muted">
            {s.todayCount} paiement{s.todayCount > 1 ? 's' : ''} confirmé{s.todayCount > 1 ? 's' : ''}
          </p>
        </Card>
        <CountTile label="À vérifier" value={s.toReview} tone={s.toReview > 0 ? 'warning' : 'neutral'}
                   onClick={() => setTab('review')} />
        <CountTile label="Non rapprochés" value={s.unmatched} tone={s.unmatched > 0 ? 'danger' : 'neutral'}
                   onClick={() => setTab('problems')} />
        <CountTile label="Montant ou retard" value={s.amountIssues + s.late}
                   tone={s.amountIssues + s.late > 0 ? 'warning' : 'neutral'}
                   onClick={() => setTab('problems')} />
      </div>

      <Section
        title="Paiements"
        action={
          data.canDecide ? (
            <Button variant="soft" size="sm" icon={<Plus className="h-4 w-4" aria-hidden />}
                    onClick={() => setSheet({ kind: 'record' })}>
              Paiement reçu
            </Button>
          ) : undefined
        }
      >
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">
          {TABS.map((t) => (
            <FilterPill key={t.key} label={t.label} count={counts[t.key]}
                        selected={tab === t.key} onClick={() => setTab(t.key)} />
          ))}
        </div>

        {visible.length === 0 ? (
          <p className="py-8 text-center text-body text-muted dark:text-dark-muted">
            {tab === 'review' ? 'Rien à vérifier. Les paiements signalés ou détectés apparaîtront ici.'
              : tab === 'problems' ? 'Aucun problème de paiement.'
              : tab === 'confirmed' ? 'Aucun paiement confirmé ces 60 derniers jours.'
              : 'Aucun paiement ces 60 derniers jours.'}
          </p>
        ) : (
          <ul className="space-y-2">
            {visible.map((c) => (
              <PaymentCard
                key={c.key}
                card={c}
                focused={!!focusId && c.intentId === focusId}
                canDecide={data.canDecide}
                onAction={(a) => setSheet({ kind: a, card: c })}
                onHistory={() => setSheet({ kind: 'timeline', card: c })}
              />
            ))}
          </ul>
        )}
      </Section>

      <p className="flex items-center gap-2 text-note text-muted dark:text-dark-muted">
        <Settings2 className="h-4 w-4" aria-hidden />
        <Link href="/paiements/reglages" className="underline underline-offset-4">
          Numéros d'encaissement et téléphones
        </Link>
      </p>

      <Sheets sheet={sheet} onClose={() => setSheet(null)} onDone={done} />
    </Stack>
  );
}

function CountTile({
  label, value, tone, onClick,
}: { label: string; value: number; tone: 'warning' | 'danger' | 'neutral'; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="text-left">
      <Card interactive className="flex h-full flex-col gap-2 p-4">
        <p className="text-note font-bold uppercase tracking-wide text-muted dark:text-dark-muted">{label}</p>
        <p className={cn(
          'amount text-amount font-bold',
          tone === 'danger' ? 'text-danger' : tone === 'warning' ? 'text-warning' : 'text-primary dark:text-dark-text',
        )}>
          {value}
        </p>
      </Card>
    </button>
  );
}

// ─── La carte de paiement (§31) ──────────────────────────────────────────────

function PaymentCard({
  card, focused, canDecide, onAction, onHistory,
}: {
  card: InboxCard;
  focused: boolean;
  canDecide: boolean;
  onAction: (a: InboxAction) => void;
  onHistory: () => void;
}) {
  const time = new Intl.DateTimeFormat('fr-HT', {
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
  }).format(new Date(card.at));

  const primary: InboxAction | undefined = card.actions.find(
    (a) => a === 'confirm' || a === 'confirm_manual' || a === 'link' || a === 'resolve',
  );
  const secondary = card.actions.filter((a) => a !== primary);

  return (
    <Card as="li" className={cn('p-4', focused && 'ring-2 ring-accent')}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Money value={card.amount} currency={card.currency} size="amount" />
          {card.expected != null && (
            <p className="text-note text-muted dark:text-dark-muted">
              Attendu : {formatAmount(card.expected, card.currency)}
            </p>
          )}
          <p className="mt-1 text-note text-text2 dark:text-dark-text2">
            {[card.methodLabel, card.orderNumber ? `Commande ${card.orderNumber}` : null]
              .filter(Boolean).join(' · ')}
          </p>
          {card.customerName && (
            <p className="text-note text-text2 dark:text-dark-text2">Client : {card.customerName}</p>
          )}
        </div>
        <div className="flex flex-shrink-0 flex-col items-end gap-1">
          <Badge tone={TONE[card.tone]}>{card.headline}</Badge>
          <span className="text-note text-muted dark:text-dark-muted">{time}</span>
        </div>
      </div>

      {card.reason && <p className="mt-3 text-note text-text2 dark:text-dark-text2">{card.reason}</p>}

      <dl className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-note text-muted dark:text-dark-muted">
        {card.reference && <div><dt className="inline">Réf. </dt><dd className="inline amount">{card.reference}</dd></div>}
        {card.transaction && <div><dt className="inline">Transaction </dt><dd className="inline amount">{card.transaction}</dd></div>}
        {card.sender && <div><dt className="inline">De </dt><dd className="inline amount">{card.sender}</dd></div>}
        {card.source && (
          <div className="inline-flex items-center gap-1">
            {card.source === 'sms_companion' && <Smartphone className="h-3.5 w-3.5" aria-hidden />}
            {SOURCE_LABEL[card.source] ?? card.source}
            {card.deviceName ? ` (${card.deviceName})` : ''}
          </div>
        )}
      </dl>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {canDecide && primary && (
          <Button size="sm" variant={primary === 'resolve' ? 'soft' : 'accent'} onClick={() => onAction(primary)}>
            {ACTION_LABEL[primary]}
          </Button>
        )}
        {canDecide && secondary.map((a) => (
          <Button key={a} size="sm" variant="quiet" onClick={() => onAction(a)}>{ACTION_LABEL[a]}</Button>
        ))}
        {card.orderId && (
          <Link href="/boutique/commandes"
                className="text-note font-bold text-primary underline underline-offset-4 dark:text-dark-text">
            Voir la commande
          </Link>
        )}
        {card.intentId && (
          <button type="button" onClick={onHistory}
                  className="ml-auto inline-flex min-h-touch items-center gap-1 text-note text-muted dark:text-dark-muted">
            <History className="h-4 w-4" aria-hidden /> Historique
          </button>
        )}
      </div>
    </Card>
  );
}

const ACTION_LABEL: Record<InboxAction, string> = {
  confirm:        'Confirmer',
  confirm_manual: "J'ai reçu l'argent",
  reject:         'Rejeter',
  cancel:         'Annuler',
  link:           'Associer à une commande',
  resolve:        'Décider',
  ignore:         'Écarter',
};

// ─── Les feuilles ────────────────────────────────────────────────────────────

function Sheets({
  sheet, onClose, onDone,
}: { sheet: Sheet; onClose: () => void; onDone: (msg?: string) => Promise<void> }) {
  if (!sheet) return null;
  switch (sheet.kind) {
    case 'confirm':        return <ConfirmSheet card={sheet.card} onClose={onClose} onDone={onDone} />;
    case 'confirm_manual': return <ManualConfirmSheet card={sheet.card} onClose={onClose} onDone={onDone} />;
    case 'reject':         return <CloseSheet card={sheet.card} to="rejected" onClose={onClose} onDone={onDone} />;
    case 'cancel':         return <CloseSheet card={sheet.card} to="cancelled" onClose={onClose} onDone={onDone} />;
    case 'link':           return <LinkSheet card={sheet.card} onClose={onClose} onDone={onDone} />;
    case 'resolve':        return <ResolveSheet card={sheet.card} onClose={onClose} onDone={onDone} />;
    case 'ignore':         return <ResolveSheet card={sheet.card} only="ignored" onClose={onClose} onDone={onDone} />;
    case 'timeline':       return <TimelineSheet card={sheet.card} onClose={onClose} />;
    case 'record':         return <RecordSheet onClose={onClose} onDone={onDone} />;
  }
}

type SheetProps = { card: InboxCard; onClose: () => void; onDone: (msg?: string) => Promise<void> };

function confirmedMessage(r: { status: string; remaining: number; overpaid: number; settlementError: string | null }, currency: string) {
  if (r.settlementError) return 'Paiement enregistré. La commande est à régulariser : voir la notification.';
  if (r.status === 'confirmed' && r.overpaid > 0) return `Paiement confirmé — ${formatAmount(r.overpaid, currency)} reçus en trop, à décider.`;
  if (r.status === 'confirmed') return 'Paiement confirmé.';
  if (r.remaining > 0) return `Paiement partiel enregistré — il reste ${formatAmount(r.remaining, currency)}.`;
  return 'Enregistré.';
}

function ConfirmSheet({ card, onClose, onDone }: SheetProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function go() {
    if (!card.intentId || !card.receiptId) return;
    setBusy(true);
    const res = await confirmPayment({ intentId: card.intentId, receiptId: card.receiptId });
    setBusy(false);
    if (!res.ok) { setError(res.message); return; }
    await onDone(confirmedMessage(res.data, card.currency));
  }

  return (
    <BottomSheet open onClose={onClose} title="Confirmer ce paiement"
      footer={<Button block onClick={go} loading={busy} loadingLabel="Confirmation…">
        Confirmer {formatAmount(card.amount, card.currency)}
      </Button>}>
      <p className="text-body text-text2 dark:text-dark-text2">
        Vérifiez sur votre téléphone {card.methodLabel} que vous avez bien reçu{' '}
        <strong>{formatAmount(card.amount, card.currency)}</strong>
        {card.orderNumber ? <> pour la commande <strong>{card.orderNumber}</strong></> : null}.
      </p>
      {card.expected != null && (
        <p className="mt-3 text-note text-warning">
          Le montant attendu était {formatAmount(card.expected, card.currency)}.{' '}
          {card.amount < card.expected
            ? 'Le reste sera demandé au client comme un paiement complémentaire.'
            : "L'excédent restera à décider : rien n'est crédité automatiquement."}
        </p>
      )}
      {error && <p className="mt-3 text-note text-danger" role="alert">{error}</p>}
    </BottomSheet>
  );
}

function ManualConfirmSheet({ card, onClose, onDone }: SheetProps) {
  const [amount, setAmount] = useState(String(card.expected ?? card.amount));
  const [txRef, setTxRef]   = useState('');
  const [busy, setBusy]     = useState(false);
  const [error, setError]   = useState('');

  async function go() {
    if (!card.intentId) return;
    const n = Number(amount.replace(/\s/g, '').replace(',', '.'));
    if (!Number.isFinite(n) || n <= 0) { setError('Indiquez le montant reçu.'); return; }
    setBusy(true);
    const res = await confirmPayment({ intentId: card.intentId, amount: n, transactionReference: txRef || null });
    setBusy(false);
    if (!res.ok) { setError(res.message); return; }
    await onDone(confirmedMessage(res.data, card.currency));
  }

  return (
    <BottomSheet open onClose={onClose} title="Confirmer la réception"
      footer={<Button block onClick={go} loading={busy} loadingLabel="Confirmation…">Confirmer</Button>}>
      <div className="space-y-4">
        <p className="text-body text-text2 dark:text-dark-text2">
          Confirmez seulement si l'argent est arrivé sur votre téléphone. Une capture d'écran du client ne suffit pas.
        </p>
        <AmountField label="Montant reçu" currency={card.currency} value={amount}
                     onChange={(e) => setAmount(e.target.value)} />
        <Field label="Numéro de transaction (facultatif)" value={txRef} maxLength={64}
               hint="Celui du SMS de l'opérateur. Il empêche d'enregistrer deux fois le même paiement."
               onChange={(e) => setTxRef(e.target.value)} />
        {error && <p className="text-note text-danger" role="alert">{error}</p>}
      </div>
    </BottomSheet>
  );
}

function CloseSheet({ card, to, onClose, onDone }: SheetProps & { to: 'rejected' | 'cancelled' }) {
  const [reason, setReason] = useState('');
  const [busy, setBusy]     = useState(false);
  const [error, setError]   = useState('');

  async function go() {
    if (!card.intentId) return;
    setBusy(true);
    const res = to === 'rejected'
      ? await rejectPayment({ intentId: card.intentId, reason })
      : await cancelPayment({ intentId: card.intentId, reason });
    setBusy(false);
    if (!res.ok) { setError(res.message); return; }
    await onDone(to === 'rejected' ? 'Paiement rejeté.' : 'Paiement annulé.');
  }

  return (
    <BottomSheet open onClose={onClose} title={to === 'rejected' ? 'Rejeter ce paiement' : 'Annuler ce paiement'}
      footer={<Button block variant="danger" onClick={go} loading={busy}>
        {to === 'rejected' ? 'Rejeter' : 'Annuler le paiement'}
      </Button>}>
      <div className="space-y-4">
        <p className="text-body text-text2 dark:text-dark-text2">
          {to === 'rejected'
            ? "À faire seulement si l'argent n'est pas arrivé. Le client verra que son paiement n'a pas été trouvé et pourra vous contacter."
            : "Le client ne pourra plus payer cette commande en ligne. L'historique est conservé."}
        </p>
        <TextField label="Motif (facultatif)" value={reason} rows={2} maxLength={500}
                   onChange={(e) => setReason(e.target.value)} />
        {error && <p className="text-note text-danger" role="alert">{error}</p>}
      </div>
    </BottomSheet>
  );
}

function LinkSheet({ card, onClose, onDone }: SheetProps) {
  const [options, setOptions] = useState<OpenIntentOption[] | null>(null);
  const [chosen, setChosen]   = useState<string>('');
  const [busy, setBusy]       = useState(false);
  const [error, setError]     = useState('');

  useEffect(() => {
    void (async () => {
      const res = await listOpenIntents();
      if (!res.ok) { setError(res.message); setOptions([]); return; }
      // Les candidates proposées par le rapprochement passent devant.
      const cand = new Set(card.candidateIds);
      setOptions([...res.data].sort((a, b) => Number(cand.has(b.id)) - Number(cand.has(a.id))));
    })();
  }, [card.candidateIds]);

  async function go() {
    if (!card.receiptId || !chosen) return;
    setBusy(true);
    const res = await linkPaymentReceipt({ receiptId: card.receiptId, intentId: chosen });
    setBusy(false);
    if (!res.ok) { setError(res.message); return; }
    await onDone(confirmedMessage(res.data, card.currency));
  }

  return (
    <BottomSheet open onClose={onClose} title="Quelle commande ce paiement règle-t-il ?"
      footer={<Button block onClick={go} loading={busy} disabled={!chosen}>Associer et confirmer</Button>}>
      <p className="mb-3 text-body text-text2 dark:text-dark-text2">
        {formatAmount(card.amount, card.currency)} reçus{card.transaction ? ` — transaction ${card.transaction}` : ''}.
      </p>
      {options === null ? (
        <div className="pp-skeleton h-24 rounded-surface" />
      ) : options.length === 0 ? (
        <p className="text-note text-muted dark:text-dark-muted">Aucune commande en attente de paiement.</p>
      ) : (
        <ul className="space-y-2">
          {options.map((o) => {
            const match = Math.abs(o.remaining - card.amount) < 0.01;
            return (
              <li key={o.id}>
                <label className={cn(
                  'flex min-h-touch cursor-pointer items-center gap-3 rounded-control border p-3',
                  chosen === o.id ? 'border-primary bg-accent-sub' : 'border-border dark:border-dark-border',
                )}>
                  <input type="radio" name="intent" value={o.id} checked={chosen === o.id}
                         onChange={() => setChosen(o.id)} className="h-4 w-4" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-body font-bold text-primary dark:text-dark-text">
                      {o.orderNumber ? `Commande ${o.orderNumber}` : o.reference}
                      {card.candidateIds.includes(o.id) && <Badge tone="info" className="ml-2">Proposée</Badge>}
                    </span>
                    <span className="block text-note text-muted dark:text-dark-muted">
                      {[o.customer, o.method, o.status].filter(Boolean).join(' · ')}
                    </span>
                  </span>
                  <span className={cn('amount text-note font-bold', match ? 'text-success' : 'text-text2 dark:text-dark-text2')}>
                    {formatAmount(o.remaining, o.currency)}
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
      )}
      {error && <p className="mt-3 text-note text-danger" role="alert">{error}</p>}
    </BottomSheet>
  );
}

const RESOLUTION_OPTIONS: { value: Resolution; label: string; hint: string }[] = [
  { value: 'refunded_manually',   label: 'Je rembourse le client',          hint: 'Vous lui renvoyez la somme depuis votre téléphone.' },
  { value: 'credit_next_invoice', label: 'À déduire de sa prochaine commande', hint: 'Vous en tiendrez compte la prochaine fois.' },
  { value: 'customer_credit',     label: 'Crédit en faveur du client',      hint: 'Le client pourra s\'en servir plus tard.' },
  { value: 'resolved_manually',   label: 'Réglé autrement',                  hint: 'Arrangement avec le client, erreur de sa part…' },
  { value: 'ignored',             label: 'Écarter ce paiement',             hint: 'Sans rapport avec la boutique (transfert personnel, SMS mal lu).' },
];

function ResolveSheet({ card, only, onClose, onDone }: SheetProps & { only?: Resolution }) {
  const [choice, setChoice] = useState<Resolution | ''>(only ?? '');
  const [note, setNote]     = useState('');
  const [busy, setBusy]     = useState(false);
  const [error, setError]   = useState('');

  async function go() {
    if (!card.receiptId || !choice) return;
    setBusy(true);
    const res = await resolvePaymentReceipt({ receiptId: card.receiptId, resolution: choice, note: note || null });
    setBusy(false);
    if (!res.ok) { setError(res.message); return; }
    await onDone(choice === 'ignored' ? 'Paiement écarté.' : 'Décision enregistrée.');
  }

  return (
    <BottomSheet open onClose={onClose} title={only === 'ignored' ? 'Écarter ce paiement' : 'Que faire de ce montant ?'}
      footer={<Button block onClick={go} loading={busy} disabled={!choice}>Enregistrer</Button>}>
      <div className="space-y-4">
        <p className="text-body text-text2 dark:text-dark-text2">
          ProfitPilot ne rembourse rien et ne crédite rien : il note votre décision pour que vous vous en souveniez.
        </p>
        {!only && (
          <ul className="space-y-2">
            {RESOLUTION_OPTIONS.map((o) => (
              <li key={o.value}>
                <label className={cn(
                  'flex min-h-touch cursor-pointer items-start gap-3 rounded-control border p-3',
                  choice === o.value ? 'border-primary bg-accent-sub' : 'border-border dark:border-dark-border',
                )}>
                  <input type="radio" name="resolution" className="mt-1 h-4 w-4"
                         checked={choice === o.value} onChange={() => setChoice(o.value)} />
                  <span>
                    <span className="block text-body font-bold text-primary dark:text-dark-text">{o.label}</span>
                    <span className="block text-note text-muted dark:text-dark-muted">{o.hint}</span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
        )}
        <TextField label="Note (facultatif)" value={note} rows={2} maxLength={500}
                   onChange={(e) => setNote(e.target.value)} />
        {error && <p className="text-note text-danger" role="alert">{error}</p>}
      </div>
    </BottomSheet>
  );
}

function TimelineSheet({ card, onClose }: { card: InboxCard; onClose: () => void }) {
  const [entries, setEntries] = useState<PaymentTimelineEntry[] | null>(null);
  const [error, setError]     = useState('');

  useEffect(() => {
    if (!card.intentId) return;
    void (async () => {
      const res = await getPaymentTimeline(card.intentId as string);
      if (!res.ok) { setError(res.message); setEntries([]); return; }
      setEntries(res.data);
    })();
  }, [card.intentId]);

  return (
    <BottomSheet open onClose={onClose} title={card.reference ? `Historique ${card.reference}` : 'Historique'}>
      {entries === null ? (
        <div className="pp-skeleton h-24 rounded-surface" />
      ) : entries.length === 0 ? (
        <p className="text-note text-muted dark:text-dark-muted">{error || 'Aucun événement.'}</p>
      ) : (
        <ol className="space-y-3">
          {entries.map((e, i) => (
            <li key={i} className="flex gap-3">
              <span className="mt-1.5 h-2 w-2 flex-shrink-0 rounded-pill bg-primary dark:bg-dark-text" aria-hidden />
              <div className="min-w-0">
                <p className="text-body text-primary dark:text-dark-text">{e.label}</p>
                <p className="text-note text-muted dark:text-dark-muted">
                  {new Intl.DateTimeFormat('fr-HT', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(e.at))}
                  {' · '}{e.actor}
                </p>
                {e.detail && <p className="text-note text-text2 dark:text-dark-text2">{e.detail}</p>}
              </div>
            </li>
          ))}
        </ol>
      )}
    </BottomSheet>
  );
}

function RecordSheet({ onClose, onDone }: { onClose: () => void; onDone: (msg?: string) => Promise<void> }) {
  const [provider, setProvider] = useState<'moncash' | 'natcash'>('moncash');
  const [amount, setAmount]     = useState('');
  const [txRef, setTxRef]       = useState('');
  const [sender, setSender]     = useState('');
  const [busy, setBusy]         = useState(false);
  const [error, setError]       = useState('');

  async function go() {
    const n = Number(amount.replace(/\s/g, '').replace(',', '.'));
    if (!Number.isFinite(n) || n <= 0) { setError('Indiquez le montant reçu.'); return; }
    setBusy(true);
    const res = await recordReceivedPayment({
      provider, amount: n, transactionReference: txRef || null, senderPhone: sender || null,
    });
    setBusy(false);
    if (!res.ok) { setError(res.message); return; }
    const r = res.data;
    await onDone(
      r.alreadyKnown ? 'Ce paiement était déjà enregistré.'
      : r.confirmed ? 'Paiement enregistré et associé à sa commande.'
      : 'Paiement enregistré. Il vous reste à l\'associer.',
    );
  }

  return (
    <BottomSheet open onClose={onClose} title="Enregistrer un paiement reçu"
      footer={<Button block onClick={go} loading={busy}>Enregistrer</Button>}>
      <div className="space-y-4">
        <p className="text-body text-text2 dark:text-dark-text2">
          Recopiez le SMS de l'opérateur. ProfitPilot cherchera la commande qui correspond.
        </p>
        <SelectField label="Reçu par" value={provider}
                     options={[{ value: 'moncash', label: 'MonCash' }, { value: 'natcash', label: 'NatCash' }]}
                     onChange={(e) => setProvider(e.target.value as 'moncash' | 'natcash')} />
        <AmountField label="Montant reçu" value={amount} onChange={(e) => setAmount(e.target.value)} />
        <Field label="Numéro de transaction" value={txRef} maxLength={64}
               hint="Recommandé : il permet l'association automatique et évite les doublons."
               onChange={(e) => setTxRef(e.target.value)} />
        <Field label="Numéro de l'expéditeur (facultatif)" value={sender} maxLength={20} inputMode="tel"
               onChange={(e) => setSender(e.target.value)} />
        {error && <p className="text-note text-danger" role="alert">{error}</p>}
      </div>
    </BottomSheet>
  );
}
