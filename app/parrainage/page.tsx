'use client';

// ─────────────────────────────────────────────────────────────────────────────
// Le parrainage — « amenez un marchand, et montez d'un étage »
//
// ── L'écran tient en une seule chose : le code ──────────────────────────────
//
// Tout le reste — l'échelle, les compteurs, les bons — n'existe que pour
// expliquer ce code. Il est donc en gros, en chasse fixe, au premier tiers de
// l'écran, avec les deux gestes qui comptent juste en dessous : l'envoyer sur
// WhatsApp, ou le copier. Le marchand haïtien partage sur WhatsApp ; le bouton
// vert est là, et il est le seul accent de l'écran (§4.1).
//
// ── Pourquoi une ÉCHELLE et pas une prime ──────────────────────────────────
//
// Parce que les trois barreaux ne coûtent pas la même chose et ne se méritent
// pas de la même façon. L'inscription d'un ami ouvre un supplément de quota ;
// son activité ouvre sept jours d'une fonction de l'étage au-dessus ; son
// premier paiement, seul, donne de l'argent. Montrer les trois d'un coup, avec
// le compteur de chacun, dit au marchand où il en est et ce qui lui manque —
// ce qu'une prime unique ne dit jamais.
//
// ── Ce qui n'est jamais promis ─────────────────────────────────────────────
//
// L'écran n'annonce une récompense que quand la base l'a réellement accordée :
// les compteurs viennent de `referrals`, les bonus de `quota_grants`, les
// réductions de `upgrade_credits`, l'échéance de `feature_grants`. Aucun
// chiffre n'est calculé ici à partir du nombre de filleuls. « Dans un logiciel
// de gestion, un chiffre affiché est une promesse » — une réduction en est une
// plus grosse encore.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useState } from 'react';
import {
  BellRing,
  Copy,
  Gift,
  MessageCircle,
  Package,
  Percent,
  Sparkles,
  UserPlus,
  Users,
  Wallet,
} from 'lucide-react';
import { toast } from 'sonner';

import { ProtectedRoute } from '../../components/ProtectedRoute';
import { useLanguage } from '../../components/LanguageWrapper';
import { Card, ScreenHeader, Stack } from '../../components/ds';
import { getReferralSummary } from '../actions/referrals';
// Les constantes viennent de `lib/referral.ts` : un fichier `'use server'` ne
// peut exporter que des fonctions asynchrones.
import {
  ACTIVATION_DAYS,
  ACTIVATION_MIN_SALES,
  ACTIVATION_UNLOCK_DAYS,
  PRODUCT_SLOTS_CAP,
  REFERRAL_REWARD_DAYS,
  SIGNUP_AI_QUESTIONS,
  SIGNUP_PRODUCT_SLOTS,
  UPGRADE_REWARD,
  WELCOME_DISCOUNT_PCT,
  maxUpgradePercent,
  type ReferralSummary,
} from '../../lib/referral';
import { FALLBACK_PLAN_KEY, getPlanLabel } from '../../lib/plans';
import type { Feature } from '../../lib/planFeatures';

/** Le nom des capacités qui s'ouvrent au barreau 2, dans les deux langues. */
const FEATURE_NAMES: Partial<Record<Feature, { fr: string; ht: string }>> = {
  receivable_reminders: { fr: 'La relance WhatsApp',        ht: 'Rapèl WhatsApp la' },
  advanced_analytics:   { fr: 'L’écran Analytique',          ht: 'Ekran Analitik la' },
};

