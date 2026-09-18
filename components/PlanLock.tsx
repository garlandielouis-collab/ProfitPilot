'use client';

// ─────────────────────────────────────────────────────────────────────────────
// Le verrou d'offre — ce que le marchand voit quand l'écran n'est pas le sien
//
// Le registre des offres (`planFeatures.ts`) était complet et juste ; il ne
// tenait rien, parce que presque aucun écran ne l'interrogeait. Trois pages
// avaient chacune recopié leur propre carte « Passer Expert », avec trois
// couleurs, trois formulations et un nom d'offre écrit en dur — celui-là même
// qui devient faux dès qu'une offre change de nom. Ici, il n'y a qu'un écran de
// verrou, et il lit l'offre requise dans le registre.
//
// ── Pourquoi un écran, et pas une entrée de menu qui disparaît ──────────────
//
// Une fonctionnalité cachée ne se vend pas : on n'achète pas ce qu'on ignore.
// Le marchand voit donc la destination, la trouve verrouillée, et lit en une
// phrase ce qu'elle lui apporterait et ce qu'elle coûte. C'est le seul endroit
// du produit où l'on a le droit de parler d'argent — et on le fait avec le
// prix réel de l'offre, pas avec « Premium ✨ ».
//
// ── Ce que ce fichier ne fait PAS ──────────────────────────────────────────
//
// Il ne protège rien. Masquer un écran est cosmétique : la garde qui compte est
// `assertFeature()` dans les server actions. Un verrou d'interface sans garde
// serveur est une porte peinte sur un mur.
// ─────────────────────────────────────────────────────────────────────────────

import Link from 'next/link';
import { useEffect, useState, type ReactNode } from 'react';
import { Lock } from 'lucide-react';

import { useLanguage } from './LanguageWrapper';
import { usePermissions } from '../hooks/usePermissions';
import { useCompanyContext } from '../contexts/CompanyContext';
import { requiredPlanFor, type Feature } from '../lib/planFeatures';
import { getPlanByKey, getPlanLabel } from '../lib/plans';
import { REFERRAL_REWARD, REFERRAL_REWARD_DAYS } from '../lib/referral';
import { entryForPath, featureForPath } from './nav';
import { Badge, Button, Card } from './ds';

// ─────────────────────────────────────────────────────────────────────────────
// La pastille de menu — « cette destination demande Kwasans »
// ─────────────────────────────────────────────────────────────────────────────

/**
 * La pastille posée dans la barre latérale et dans « Plus » sur les entrées
 * que l'offre ne couvre pas. Elle nomme l'offre requise : « Kwasans » dit ce
 * qu'il faut faire, un cadenas seul ne dit que ce qui est interdit.
 *
 * Rend `null` quand l'offre couvre déjà la fonctionnalité — un badge qui reste
 * après l'achat efface la récompense.
 */
export function PlanTag({ feature }: { feature: Feature | undefined }) {
  const { canUse, loading } = usePermissions();
  if (!feature || loading || canUse(feature)) return null;

  const required = requiredPlanFor(feature);
  if (!required) return null;

  return (
    <Badge tone="neutral" className="flex-shrink-0">
      <Lock className="h-4 w-4" strokeWidth={2.2} aria-hidden />
      {getPlanLabel(required)}
    </Badge>
  );
}

/** `true` si l'offre en cours ne couvre pas la destination. Sert au style. */
export function useIsLocked(feature: Feature | undefined): boolean {
  const { canUse, loading } = usePermissions();
  if (!feature || loading) return false;
  return !canUse(feature);
}

// ─────────────────────────────────────────────────────────────────────────────
// L'écran verrouillé
// ─────────────────────────────────────────────────────────────────────────────

