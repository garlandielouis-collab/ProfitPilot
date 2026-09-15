'use client';

// ─────────────────────────────────────────────────────────────────────────────
// L'accès API — « brancher un autre outil »
//
// ── Ce que cet écran affichait ─────────────────────────────────────────────
//
// Une CLÉ D'API fabriquée dans le navigateur :
//
//     useState('pp_live_sk_' + Math.random().toString(36).slice(2, 18))
//
// Une chaîne au hasard, étiquetée « Live », avec un bouton « Copier », un
// exemple `curl` prêt à coller et l'avertissement « ne partagez jamais cette
// clé, elle donne accès à toutes vos données ». Elle changeait à chaque
// rechargement de la page, et ne donnait accès à rien : ni la table `api_keys`,
// ni le domaine `api.profitpilot.app`, ni les cinq points d'entrée `/v1/…`
// n'existent dans ce dépôt.
//
// C'est le contrôle bloquant n°2 poussé à son extrême : ce n'était plus un
// chiffre inventé, c'était un IDENTIFIANT inventé. Un marchand un peu curieux
// le collait dans un outil tiers, obtenait une erreur de connexion, et en
// concluait que son compte était cassé — ou pire, envoyait la « clé secrète »
// à un développeur pour qu'il regarde.
//
// ── Ce que cet écran dit maintenant ────────────────────────────────────────
//
// La vérité : l'API est prévue, elle n'est pas ouverte, et voici comment
// demander à en être. Rien n'est perdu commercialement — un marchand qui écrit
// pour demander un accès est un marchand qui en a besoin, donc un signal utile.
// Ce qui aurait été perdu, c'est la confiance de celui qui découvre seul que la
// clé de son tableau de bord ne mène nulle part.
//
// ── La décision en attente, tranchée ───────────────────────────────────────
//
// Elle demandait si `api_access` devait rester un argument de vente d'Elit.
// Vérification faite : `lib/plans.ts` ne l'a jamais annoncé — les six lignes
// vendues sous Elit parlent de boutiques, d'employés, de journal et de
// projection, jamais d'API. Rien à retirer.
//
// `api_access` reste dans les droits d'Elit (`lib/planFeatures.ts`), et c'est
// volontaire : l'en retirer afficherait à un abonné Elit un écran « passez à
// Elit » pour une offre qu'il a déjà. Ce qui a changé est l'indice de
// navigation, qui promettait « Brancher un autre outil » et menait ici.
// ─────────────────────────────────────────────────────────────────────────────

import { MessageCircle, Mail } from 'lucide-react';

import { ProtectedRoute } from '../../components/ProtectedRoute';
import { PlanGate, PlanLockScreen } from '../../components/PlanLock';
import { useLanguage } from '../../components/LanguageWrapper';
import { Badge, Card, ScreenHeader, Stack } from '../../components/ds';

const SUPPORT_WHATSAPP = 'https://wa.me/50935045946';
const SUPPORT_EMAIL    = 'support@profitpilot.app';

/** Ce que l'API permettra — décrit en tâches, pas en points d'entrée : le
 *  marchand qui lit cet écran n'écrira pas le code lui-même. */
const PLANNED = [
  { fr: 'Lire vos ventes depuis un autre logiciel',        ht: 'Li vant ou yo depi yon lòt lojisyèl' },
  { fr: 'Synchroniser votre catalogue de produits',        ht: 'Sinkronize katalòg pwodwi ou' },
  { fr: 'Enregistrer une vente faite ailleurs',            ht: 'Anrejistre yon vant ki fèt yon lòt kote' },
  { fr: 'Récupérer vos rapports financiers automatiquement', ht: 'Pran rapò finansye ou yo otomatikman' },
];

function ApiAccessInner() {
  const { t } = useLanguage();

  return (
    <div className="pp-enter mx-auto w-full max-w-2xl px-4 py-6 sm:px-6">
      <ScreenHeader
        title={t({ fr: 'Accès API', ht: 'Aksè API' })}
        subtitle={t({
          fr: 'Brancher ProfitPilot à un autre outil',
          ht: 'Konekte ProfitPilot ak yon lòt zouti',
        })}
      />

      <Stack className="mt-6">
        <PlanGate feature="api_access" fallback={<PlanLockScreen feature="api_access" />}>
          <Card className="p-5">
            <div className="flex items-start justify-between gap-3">
              <h2 className="text-card font-bold text-primary dark:text-dark-text">
                {t({ fr: 'Pas encore ouvert', ht: 'Poko louvri' })}
              </h2>
              {/* Ambre et non rouge : rien n'est en panne, quelque chose n'est
                  pas encore là (§4.2). */}
              <Badge tone="warning">{t({ fr: 'En préparation', ht: 'N ap prepare' })}</Badge>
            </div>

            <p className="mt-2 text-body text-text2 dark:text-dark-text2">
              {t({
                fr: 'Aucune clé n’est délivrée pour le moment. Nous ouvrons l’accès compte par compte, pour accompagner le premier branchement.',
                ht: 'Nou poko bay okenn kle. N ap louvri aksè a kont pa kont, pou n ka akonpaye premye koneksyon an.',
              })}
            </p>

            <div className="mt-5 flex flex-col gap-2 sm:flex-row">
              <a
                href={SUPPORT_WHATSAPP}
                target="_blank"
                rel="noopener noreferrer"
                className="pressable flex min-h-13 flex-1 items-center justify-center gap-2 rounded-surface bg-accent text-body font-bold text-accent-ink shadow-card hover:bg-accent-h"
              >
                <MessageCircle className="h-5 w-5" strokeWidth={2} aria-hidden />
                {t({ fr: 'Demander un accès', ht: 'Mande yon aksè' })}
              </a>
              <a
                href={`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent('Accès API ProfitPilot')}`}
                className="pressable flex min-h-13 items-center justify-center gap-2 rounded-surface border border-border px-5 text-body font-bold text-primary hover:bg-surface dark:border-dark-border dark:text-dark-text dark:hover:bg-white/5"
              >
                <Mail className="h-5 w-5" strokeWidth={1.8} aria-hidden />
                {t({ fr: 'Par e-mail', ht: 'Pa imèl' })}
              </a>
            </div>
          </Card>

          <Card className="px-4">
            <h2 className="border-b border-border py-4 text-card font-bold text-primary dark:border-dark-border dark:text-dark-text">
              {t({ fr: 'Ce que l’accès permettra', ht: 'Sa aksè a ap pèmèt' })}
            </h2>

            <ul className="divide-y divide-border dark:divide-dark-border">
              {PLANNED.map((item) => (
                <li
                  key={item.fr}
                  className="flex min-h-touch items-center gap-3 py-3 text-body text-text2 dark:text-dark-text2"
                >
                  <span className="h-1.5 w-1.5 flex-shrink-0 rounded-pill bg-border dark:bg-dark-border" aria-hidden />
                  {t(item)}
                </li>
              ))}
            </ul>
          </Card>

          <p className="text-note text-muted dark:text-dark-muted">
            {t({
              fr: 'En attendant, l’export de vos données reste disponible dans les Paramètres, dans les trois offres — vos chiffres vous appartiennent.',
              ht: 'An atandan, ekspòtasyon done ou yo rete disponib nan Paramèt, nan twa òf yo — chif ou yo se pou ou.',
            })}
          </p>
        </PlanGate>
      </Stack>
    </div>
  );
}

export default function ApiAccessPage() {
  return (
    <ProtectedRoute>
      <ApiAccessInner />
    </ProtectedRoute>
  );
}
