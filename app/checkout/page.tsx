'use client';

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import Link from 'next/link';
import {
  ArrowLeft,
  Check,
  CheckCircle2,
  Copy,
  CreditCard,
  Loader2,
  Lock,
  ShieldCheck,
  Smartphone,
} from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import { getPlanByKey, type Plan } from '../../lib/plans';
import { createPendingPayment } from '../actions/payments';
import { cn } from '../../lib/utils';
import { markSubscriptionActive } from '../../hooks/useSubscription';
import { useLanguage } from '../../components/LanguageWrapper';

// ─── Payment methods config ───────────────────────────────────────────────────

const PAYMENT_METHODS = [
  {
    id: 'moncash' as const,
    name: 'MonCash',
    displayNumber: '509 37 30 45 41',
    rawNumber: '50937304541',
    description: 'Paiement mobile Digicel',
    gradient: 'from-orange-400 to-orange-600',
    selectedBorder: 'border-orange-400',
    selectedBg: 'bg-orange-50',
    textAccent: 'text-orange-600',
    numberBg: 'bg-orange-50 border border-orange-200',
    dot: 'bg-orange-400',
    label: 'M',
  },
  {
    id: 'natcash' as const,
    name: 'NatCash',
    displayNumber: '509 35 95 12 52',
    rawNumber: '50935951252',
    description: 'Paiement mobile Natcom',
    gradient: 'from-emerald-500 to-teal-600',
    selectedBorder: 'border-emerald-400',
    selectedBg: 'bg-emerald-50',
    textAccent: 'text-emerald-600',
    numberBg: 'bg-emerald-50 border border-emerald-200',
    dot: 'bg-emerald-500',
    label: 'N',
  },
  {
    id: 'visa' as const,
    name: 'Carte Visa',
    displayNumber: null as null,
    rawNumber: null as null,
    description: 'Carte de crédit ou débit',
    gradient: 'from-blue-700 to-indigo-800',
    selectedBorder: 'border-blue-500',
    selectedBg: 'bg-blue-50',
    textAccent: 'text-blue-700',
    numberBg: null as null,
    dot: 'bg-blue-600',
    label: null,
  },
] as const;

type MethodId = 'moncash' | 'natcash' | 'visa';
type Step = 'method' | 'payment' | 'success';
type MobileMethod = typeof PAYMENT_METHODS[0] | typeof PAYMENT_METHODS[1];

// ─── Plan Summary ─────────────────────────────────────────────────────────────

function PlanSummary({ plan, currency }: { plan: Plan; currency: 'HTG' | 'USD' }) {
  const { t } = useLanguage();
  const price = currency === 'HTG' ? plan.priceG : plan.priceUsd;

  return (
    <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
      {plan.popular && (
        <span className="inline-flex items-center rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
          ✦ {t({ fr: 'Populaire', ht: 'Popilè' })}
        </span>
      )}
      <h2 className={cn('text-2xl font-bold text-anthracite', plan.popular ? 'mt-2' : 'mt-0')}>
        {plan.key}
      </h2>
      <p className="mt-1 text-sm text-anthracite/70">{plan.description}</p>

      <div className="mt-5 rounded-2xl bg-gradient-to-br from-primary/5 to-primary/10 p-4">
        <p className="text-xs uppercase tracking-wider text-anthracite/50">{t({ fr: 'Total mensuel', ht: 'Total chak mwa' })}</p>
        <p className="mt-1 text-3xl font-bold text-primary">
          {currency === 'HTG'
            ? `G ${price.toLocaleString('fr-FR')}`
            : `$${price.toFixed(2)} USD`}
        </p>
      </div>

      <div className="mt-5 space-y-2.5">
        <p className="text-xs font-semibold uppercase tracking-wider text-anthracite/40">{t({ fr: 'Inclus', ht: 'Enkli' })}</p>
        {plan.features.map((feature) => (
          <div key={feature} className="flex items-center gap-3 text-sm">
            <span className="inline-flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-primary/10">
              <Check className="h-3 w-3 text-primary" />
            </span>
            <span className="text-anthracite/90">{feature}</span>
          </div>
        ))}
      </div>

      <div className="mt-5 flex items-center gap-2 border-t border-slate-100 pt-4 text-xs text-anthracite/40">
        <ShieldCheck className="h-4 w-4" />
        <span>{t({ fr: 'Paiement sécurisé · Annulez à tout moment', ht: 'Peman an sekirite · Anile nenpòt moman' })}</span>
      </div>
    </div>
  );
}

