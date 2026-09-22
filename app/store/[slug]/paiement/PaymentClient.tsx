'use client';

// ─────────────────────────────────────────────────────────────────────────────
// La page de paiement, côté écran
//
// Une seule chose à faire sur cet écran, et elle se fait AILLEURS : dans
// l'application MonCash ou NatCash de l'acheteur. L'écran porte donc les trois
// informations à recopier — montant, numéro, référence — en gros, chacune avec
// son bouton « Copier », et rien qui leur dispute l'attention.
//
// Le compte à rebours est honnête sur ce qu'il mesure : la validité des
// INSTRUCTIONS, pas celle d'un paiement. À zéro, l'écran ne dit pas « trop
// tard » — il dit « si vous avez déjà payé, signalez-le », parce qu'un virement
// effectué à 14 h 22 pour une session close à 14 h 15 reste un virement.
//
// L'écran se relit seul toutes les quinze secondes tant que rien n'est tranché :
// l'acheteur qui garde la page ouverte voit « Paiement confirmé » arriver sans
// recharger.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Check, Clock, Copy, Loader2, ShieldCheck } from 'lucide-react';
import {
  getCustomerPaymentStatus,
  reportCustomerPayment,
  restartPaymentSession,
} from '../../../actions/paymentBridgePublic';
import { storeMoney } from '../../../../components/store/format';
import { PAYMENT_MARK } from '../../../../lib/storePayments';
import type { BridgeMethod, IntentStatus } from '../../../../lib/paymentBridge/types';

type IntentView = {
  id:               string;
  reference:        string;
  status:           IntentStatus;
  method:           BridgeMethod;
  amount:           number;
  currency:         string;
  chargeAmount:     number;
  chargeCurrency:   string;
  remaining:        number;
  destination:      string | null;
  destinationLabel: string | null;
  instructions:     string | null;
  orderNumber:      string | null;
  orderId:          string | null;
  expiresAt:        string | null;
  reported:         boolean;
};

const METHOD_NAME: Partial<Record<BridgeMethod, string>> = { moncash: 'MonCash', natcash: 'NatCash' };

const POLL_MS = 15_000;