export function PlanLockScreen({
  feature,
  title,
  hint,
}: {
  feature: Feature;
  /** Le nom de la destination, tel qu'il est écrit dans le menu. */
  title?: string;
  /** La ligne du menu : ce qu'on y fait. Elle vend mieux qu'un slogan. */
  hint?: string;
}) {
  const { t } = useLanguage();
  const { planKey } = useCompanyContext();

  const required = requiredPlanFor(feature);
  const plan     = required ? getPlanByKey(required) : undefined;
  const label    = getPlanLabel(required);

  return (
    <div className="pp-enter mx-auto w-full max-w-lg px-4 py-10 sm:px-6">
      <Card className="p-6 text-center sm:p-8">
        {/* Le cadenas est neutre, pas rouge : rien n'est cassé, rien n'a échoué
            — cet écran existe simplement ailleurs que dans cette offre (§4.2). */}
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-pill bg-surface2 text-muted dark:bg-dark-surface2 dark:text-dark-muted">
          <Lock className="h-5 w-5" strokeWidth={1.8} aria-hidden />
        </span>

        <h1 className="mt-4 text-screen font-bold text-primary dark:text-dark-text">
          {title ?? t({ fr: 'Réservé à une autre offre', ht: 'Rezève pou yon lòt òf' })}
        </h1>

        {hint && (
          <p className="mt-1 text-body text-text2 dark:text-dark-text2">{hint}</p>
        )}

        <p className="mt-4 text-body text-text2 dark:text-dark-text2">
          {t({
            fr: `Cet écran fait partie de l'offre ${label}.`,
            ht: `Ekran sa a fè pati òf ${label} la.`,
          })}{' '}
          <span className="text-muted dark:text-dark-muted">
            {t({
              fr: `Votre offre : ${getPlanLabel(planKey)}.`,
              ht: `Òf ou a : ${getPlanLabel(planKey)}.`,
            })}
          </span>
        </p>

        {/* Ce que l'offre apporte, dans ses mots à lui — trois lignes, pas la
            liste entière : la page de prix est là pour ça, et un mur de
            promesses ne se lit pas. */}
        {plan && (
          <ul className="mx-auto mt-5 max-w-sm space-y-2 text-left">
            {plan.features.slice(0, 3).map((f) => (
              <li
                key={f.fr}
                className="flex items-start gap-2 text-body text-text2 dark:text-dark-text2"
              >
                <span className="mt-2 h-1.5 w-1.5 flex-shrink-0 rounded-pill bg-accent" aria-hidden />
                <span>{t(f)}</span>
              </li>
            ))}
          </ul>
        )}

        <Link href="/pricing" className="mt-6 block">
          <Button variant="accent" size="lg" block>
            {t({ fr: `Passer à ${label}`, ht: `Pase nan ${label}` })}
          </Button>
        </Link>

        {/* Le prix est écrit ici, pas seulement sur la page de prix : un bouton
            qui mène à un montant inconnu se clique moins qu'un bouton honnête. */}
        {plan && (
          <p className="mt-3 text-note text-muted dark:text-dark-muted">
            {plan.priceG.toLocaleString('fr-FR')} HTG{' '}
            {t({ fr: 'par mois · sans engagement', ht: 'chak mwa · san angajman' })}
          </p>
        )}

        {/* La deuxième porte. Un marchand qui n'a pas les 2 500 gourdes ce
            mois-ci en connaît souvent un autre qui cherche la même chose : le
            parrainage lui ouvre les Rapports sans qu'il paie. Il n'est proposé
            que sur l'écran qu'il débloque vraiment — ailleurs, ce serait une
            promesse en l'air. */}
        {feature === REFERRAL_REWARD && (
          <Link
            href="/parrainage"
            className="pressable mt-4 inline-flex min-h-touch items-center text-note font-bold text-primary underline underline-offset-4 dark:text-dark-text"
          >
            {t({
              fr: `Ou amenez un marchand : dès qu'il paie son premier mois, c'est offert ${REFERRAL_REWARD_DAYS} jours`,
              ht: `Oswa mennen yon machann : depi li peye premye mwa li, li ofri w ${REFERRAL_REWARD_DAYS} jou`,
            })}
          </Link>
        )}
      </Card>
    </div>
  );
}

/**
 * La version courte, pour une CARTE d'un écran qui reste par ailleurs utilisable
 * — le score de santé du tableau de bord, par exemple. Elle occupe la place
 * exacte du bloc absent : sans elle, l'écran se recompose sous l'œil du
 * marchand d'une offre à l'autre, et il croit à un bogue.
 */