function ParrainageInner() {
  const { t, language } = useLanguage();

  const [summary, setSummary] = useState<ReferralSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [origin,  setOrigin]  = useState('');

  useEffect(() => {
    setOrigin(window.location.origin);
    getReferralSummary()
      .then(setSummary)
      .catch(() => setSummary(null))
      .finally(() => setLoading(false));
  }, []);

  const link = summary?.code ? `${origin}/auth/register?ref=${summary.code}` : '';

  // Le message met en avant ce que gagne le FILLEUL, pas le parrain. Un
  // marchand ne relaie pas un lien qui dit « aide-moi à gagner une réduction » ;
  // il relaie un lien qui fait plaisir à celui qui le reçoit.
  const message = t({
    fr: `Je tiens mon commerce avec ProfitPilot. Inscris-toi avec mon code ${summary?.code ?? ''} et ton premier mois est à −${WELCOME_DISCOUNT_PCT} % : ${link}`,
    ht: `M ap jere komès mwen ak ProfitPilot. Enskri ak kòd mwen ${summary?.code ?? ''}, premye mwa w ap −${WELCOME_DISCOUNT_PCT} % : ${link}`,
  });

  const copy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(link);
      toast.success(t({ fr: 'Lien copié.', ht: 'Lyen kopye.' }));
    } catch {
      toast.error(t({ fr: 'Copie impossible sur cet appareil.', ht: 'Nou pa ka kopye sou aparèy sa a.' }));
    }
  }, [link, t]);

  const planKey = summary?.planKey ?? FALLBACK_PLAN_KEY;
  const reward  = UPGRADE_REWARD[planKey];
  // Elit n'a pas d'étage au-dessus : sa réduction porte sur son renouvellement.
  const atTop   = reward.target === planKey;

  const unlockName = summary?.unlockFeature ? FEATURE_NAMES[summary.unlockFeature] : undefined;

  return (
    <div className="pp-enter mx-auto w-full max-w-2xl px-4 py-6 sm:px-6">
      <ScreenHeader
        title={t({ fr: 'Parrainage', ht: 'Parennaj' })}
        subtitle={t({
          fr: `Un marchand inscrit avec votre code démarre à −${WELCOME_DISCOUNT_PCT} %. Vous, vous montez d’un étage.`,
          ht: `Yon machann ki enskri ak kòd ou kòmanse ak −${WELCOME_DISCOUNT_PCT} %. Ou menm, ou monte yon etaj.`,
        })}
      />

      <Stack className="mt-6">
        {loading ? (
          <Card className="p-6">
            <span className="pp-skeleton block h-16 rounded-control" aria-hidden />
          </Card>
        ) : !summary?.available || !summary.code ? (
          // La migration n'a pas été jouée : le dire franchement plutôt que
          // d'afficher un code qui ne mènerait nulle part.
          <Card className="p-6 text-center">
            <p className="text-body text-text2 dark:text-dark-text2">
              {t({
                fr: 'Le parrainage n’est pas encore actif sur ce compte. Réessayez dans un moment.',
                ht: 'Parennaj la poko aktif sou kont sa a. Reeseye nan yon ti moman.',
              })}
            </p>
          </Card>
        ) : (
          <>
            {/* ── Le code ─────────────────────────────────────────────────── */}
            <Card className="p-6 text-center">
              <p className="text-note font-bold uppercase tracking-wide text-muted dark:text-dark-muted">
                {t({ fr: 'Votre code', ht: 'Kòd ou' })}
              </p>

              {/* Chasse fixe et grande taille : ce code se dicte au téléphone
                  et se recopie à la main. */}
              <p className="amount mt-2 text-amount-lg font-bold tracking-[0.35em] text-primary dark:text-dark-text">
                {summary.code}
              </p>

              <div className="mt-6 flex flex-col gap-2 sm:flex-row">
                <a
                  href={`https://wa.me/?text=${encodeURIComponent(message)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="pressable flex min-h-13 flex-1 items-center justify-center gap-2 rounded-surface bg-accent text-body font-bold text-accent-ink shadow-card hover:bg-accent-h"
                >
                  <MessageCircle className="h-5 w-5" strokeWidth={2} aria-hidden />
                  {t({ fr: 'Envoyer sur WhatsApp', ht: 'Voye sou WhatsApp' })}
                </a>

                <button
                  type="button"
                  onClick={copy}
                  className="pressable flex min-h-13 items-center justify-center gap-2 rounded-surface border border-border px-5 text-body font-bold text-primary hover:bg-surface dark:border-dark-border dark:text-dark-text dark:hover:bg-white/5"
                >
                  <Copy className="h-5 w-5" strokeWidth={1.8} aria-hidden />
                  {t({ fr: 'Copier le lien', ht: 'Kopye lyen an' })}
                </button>
              </div>
            </Card>

            {/* ── L'échelle ───────────────────────────────────────────────── */}
            <Card className="px-4">
              <h2 className="border-b border-border py-4 text-card font-bold text-primary dark:border-dark-border dark:text-dark-text">
                {t({ fr: 'Vos trois récompenses', ht: 'Twa rekonpans ou yo' })}
              </h2>

              <ol className="divide-y divide-border dark:divide-dark-border">
                <Rung
                  icon={<UserPlus className="h-5 w-5" strokeWidth={1.8} aria-hidden />}
                  count={summary.ladder.signedUp}
                  label={t({ fr: 'inscrits', ht: 'enskri' })}
                  title={t({ fr: 'Il crée son compte', ht: 'Li kreye kont li' })}
                  reward={t({
                    fr: `+${SIGNUP_AI_QUESTIONS} questions à votre assistant et +${SIGNUP_PRODUCT_SLOTS} fiches produits, jusqu’à +${PRODUCT_SLOTS_CAP}.`,
                    ht: `+${SIGNUP_AI_QUESTIONS} kesyon pou asistan ou ak +${SIGNUP_PRODUCT_SLOTS} fich pwodwi, jiska +${PRODUCT_SLOTS_CAP}.`,
                  })}
                />

                <Rung
                  icon={<BellRing className="h-5 w-5" strokeWidth={1.8} aria-hidden />}
                  count={summary.ladder.active}
                  label={t({ fr: 'actifs', ht: 'aktif' })}
                  title={t({
                    fr: `Il vend vraiment (${ACTIVATION_MIN_SALES} ventes en ${ACTIVATION_DAYS} jours)`,
                    ht: `Li vann toutbon (${ACTIVATION_MIN_SALES} vant nan ${ACTIVATION_DAYS} jou)`,
                  })}
                  reward={
                    unlockName
                      ? t({
                          fr: `${unlockName.fr} vous est ouverte ${ACTIVATION_UNLOCK_DAYS} jours.`,
                          ht: `${unlockName.ht} louvri pou ou pandan ${ACTIVATION_UNLOCK_DAYS} jou.`,
                        })
                      : t({
                          fr: 'Votre offre contient déjà tout ce que ce palier ouvrirait.',
                          ht: 'Òf ou a gen tou sa palye sa a ta louvri deja.',
                        })
                  }
                />

                <Rung
                  icon={<Percent className="h-5 w-5" strokeWidth={1.8} aria-hidden />}
                  count={summary.ladder.paying}
                  label={t({ fr: 'payants', ht: 'k ap peye' })}
                  title={t({ fr: 'Il paie son premier mois', ht: 'Li peye premye mwa li' })}
                  reward={t({
                    fr: atTop
                      ? `−${reward.percent} % sur votre renouvellement ${getPlanLabel(reward.target)} pendant ${reward.months} mois, cumulable jusqu’à −${maxUpgradePercent(planKey)} %.`
                      : `−${reward.percent} % sur ${getPlanLabel(reward.target)} pendant ${reward.months} mois, cumulable jusqu’à −${maxUpgradePercent(planKey)} %. Et les Rapports ${REFERRAL_REWARD_DAYS} jours de plus.`,
                    ht: atTop
                      ? `−${reward.percent} % sou renouvèlman ${getPlanLabel(reward.target)} ou pandan ${reward.months} mwa, jiska −${maxUpgradePercent(planKey)} %.`
                      : `−${reward.percent} % sou ${getPlanLabel(reward.target)} pandan ${reward.months} mwa, jiska −${maxUpgradePercent(planKey)} %. Epi Rapò yo ${REFERRAL_REWARD_DAYS} jou anplis.`,
                  })}
                />
              </ol>
            </Card>

            {/* ── Ce qui est déjà à vous ──────────────────────────────────── */}
            <Gains summary={summary} language={language} />

            <p className="text-note text-muted dark:text-dark-muted">
              {t({
                fr: `Votre offre ne change pas : les réductions portent sur ${atTop ? 'votre renouvellement' : `l’offre ${getPlanLabel(reward.target)}`}, elles durent ${reward.months} mois puis s’arrêtent. Vous ne serez jamais facturé pour un mois offert, et une récompense ne descend jamais un prix sous 40 % du tarif.`,
                ht: `Òf ou pa chanje : rediksyon yo se sou ${atTop ? 'renouvèlman ou' : `òf ${getPlanLabel(reward.target)} la`}, yo dire ${reward.months} mwa apre sa yo sispann. Nou p ap janm faktire w pou yon mwa ofri.`,
              })}
            </p>
          </>
        )}
      </Stack>
    </div>
  );
}

/**
 * Un barreau de l'échelle : combien de filleuls l'ont franchi, et ce qu'il
 * donne. Le compteur est à gauche parce que c'est la première question du
 * marchand — « j'en suis où ? » — et la récompense en dessous, parce que c'est
 * la deuxième.
 */
function Rung({
  icon,
  count,
  label,
  title,
  reward,
}: {
  icon: React.ReactNode;
  count: number;
  label: string;
  title: string;
  reward: string;
}) {
  return (
    <li className="flex items-start gap-3 py-4">
      <span className="mt-0.5 flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-surface bg-surface2 text-muted dark:bg-dark-surface2 dark:text-dark-muted">
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline gap-2">
          <span className="amount text-card font-bold text-primary dark:text-dark-text">{count}</span>
          <span className="text-note text-muted dark:text-dark-muted">{label}</span>
        </span>
        <span className="mt-0.5 block text-body font-bold text-primary dark:text-dark-text">{title}</span>
        <span className="mt-0.5 block text-note text-text2 dark:text-dark-text2">{reward}</span>
      </span>
    </li>
  );
}

/**
 * Ce que le marchand possède RÉELLEMENT à cet instant.
 *
 * Rien n'est affiché tant que rien n'a été accordé : une carte « 0 question
 * gagnée » n'informe pas, elle rappelle simplement qu'on n'a rien. L'état vide
 * dit ce qu'il faut faire pour que la carte existe.
 */
function Gains({ summary, language }: { summary: ReferralSummary; language: 'fr' | 'ht' }) {
  const { t } = useLanguage();

  const rows: Array<{ icon: React.ReactNode; value: string; note: string }> = [];

  if (summary.bonusAiQuestions > 0) {
    rows.push({
      icon: <Sparkles className="h-5 w-5" strokeWidth={1.8} aria-hidden />,
      value: `+${summary.bonusAiQuestions}`,
      note: t({ fr: 'questions à votre assistant, chaque mois', ht: 'kesyon pou asistan ou, chak mwa' }),
    });
  }

  if (summary.bonusProductSlots > 0) {
    rows.push({
      icon: <Package className="h-5 w-5" strokeWidth={1.8} aria-hidden />,
      value: `+${summary.bonusProductSlots}`,
      note: t({ fr: 'fiches produits au-delà de votre offre', ht: 'fich pwodwi anplis òf ou' }),
    });
  }

  if (summary.unlockUntil) {
    rows.push({
      icon: <BellRing className="h-5 w-5" strokeWidth={1.8} aria-hidden />,
      value: formatDate(summary.unlockUntil, language),
      note: t({ fr: 'fonction ouverte jusqu’à cette date', ht: 'fonksyon louvri jiska dat sa a' }),
    });
  }

  if (summary.rewardUntil) {
    rows.push({
      icon: <Gift className="h-5 w-5" strokeWidth={1.8} aria-hidden />,
      value: formatDate(summary.rewardUntil, language),
      note: t({ fr: 'Rapports offerts jusqu’à cette date', ht: 'Rapò ofri jiska dat sa a' }),
    });
  }

  for (const credit of summary.credits) {
    rows.push({
      icon: <Wallet className="h-5 w-5" strokeWidth={1.8} aria-hidden />,
      value: `−${credit.percentOff} %`,
      note: credit.targetPlanKey
        ? t({
            fr: `sur ${getPlanLabel(credit.targetPlanKey)}, ${credit.monthsLeft} mois restant${credit.monthsLeft > 1 ? 's' : ''}`,
            ht: `sou ${getPlanLabel(credit.targetPlanKey)}, ${credit.monthsLeft} mwa ki rete`,
          })
        : t({
            fr: 'sur votre premier mois, quelle que soit l’offre',
            ht: 'sou premye mwa ou, nenpòt òf',
          }),
    });
  }

  if (rows.length === 0) {
    return (
      <Card className="flex items-center gap-3 p-4">
        <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-surface bg-surface2 text-muted dark:bg-dark-surface2 dark:text-dark-muted">
          <Users className="h-5 w-5" strokeWidth={1.8} aria-hidden />
        </span>
        <span className="min-w-0 text-body text-text2 dark:text-dark-text2">
          {t({
            fr: 'Rien à afficher pour l’instant. Envoyez votre lien à un commerçant que vous connaissez : la première récompense arrive dès qu’il ouvre son compte.',
            ht: 'Poko gen anyen pou montre. Voye lyen ou bay yon machann ou konnen : premye rekonpans lan rive depi li louvri kont li.',
          })}
        </span>
      </Card>
    );
  }

  return (
    <Card className="px-4">
      <h2 className="border-b border-border py-4 text-card font-bold text-primary dark:border-dark-border dark:text-dark-text">
        {t({ fr: 'Ce que vous avez gagné', ht: 'Sa ou genyen deja' })}
      </h2>
      <ul className="divide-y divide-border dark:divide-dark-border">
        {rows.map((row, i) => (
          <li key={i} className="flex items-center gap-3 py-3">
            <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-surface bg-accent-sub text-primary dark:bg-accent/15 dark:text-accent">
              {row.icon}
            </span>
            <span className="min-w-0">
              <span className="amount block text-card font-bold text-primary dark:text-dark-text">{row.value}</span>
              <span className="block text-note text-muted dark:text-dark-muted">{row.note}</span>
            </span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function formatDate(iso: string, language: 'fr' | 'ht'): string {
  return new Date(iso).toLocaleDateString(language === 'ht' ? 'fr-HT' : 'fr-FR', {
    day: '2-digit',
    month: 'long',
  });
}

export default function ParrainagePage() {
  return (
    <ProtectedRoute>
      <ParrainageInner />
    </ProtectedRoute>
  );
}