export function PaymentClient({
  slug, base, storeName, contactPhone, intent,
}: {
  slug:         string;
  base:         string;
  storeName:    string;
  contactPhone: string | null;
  intent:       IntentView;
}) {
  const [status, setStatus]       = useState<IntentStatus>(intent.status);
  const [remaining, setRemaining] = useState(intent.remaining);
  const [expiresAt, setExpiresAt] = useState<string | null>(intent.expiresAt);
  const [reported, setReported]   = useState(intent.reported);
  const [now, setNow]             = useState(() => Date.now());
  const [error, setError]         = useState('');
  const [busy, setBusy]           = useState(false);
  const [formOpen, setFormOpen]   = useState(false);

  const methodName = METHOD_NAME[intent.method] ?? 'Mobile';
  const mark = intent.method === 'moncash' || intent.method === 'natcash' ? PAYMENT_MARK[intent.method] : null;

  const settled = status === 'confirmed';
  const closed  = status === 'rejected' || status === 'cancelled';

  // ── L'horloge ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!expiresAt || settled || closed) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [expiresAt, settled, closed]);

  const secondsLeft = expiresAt ? Math.max(0, Math.floor((Date.parse(expiresAt) - now) / 1000)) : 0;
  const expired = !expiresAt || secondsLeft === 0;

  // ── La relecture ──────────────────────────────────────────────────────
  const refresh = useCallback(async () => {
    const res = await getCustomerPaymentStatus({ slug, intentId: intent.id });
    if (!res.ok) return;
    setStatus(res.data.status);
    setRemaining(res.data.remaining);
    setExpiresAt(res.data.expiresAt);
    setReported(res.data.reported);
  }, [slug, intent.id]);

  useEffect(() => {
    if (settled || closed) return;
    const t = setInterval(() => { if (document.visibilityState === 'visible') void refresh(); }, POLL_MS);
    return () => clearInterval(t);
  }, [refresh, settled, closed]);

  async function restart() {
    setBusy(true);
    setError('');
    const res = await restartPaymentSession({ slug, intentId: intent.id });
    setBusy(false);
    if (!res.ok) { setError(res.message); return; }
    setExpiresAt(res.data.expiresAt);
    setNow(Date.now());
  }

  // ── Les états qui ferment l'écran ─────────────────────────────────────
  if (settled) {
    return (
      <Shell>
        <Hero tone="done" title="Paiement confirmé"
              text={`${storeName} a bien reçu votre paiement${intent.orderNumber ? ` pour la commande ${intent.orderNumber}` : ''}.`} />
        {intent.orderId && (
          <PrimaryLink href={`${base}/confirmation?id=${intent.orderId}`}>Voir ma commande</PrimaryLink>
        )}
      </Shell>
    );
  }

  if (closed) {
    return (
      <Shell>
        <Hero tone="closed" title={status === 'rejected' ? 'Paiement non reçu' : 'Paiement annulé'}
              text={status === 'rejected'
                ? `${storeName} n'a pas trouvé votre paiement. Si vous avez bien payé, contactez la boutique avec votre numéro de transaction.`
                : `Ce paiement a été annulé par ${storeName}.`} />
        {contactPhone && (
          <p className="mt-4 text-center text-[14px] text-[var(--st-ink-2)]">Boutique : {contactPhone}</p>
        )}
      </Shell>
    );
  }

  const partial = remaining > 0 && remaining < intent.chargeAmount;

  return (
    <Shell>
      <header className="text-center">
        <p className="text-[13px] font-semibold uppercase tracking-wide text-[var(--st-ink-3)]">
          {intent.orderNumber ? `Commande ${intent.orderNumber}` : 'Paiement'}
        </p>
        <h1 className="mt-1 text-[22px] font-semibold text-[var(--st-ink)]">
          Payer avec {methodName}
        </h1>
      </header>

      {/* ── Les trois choses à recopier ── */}
      <section
        className="mt-6 rounded-[var(--st-radius-card)] border p-5"
        style={{ borderColor: 'var(--st-border)', background: 'var(--st-surface)' }}
      >
        <div className="text-center">
          <p className="text-[13px] text-[var(--st-ink-2)]">{partial ? 'Reste à payer' : 'Montant à envoyer'}</p>
          <p className="mt-1 text-[34px] font-bold tabular-nums leading-tight text-[var(--st-ink)]">
            {storeMoney(remaining, intent.chargeCurrency)}
          </p>
          {intent.currency !== intent.chargeCurrency && (
            // MonCash n'encaisse que des gourdes : l'équivalent est dit, pour que
            // l'acheteur qui a vu un prix en dollars comprenne le chiffre.
            <p className="mt-1 text-[13px] text-[var(--st-ink-3)]">
              Commande de {storeMoney(intent.amount, intent.currency)}
            </p>
          )}
        </div>

        <div className="mt-5 flex flex-col gap-3">
          <CopyRow
            label={intent.destinationLabel ?? `Numéro ${methodName}`}
            value={intent.destination ?? '—'}
            copyValue={intent.destination?.replace(/\s/g, '') ?? ''}
            copyLabel="Copier le numéro"
            chip={mark ? { text: mark.short, color: mark.color } : null}
          />
          <CopyRow
            label="Référence"
            value={intent.reference}
            copyValue={intent.reference}
            copyLabel="Copier la référence"
            hint="Écrivez-la dans le message du transfert si votre application le permet."
          />
        </div>

        {/* ── Le délai ── */}
        <div
          className="mt-5 flex items-center justify-center gap-2 rounded-[8px] px-3 py-2 text-[13px]"
          style={{ background: 'var(--st-surface-2)', color: 'var(--st-ink-2)' }}
          aria-live="polite"
        >
          <Clock className="h-4 w-4 flex-shrink-0" aria-hidden />
          {expired ? (
            <span>Le délai de ces instructions est écoulé.</span>
          ) : (
            <span>
              Instructions valables encore{' '}
              <strong className="tabular-nums text-[var(--st-ink)]">{mmss(secondsLeft)}</strong>
            </span>
          )}
        </div>
        {expired && (
          <div className="mt-3 text-center">
            <p className="text-[13px] text-[var(--st-ink-2)]">
              Déjà payé ? Signalez-le ci-dessous : votre paiement reste valable.
            </p>
            <button
              type="button" onClick={restart} disabled={busy}
              className="mt-2 text-[14px] font-semibold text-[var(--st-ink)] underline underline-offset-4 disabled:opacity-50"
            >
              Pas encore payé ? Afficher à nouveau les instructions
            </button>
          </div>
        )}
      </section>

      {/* ── Comment faire ── */}
      <ol className="mt-6 flex flex-col gap-3 text-[14px] text-[var(--st-ink-2)]">
        <Step n={1}>Ouvrez {methodName} sur votre téléphone et choisissez d'envoyer de l'argent.</Step>
        <Step n={2}>
          Envoyez exactement <strong className="text-[var(--st-ink)]">{storeMoney(remaining, intent.chargeCurrency)}</strong> au
          numéro ci-dessus.
        </Step>
        <Step n={3}>Revenez ici et appuyez sur « J'ai effectué le paiement ».</Step>
      </ol>

      {intent.instructions && (
        <p
          className="mt-4 rounded-[8px] p-3 text-[13px] text-[var(--st-ink-2)]"
          style={{ background: 'var(--st-surface-2)' }}
        >
          <span className="font-semibold text-[var(--st-ink)]">{storeName} : </span>
          {intent.instructions}
        </p>
      )}

      {/* ── Le signalement ── */}
      <div className="mt-6">
        {reported ? (
          <div
            className="flex items-start gap-3 rounded-[var(--st-radius-card)] border p-4"
            style={{ borderColor: 'var(--st-border)', background: 'var(--st-surface)' }}
            aria-live="polite"
          >
            <Loader2 className="mt-0.5 h-5 w-5 flex-shrink-0 animate-spin text-[var(--st-ink-3)]" aria-hidden />
            <div>
              <p className="text-[15px] font-semibold text-[var(--st-ink)]">Paiement signalé</p>
              <p className="mt-1 text-[13px] text-[var(--st-ink-2)]">
                {storeName} vérifie son téléphone. Cette page se mettra à jour dès que le paiement sera confirmé —
                vous pouvez aussi la fermer.
              </p>
            </div>
          </div>
        ) : formOpen ? (
          <ReportForm
            slug={slug}
            intentId={intent.id}
            expected={remaining}
            currency={intent.chargeCurrency}
            onDone={(s) => { setReported(true); setStatus(s); setFormOpen(false); }}
            onCancel={() => setFormOpen(false)}
          />
        ) : (
          <button
            type="button"
            onClick={() => setFormOpen(true)}
            className="flex min-h-[52px] w-full items-center justify-center rounded-[var(--st-radius-btn)] px-6 text-[16px] font-semibold transition hover:brightness-95"
            style={{ background: 'var(--st-accent)', color: 'var(--st-accent-ink)' }}
          >
            J'ai effectué le paiement
          </button>
        )}
      </div>

      {error && <p className="mt-3 text-center text-[13px] text-red-600" role="alert">{error}</p>}

      <p className="mt-6 flex items-start justify-center gap-2 text-center text-[12px] text-[var(--st-ink-3)]">
        <ShieldCheck className="mt-0.5 h-4 w-4 flex-shrink-0" aria-hidden />
        <span>
          Vous payez directement {storeName}. L'argent va sur son numéro, sans intermédiaire.
        </span>
      </p>
    </Shell>
  );
}