export function PlanTeaser({
  feature,
  title,
  hint,
}: {
  feature: Feature;
  title: string;
  hint: string;
}) {
  const { t }    = useLanguage();
  const required = requiredPlanFor(feature);
  const label    = getPlanLabel(required);

  return (
    <Card className="p-5">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-pill bg-surface2 text-muted dark:bg-dark-surface2 dark:text-dark-muted">
          <Lock className="h-4 w-4" strokeWidth={1.8} aria-hidden />
        </span>

        <div className="min-w-0 flex-1">
          <p className="text-body font-bold text-primary dark:text-dark-text">{title}</p>
          <p className="mt-1 text-note text-text2 dark:text-dark-text2">{hint}</p>

          <Link
            href="/pricing"
            className="pressable mt-3 inline-flex min-h-touch items-center text-note font-bold text-accent underline underline-offset-4"
          >
            {t({ fr: `Disponible avec ${label}`, ht: `Disponib ak ${label}` })}
          </Link>
        </div>
      </div>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Les deux façons de s'en servir
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Un bloc réservé À L'INTÉRIEUR d'un écran (une carte du tableau de bord, un
 * bouton d'export). L'écran reste utilisable ; seule la partie payante cède la
 * place au `fallback` — ou à rien, si l'absence se lit mieux que l'annonce.
 */
export function PlanGate({
  feature,
  children,
  fallback = null,
}: {
  feature: Feature;
  children: ReactNode;
  fallback?: ReactNode;
}) {
  const { canUse, loading } = usePermissions();
  if (loading) return null;
  return <>{canUse(feature) ? children : fallback}</>;
}

/**
 * Le verrou d'ÉCRAN, posé une seule fois dans `AppShell` : toute adresse listée
 * dans `ROUTE_FEATURE` est jugée avant d'être rendue. Une page nouvelle est
 * donc protégée dès qu'on l'inscrit dans la table — personne n'a à se souvenir
 * d'ajouter une garde dans le fichier de l'écran, et c'est bien pour ça que
 * l'ancien dispositif ne tenait que quatre pages sur vingt.
 */
export function RouteFeatureGate({
  pathname,
  children,
}: {
  pathname: string | null;
  children: ReactNode;
}) {
  const { t }               = useLanguage();
  const { canUse, loading } = usePermissions();
  const { refresh }         = useCompanyContext();

  // ── L'attente a une fin ────────────────────────────────────────────────────
  //
  // Passé ce délai, la roue n'est plus une attente : c'est une impasse. Le
  // contexte d'entreprise peut rester en chargement pour de bon — une lecture
  // qui ne revient pas, un onglet réveillé, une base en veille — et cet écran
  // était le seul du produit sans porte de sortie : ni message, ni bouton, ni
  // rien qui relance. Le marchand en concluait que la page n'existe pas.
  //
  // Douze secondes, pas trois : sur une connexion mobile irrégulière, une
  // lecture lente est normale, et crier à la panne trop tôt apprend à ignorer
  // le message. Passé ce délai, l'attente cesse d'être plausible.
  const [tooLong, setTooLong] = useState(false);
  useEffect(() => {
    if (!loading) { setTooLong(false); return; }
    const id = window.setTimeout(() => setTooLong(true), 12000);
    return () => window.clearTimeout(id);
  }, [loading]);

  const feature = featureForPath(pathname);
  if (!feature) return <>{children}</>;

  // L'offre n'est pas encore connue : on ne montre NI l'écran NI le verrou.
  // Afficher la page puis la retirer une demi-seconde plus tard serait pire que
  // d'attendre — et annoncer un verrou qui n'existe pas, pire encore.
  if (loading) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-4 text-center">
        <span
          className="h-8 w-8 animate-spin rounded-pill border-2 border-border border-t-primary"
          aria-label={t({ fr: 'Chargement', ht: 'Ap chaje' })}
        />
        {/* La roue reste : la lecture court toujours, et le dire autrement
            serait mentir. Ce qui s'ajoute, c'est de quoi ne pas rester là. */}
        {tooLong && (
          <>
            <p className="text-body text-text2 dark:text-dark-text2">
              {t({
                fr: 'Votre offre met plus de temps que prévu à se charger. '
                  + "C'est la connexion, pas votre compte.",
                ht: 'Òf ou a ap pran plis tan pase sa nou te panse. '
                  + 'Se koneksyon an, se pa kont ou.',
              })}
            </p>
            <Button variant="accent" onClick={() => { void refresh(); }}>
              {t({ fr: 'Réessayer', ht: 'Eseye ankò' })}
            </Button>
          </>
        )}
      </div>
    );
  }

  if (canUse(feature)) return <>{children}</>;

  const entry = entryForPath(pathname);
  return (
    <PlanLockScreen
      feature={feature}
      title={entry ? t(entry.label) : undefined}
      hint={entry ? t(entry.hint) : undefined}
    />
  );
}