// ─── MonCash / NatCash Flow ───────────────────────────────────────────────────

function MobilePaymentFlow({
  method,
  plan,
  reference,
  onConfirm,
  isLoading,
}: {
  method: MobileMethod;
  plan: Plan;
  reference: string;
  onConfirm: () => void;
  isLoading: boolean;
}) {
  const { t } = useLanguage();
  const [copiedNumber, setCopiedNumber] = useState(false);
  const [copiedRef, setCopiedRef] = useState(false);

  const copy = async (text: string, setter: (v: boolean) => void) => {
    await navigator.clipboard.writeText(text);
    setter(true);
    setTimeout(() => setter(false), 2000);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-4"
    >
      {/* Steps */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4">
        <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-anthracite/50">
          {t({ fr: 'Instructions', ht: 'Enstriksyon' })}
        </p>
        <ol className="space-y-2.5">
          {[
            t({ fr: `Ouvrez votre application ${method.name}`, ht: `Louvri aplikasyon ${method.name} ou` }),
            t({ fr: `Envoyez exactement G ${plan.priceG.toLocaleString('fr-FR')} au numéro ci-dessous`, ht: `Voye egzakteman G ${plan.priceG.toLocaleString('fr-FR')} nan nimewo ki anba a` }),
            t({ fr: 'Ajoutez la référence dans le champ "message" ou "note"', ht: 'Ajoute referans nan jaden "message" oswa "note"' }),
            t({ fr: 'Revenez ici et cliquez sur "J\'ai effectué le paiement"', ht: 'Retounen isit epi klike sou "Mwen fè peman an"' }),
          ].map((step, i) => (
            <li key={i} className="flex gap-3 text-sm text-anthracite/70">
              <span className="inline-flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-white">
                {i + 1}
              </span>
              <span>{step}</span>
            </li>
          ))}
        </ol>
      </div>

      {/* Payment number */}
      <div className={cn('rounded-2xl p-4', method.numberBg)}>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-anthracite/50">
          {t({ fr: 'Numéro', ht: 'Nimewo' })} {method.name}
        </p>
        <div className="flex items-center justify-between gap-3">
          <p className="font-mono text-2xl font-bold tracking-wider text-anthracite">
            {method.displayNumber}
          </p>
          <motion.button
            whileTap={{ scale: 0.95 }}
            onClick={() => copy(method.rawNumber, setCopiedNumber)}
            className={cn(
              'flex flex-shrink-0 items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold transition',
              copiedNumber
                ? 'bg-success text-white'
                : 'border border-slate-200 bg-white text-anthracite hover:bg-slate-50'
            )}
          >
            {copiedNumber ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            {copiedNumber ? t({ fr: 'Copié !', ht: 'Kopiye !' }) : t({ fr: 'Copier', ht: 'Kopiye' })}
          </motion.button>
        </div>
      </div>

      {/* Amount */}
      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
        <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-anthracite/50">
          {t({ fr: 'Montant exact à envoyer', ht: 'Montan egzak pou voye' })}
        </p>
        <p className="text-2xl font-bold text-primary">
          G {plan.priceG.toLocaleString('fr-FR')}
        </p>
      </div>

      {/* Reference */}
      <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-4">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-anthracite/50">
          {t({ fr: 'Référence (obligatoire dans le message)', ht: 'Referans (obligatwa nan mesaj la)' })}
        </p>
        <div className="flex items-center justify-between gap-3">
          <code className="font-mono text-sm font-bold text-anthracite">{reference}</code>
          <button
            onClick={() => copy(reference, setCopiedRef)}
            className="text-xs font-semibold text-primary underline-offset-2 hover:underline"
          >
            {copiedRef ? t({ fr: 'Copié !', ht: 'Kopiye !' }) : t({ fr: 'Copier', ht: 'Kopiye' })}
          </button>
        </div>
      </div>

      {/* Confirm */}
      <motion.button
        whileHover={{ scale: 1.01 }}
        whileTap={{ scale: 0.98 }}
        onClick={onConfirm}
        disabled={isLoading}
        className="flex w-full items-center justify-center gap-2 rounded-3xl bg-primary px-6 py-4 text-sm font-semibold text-white transition hover:bg-[#004799] disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isLoading ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            {t({ fr: 'Enregistrement...', ht: 'Anrejistreman...' })}
          </>
        ) : (
          <>
            <Check className="h-4 w-4" />
            {t({ fr: 'J\'ai effectué le paiement', ht: 'Mwen fè peman an' })}
          </>
        )}
      </motion.button>

      <p className="text-center text-xs text-anthracite/40">
        {t({ fr: 'Votre abonnement sera activé après vérification par notre équipe (délai max 24h).', ht: 'Abònman ou pral aktive apre verifikasyon ekip nou an (delai max 24h).' })}
      </p>
    </motion.div>
  );
}