// ─── Le formulaire de signalement ────────────────────────────────────────────

function ReportForm({
  slug, intentId, expected, currency, onDone, onCancel,
}: {
  slug: string; intentId: string; expected: number; currency: string;
  onDone: (s: IntentStatus) => void; onCancel: () => void;
}) {
  const [reference, setReference] = useState('');
  const [amount, setAmount]       = useState(String(expected));
  const [sender, setSender]       = useState('');
  const [busy, setBusy]           = useState(false);
  const [error, setError]         = useState('');

  const parsedAmount = useMemo(() => {
    const n = Number(amount.replace(/\s/g, '').replace(',', '.'));
    return Number.isFinite(n) && n > 0 ? n : null;
  }, [amount]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    const res = await reportCustomerPayment({
      slug, intentId,
      declaredAmount:    parsedAmount,
      declaredReference: reference.trim() || null,
      declaredSender:    sender.trim() || null,
    });
    setBusy(false);
    if (!res.ok) { setError(res.message); return; }
    onDone(res.data.status);
  }

  return (
    <form
      onSubmit={submit}
      className="flex flex-col gap-4 rounded-[var(--st-radius-card)] border p-4"
      style={{ borderColor: 'var(--st-border)', background: 'var(--st-surface)' }}
    >
      <Input
        label="Numéro de transaction"
        hint="Il figure dans le SMS de confirmation que vous avez reçu. Il aide la boutique à retrouver votre paiement."
        value={reference} onChange={setReference} autoComplete="off" maxLength={64}
      />
      <Input
        label={`Montant envoyé (${currency})`} value={amount} onChange={setAmount}
        inputMode="decimal" maxLength={14}
      />
      <Input
        label="Votre numéro (facultatif)" hint="Celui depuis lequel vous avez payé."
        value={sender} onChange={setSender} inputMode="tel" autoComplete="tel" maxLength={20}
      />

      {error && <p className="text-[13px] text-red-600" role="alert">{error}</p>}

      <button
        type="submit" disabled={busy}
        className="flex min-h-[52px] w-full items-center justify-center gap-2 rounded-[var(--st-radius-btn)] px-6 text-[16px] font-semibold transition hover:brightness-95 disabled:opacity-60"
        style={{ background: 'var(--st-accent)', color: 'var(--st-accent-ink)' }}
      >
        {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
        Signaler mon paiement
      </button>
      <button type="button" onClick={onCancel}
              className="text-[14px] font-semibold text-[var(--st-ink-2)] underline underline-offset-4">
        Retour
      </button>
    </form>
  );
}

// ─── Les briques ─────────────────────────────────────────────────────────────

function Shell({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto max-w-md px-4 py-8 sm:py-12">{children}</div>;
}

function Hero({ tone, title, text }: { tone: 'done' | 'closed'; title: string; text: string }) {
  return (
    <div className="flex flex-col items-center text-center" aria-live="polite">
      <div className="flex h-16 w-16 items-center justify-center rounded-full"
           style={{ background: 'var(--st-surface-2)' }}>
        {tone === 'done'
          ? <Check className="h-8 w-8" style={{ color: 'var(--st-accent)' }} strokeWidth={2.2} aria-hidden />
          : <Clock className="h-8 w-8 text-[var(--st-ink-3)]" aria-hidden />}
      </div>
      <h1 className="mt-5 text-[24px] font-semibold text-[var(--st-ink)]">{title}</h1>
      <p className="mt-2 max-w-sm text-[14px] text-[var(--st-ink-2)]">{text}</p>
    </div>
  );
}

function PrimaryLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <div className="mt-8 flex justify-center">
      <Link href={href}
            className="flex min-h-[48px] items-center justify-center rounded-[var(--st-radius-btn)] px-8 text-[15px] font-semibold transition hover:brightness-95"
            style={{ background: 'var(--st-accent)', color: 'var(--st-accent-ink)' }}>
        {children}
      </Link>
    </div>
  );
}

function CopyRow({
  label, value, copyValue, copyLabel, hint, chip,
}: {
  label: string; value: string; copyValue: string; copyLabel: string;
  hint?: string; chip?: { text: string; color: string } | null;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(copyValue);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Presse-papiers refusé (navigateur intégré d'une messagerie) : la valeur
      // reste lisible et sélectionnable, rien n'est perdu.
    }
  }

  return (
    <div className="rounded-[8px] p-3" style={{ background: 'var(--st-surface-2)' }}>
      <div className="flex items-center gap-2">
        <p className="text-[12px] text-[var(--st-ink-3)]">{label}</p>
        {chip && (
          <span className="rounded-full border px-2 py-0.5 text-[11px] font-bold"
                style={{ color: chip.color, borderColor: chip.color }}>
            {chip.text}
          </span>
        )}
      </div>
      <div className="mt-1 flex items-center justify-between gap-3">
        <p className="select-all text-[20px] font-bold tabular-nums tracking-wide text-[var(--st-ink)]">{value}</p>
        {copyValue && (
          <button
            type="button" onClick={copy}
            className="flex min-h-[44px] flex-shrink-0 items-center gap-1.5 rounded-[var(--st-radius-btn)] border px-3 text-[13px] font-semibold text-[var(--st-ink)]"
            style={{ borderColor: 'var(--st-border)', background: 'var(--st-surface)' }}
            aria-label={copyLabel}
          >
            {copied ? <Check className="h-4 w-4" aria-hidden /> : <Copy className="h-4 w-4" aria-hidden />}
            {copied ? 'Copié' : 'Copier'}
          </button>
        )}
      </div>
      {hint && <p className="mt-1 text-[12px] text-[var(--st-ink-3)]">{hint}</p>}
    </div>
  );
}

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-3">
      <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full text-[12px] font-bold"
            style={{ background: 'var(--st-surface-2)', color: 'var(--st-ink)' }}>
        {n}
      </span>
      <span className="pt-0.5">{children}</span>
    </li>
  );
}

function Input({
  label, hint, value, onChange, ...rest
}: {
  label: string; hint?: string; value: string; onChange: (v: string) => void;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'>) {
  return (
    <label className="block">
      <span className="text-[13px] font-semibold text-[var(--st-ink)]">{label}</span>
      <input
        {...rest}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 block min-h-[48px] w-full rounded-[8px] border px-3 text-[16px] text-[var(--st-ink)] outline-none focus:ring-2"
        style={{ borderColor: 'var(--st-border)', background: 'var(--st-surface)' }}
      />
      {hint && <span className="mt-1 block text-[12px] text-[var(--st-ink-3)]">{hint}</span>}
    </label>
  );
}

function mmss(total: number): string {
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}