// ─── Visa Flow ────────────────────────────────────────────────────────────────

function VisaFlow() {
  const { t } = useLanguage();
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-4"
    >
      <div className="rounded-2xl border border-blue-100 bg-gradient-to-br from-blue-50 to-indigo-50 p-5 text-center">
        <CreditCard className="mx-auto h-10 w-10 text-blue-500" />
        <h3 className="mt-3 font-semibold text-anthracite">{t({ fr: 'Paiement par carte', ht: 'Peman pa kat' })}</h3>
        <p className="mt-2 text-sm text-anthracite/60">
          {t({ fr: 'Le paiement par carte Visa / Mastercard sera disponible très prochainement. Utilisez MonCash ou NatCash pour activer votre plan immédiatement.', ht: 'Peman pa kat Visa / Mastercard pral disponib byento. Itilize MonCash oswa NatCash pou aktive plan ou imedyatman.' })}
        </p>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-4">
        <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-anthracite/40">
          {t({ fr: 'Cartes acceptées (bientôt)', ht: 'Kat aksepte (byento)' })}
        </p>
        <div className="flex gap-2">
          {['Visa', 'Mastercard', 'Amex'].map((card) => (
            <div
              key={card}
              className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-anthracite/60"
            >
              {card}
            </div>
          ))}
        </div>
      </div>

      {/* Prepared UI — non-interactive */}
      <div className="pointer-events-none space-y-3 opacity-40">
        <div>
            <label className="text-xs font-semibold text-anthracite/70">{t({ fr: 'Numéro de carte', ht: 'Nimewo kat' })}</label>
          <div className="mt-1 flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3">
            <CreditCard className="h-4 w-4 text-anthracite/30" />
            <span className="text-sm text-anthracite/30 tracking-widest">•••• •••• •••• ••••</span>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-semibold text-anthracite/70">{t({ fr: 'Expiration', ht: 'Ekspirasyon' })}</label>
            <div className="mt-1 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-anthracite/30">
              MM / AA
            </div>
          </div>
          <div>
            <label className="text-xs font-semibold text-anthracite/70">CVV</label>
            <div className="mt-1 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-anthracite/30">
              •••
            </div>
          </div>
        </div>
      </div>

      <button
        disabled
        className="w-full cursor-not-allowed rounded-3xl bg-slate-200 px-6 py-4 text-sm font-semibold text-slate-400"
      >
        {t({ fr: 'Bientôt disponible', ht: 'Byento disponib' })}
      </button>
    </motion.div>
  );
}

// ─── Success View ─────────────────────────────────────────────────────────────

function SuccessView({ reference, planKey }: { reference: string; planKey: string }) {
  const { t } = useLanguage();
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      className="mx-auto max-w-md py-12 text-center"
    >
      <motion.div
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ type: 'spring', bounce: 0.45, delay: 0.1 }}
        className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-success/10"
      >
        <CheckCircle2 className="h-10 w-10 text-success" />
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.25 }}
      >
        <h2 className="mt-6 text-2xl font-bold text-anthracite">{t({ fr: 'Demande soumise !', ht: 'Demann voye !' })}</h2>
        <p className="mt-3 text-sm text-anthracite/70">
          Votre paiement est en cours de vérification. Le plan{' '}
          <strong className="text-anthracite">{planKey}</strong> sera activé dans les 24 heures.
        </p>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.35 }}
        className="mt-6 rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-5"
      >
        <p className="text-xs text-anthracite/50">{t({ fr: 'Référence de paiement', ht: 'Referans peman' })}</p>
        <p className="mt-1 font-mono text-lg font-bold text-anthracite">{reference}</p>
        <p className="mt-2 text-xs text-anthracite/40">{t({ fr: 'Conservez cette référence pour le suivi.', ht: 'Konsève referans sa a pou swivi.' })}</p>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.45 }}
        className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center"
      >
        <Link
          href="/dashboard"
          className="rounded-3xl bg-primary px-6 py-3 text-sm font-semibold text-white transition hover:bg-[#004799]"
        >
          {t({ fr: 'Aller au Dashboard', ht: 'Ale nan Dashboard' })}
        </Link>
        <Link
          href="/settings"
          className="rounded-3xl border border-slate-200 bg-white px-6 py-3 text-sm font-semibold text-anthracite transition hover:bg-slate-50"
        >
          {t({ fr: 'Mon profil', ht: 'Pwofil mwen' })}
        </Link>
      </motion.div>
    </motion.div>
  );
}

// ─── Main Checkout Content ────────────────────────────────────────────────────

function CheckoutContent() {
  const { t } = useLanguage();
  const [planKey, setPlanKey] = useState('');
  const [step, setStep] = useState<Step>('method');
  const [selectedMethod, setSelectedMethod] = useState<MethodId | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [reference, setReference] = useState('');
  const [currency, setCurrency] = useState<'HTG' | 'USD'>('HTG');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setPlanKey(params.get('plan') ?? '');
    const ts = Date.now().toString(36).toUpperCase().slice(-5);
    const rand = Math.random().toString(36).toUpperCase().slice(2, 5);
    setReference(`PP-${ts}-${rand}`);
  }, []);

  const plan = getPlanByKey(planKey);

  // planKey is empty until useEffect hydrates it from window.location.search
  if (!planKey) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm text-anthracite/60">{t({ fr: 'Chargement...', ht: 'Chajman...' })}</p>
        </div>
      </div>
    );
  }

  if (!plan) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-5 px-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          <p className="text-lg font-semibold text-anthracite">{t({ fr: 'Plan introuvable', ht: 'Plan pa jwenn' })}</p>
          <p className="mt-2 text-sm text-anthracite/60">
            {t({ fr: 'Le plan sélectionné n\'existe pas. Choisissez-en un valide.', ht: 'Plan chwazi a pa egziste. Chwazi yon plan valid.' })}
          </p>
          <Link
            href="/pricing"
            className="mt-5 inline-flex items-center gap-2 rounded-3xl bg-primary px-6 py-3 text-sm font-semibold text-white transition hover:bg-[#004799]"
          >
            {t({ fr: 'Voir les tarifs', ht: 'Wè pri yo' })}
          </Link>
        </div>
      </div>
    );
  }

  const selectedMethodData = PAYMENT_METHODS.find((m) => m.id === selectedMethod);

  const handleContinue = () => {
    if (!selectedMethod) {
      toast.error(t({ fr: 'Veuillez sélectionner une méthode de paiement', ht: 'Tanpri chwazi yon metòd peman' }));
      return;
    }
    setStep('payment');
  };

  const handleConfirmPayment = async () => {
    if (!selectedMethod || selectedMethod === 'visa') return;

    setIsLoading(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      await createPendingPayment({
        planKey:   plan.key,
        method:    selectedMethod,
        userId:    user?.id ?? 'anonymous',
        userEmail: user?.email ?? undefined,
        userName:  user?.user_metadata?.full_name ?? user?.user_metadata?.name ?? undefined,
        amountHtg: plan.priceG,
        reference,
      });

      markSubscriptionActive();
      setStep('success');
      toast.success(t({ fr: 'Paiement enregistré — vérification en cours !', ht: 'Peman anrejistre — verifikasyon an kou !' }));
    } catch {
      toast.error(t({ fr: 'Erreur lors de l\'enregistrement. Contactez le support.', ht: 'Erè pandan anrejistreman. Kontakte sipò.' }));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      {/* Header */}
      <div className="mb-8 flex items-center gap-4">
        <Link
          href="/pricing"
          className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-anthracite/70 transition hover:bg-slate-50"
        >
          <ArrowLeft className="h-4 w-4" />
          {t({ fr: 'Retour', ht: 'Retounen' })}
        </Link>
        <div>
          <h1 className="text-xl font-semibold text-anthracite">{t({ fr: 'Finaliser votre abonnement', ht: 'Finalize abònman ou' })}</h1>
          <p className="text-xs text-anthracite/50">{t({ fr: 'Paiement sécurisé · ProfitPilot', ht: 'Peman an sekirite · ProfitPilot' })}</p>
        </div>
      </div>

      {step === 'success' ? (
        <SuccessView reference={reference} planKey={plan.key} />
      ) : (
        <div className="grid gap-6 lg:grid-cols-[1fr_1.25fr]">
          {/* Left — Plan summary */}
          <div className="lg:sticky lg:top-8 lg:h-fit">
            <div className="mb-3 flex justify-end">
              <div className="inline-flex overflow-hidden rounded-full border border-slate-200">
                {(['HTG', 'USD'] as const).map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setCurrency(c)}
                    className={cn(
                      'px-4 py-1.5 text-xs font-semibold transition',
                      currency === c
                        ? 'bg-primary text-white'
                        : 'bg-white text-anthracite hover:bg-slate-50'
                    )}
                  >
                    {c}
                  </button>
                ))}
              </div>
            </div>
            <PlanSummary plan={plan} currency={currency} />
          </div>

          {/* Right — Payment flow */}
          <div>
            <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
              <AnimatePresence mode="wait">
                {/* Step 1 — Select method */}
                {step === 'method' && (
                  <motion.div
                    key="method"
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -12 }}
                    className="space-y-5"
                  >
                    <div>
                      <h2 className="text-lg font-semibold text-anthracite">
                        {t({ fr: 'Méthode de paiement', ht: 'Metòd peman' })}
                      </h2>
                      <p className="mt-1 text-sm text-anthracite/60">
                        {t({ fr: 'Choisissez comment vous souhaitez régler votre abonnement', ht: 'Chwazi kijan ou vle regle abònman ou' })}
                      </p>
                    </div>

                    <div className="space-y-3">
                      {PAYMENT_METHODS.map((method) => {
                        const isSelected = selectedMethod === method.id;
                        return (
                          <motion.button
                            key={method.id}
                            whileHover={{ scale: 1.01 }}
                            whileTap={{ scale: 0.99 }}
                            type="button"
                            onClick={() => setSelectedMethod(method.id)}
                            className={cn(
                              'w-full rounded-2xl border-2 p-4 text-left transition',
                              isSelected
                                ? `${method.selectedBorder} ${method.selectedBg}`
                                : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
                            )}
                          >
                            <div className="flex items-center gap-4">
                              {/* Icon */}
                              <div
                                className={cn(
                                  'flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl bg-gradient-to-br text-white',
                                  method.gradient
                                )}
                              >
                                {method.id === 'visa' ? (
                                  <CreditCard className="h-5 w-5" />
                                ) : method.id === 'moncash' ? (
                                  <Smartphone className="h-5 w-5" />
                                ) : (
                                  <Smartphone className="h-5 w-5" />
                                )}
                              </div>

                              <div className="flex-1 min-w-0">
                                <p className="font-semibold text-anthracite">{method.id === 'moncash' ? t({ fr: 'MonCash', ht: 'MonCash' }) : method.id === 'natcash' ? t({ fr: 'NatCash', ht: 'NatCash' }) : t({ fr: 'Carte Visa', ht: 'Kat Visa' })}</p>
                                <p className="text-sm text-anthracite/60">{method.id === 'moncash' ? t({ fr: 'Paiement mobile Digicel', ht: 'Peman mobil Digicel' }) : method.id === 'natcash' ? t({ fr: 'Paiement mobile Natcom', ht: 'Peman mobil Natcom' }) : t({ fr: 'Carte de crédit ou débit', ht: 'Kat kredi oswa debi' })}</p>
                              </div>

                              {/* Radio */}
                              <div
                                className={cn(
                                  'flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full border-2 transition',
                                  isSelected
                                    ? 'border-primary bg-primary'
                                    : 'border-slate-300 bg-white'
                                )}
                              >
                                {isSelected && (
                                  <div className="h-2 w-2 rounded-full bg-white" />
                                )}
                              </div>
                            </div>

                            {/* Number preview on selection */}
                            {method.displayNumber && isSelected && (
                              <motion.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: 'auto', opacity: 1 }}
                                className="mt-3 overflow-hidden rounded-xl bg-white/70 px-3 py-2"
                              >
                                <p className="text-xs text-anthracite/50">{t({ fr: 'Numéro', ht: 'Nimewo' })}</p>
                                <p className={cn('font-mono font-semibold', method.textAccent)}>
                                  {method.displayNumber}
                                </p>
                              </motion.div>
                            )}
                          </motion.button>
                        );
                      })}
                    </div>

                    <motion.button
                      whileHover={{ scale: 1.01 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={handleContinue}
                      disabled={!selectedMethod}
                      className="w-full rounded-3xl bg-primary px-6 py-4 text-sm font-semibold text-white transition hover:bg-[#004799] disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {t({ fr: 'Continuer →', ht: 'Kontinye →' })}
                    </motion.button>

                    <div className="flex items-center justify-center gap-2 text-xs text-anthracite/40">
                      <Lock className="h-3 w-3" />
                      <span>{t({ fr: 'Paiement 100 % sécurisé', ht: 'Peman 100 % an sekirite' })}</span>
                    </div>
                  </motion.div>
                )}

                {/* Step 2 — Payment details */}
                {step === 'payment' && selectedMethodData && (
                  <motion.div
                    key="payment"
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -12 }}
                    className="space-y-5"
                  >
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={() => setStep('method')}
                        className="inline-flex items-center gap-1.5 text-sm text-anthracite/60 transition hover:text-anthracite"
                      >
                        <ArrowLeft className="h-4 w-4" />
                        {t({ fr: 'Changer', ht: 'Chanje' })}
                      </button>
                      <div>
                        <h2 className="text-lg font-semibold text-anthracite">
                          {t({ fr: 'Payer avec', ht: 'Peye ak' })} {selectedMethodData.id === 'moncash' ? t({ fr: 'MonCash', ht: 'MonCash' }) : selectedMethodData.id === 'natcash' ? t({ fr: 'NatCash', ht: 'NatCash' }) : t({ fr: 'Carte Visa', ht: 'Kat Visa' })}
                        </h2>
                      </div>
                    </div>

                    {selectedMethod === 'visa' ? (
                      <VisaFlow />
                    ) : (
                      <MobilePaymentFlow
                        method={selectedMethodData as MobileMethod}
                        plan={plan}
                        reference={reference}
                        onConfirm={handleConfirmPayment}
                        isLoading={isLoading}
                      />
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Page Export ──────────────────────────────────────────────────────────────

export default function CheckoutPage() {
  return (
    <CheckoutContent />
  );
}
