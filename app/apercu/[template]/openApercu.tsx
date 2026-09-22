// ─────────────────────────────────────────────────────────────────────────────
// L'ouverture d'un aperçu, commune à toutes ses pages
//
// L'aperçu n'avait qu'une page, l'accueil. Il en a maintenant deux — l'accueil
// et la fiche produit — et les deux doivent refuser, attendre ou renvoyer
// exactement de la même façon : une offre qui ne couvre pas la boutique, un
// compte momentanément injoignable, une boutique pas encore créée. Écrites
// deux fois, ces trois issues auraient fini par ne plus dire la même chose.
//
// ── La base des liens ──────────────────────────────────────────────────────
//
// C'est ce qui a fait croire au marchand qu'il n'y avait qu'une fiche produit.
// La vue de l'aperçu portait la base de la VRAIE boutique (`/store/<slug>`) :
// chaque lien quittait donc l'aperçu, et la fiche ouverte depuis l'aperçu de
// Style Chic était celle du gabarit en ligne. La base est désormais celle de
// l'aperçu, `/apercu/<gabarit>` : la fiche reste dans le gabarit regardé.
//
// Les pages que l'aperçu ne rend pas (catalogue, panier, caisse…) passent par
// `[...rest]`, qui renvoie vers la boutique en ligne — c'est la seule
// destination honnête pour elles, et l'adresse le dit.
// ─────────────────────────────────────────────────────────────────────────────

import { notFound } from 'next/navigation';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { assertFeature } from '../../../lib/entitlements';
import { getPreviewPlanServer } from '../../../lib/planPreviewServer';
import { getPlanLabel } from '../../../lib/plans';
import { PlanLockScreen } from '../../../components/PlanLock';
import { getBusinessContext, isTransportFailure } from '../../../lib/serverAuth';
import { getSupabaseService } from '../../../lib/supabaseServiceClient';
import { getStoreRouting } from '../../../lib/storefrontData';
import { isTemplateId, type TemplateId } from '../../../lib/storeTheme';
import { toStoreView, type StoreView } from '../../../components/store/types';
import type { StoreSettings } from '../../actions/store-public';

export type ApercuOpened =
  /** Un écran à rendre tel quel : verrou, compte injoignable, boutique absente. */
  | { kind: 'screen'; node: ReactNode }
  | {
      kind:       'ready';
      store:      StoreSettings;
      /** La vue dans le gabarit REGARDÉ, avec les liens de l'aperçu. */
      view:       StoreView;
      templateId: TemplateId;
      /** La base de la boutique en ligne, pour les pages que l'aperçu ne rend pas. */
      liveBase:   string;
    };

/** La base des liens de l'aperçu d'un gabarit. */
export function apercuBase(templateId: TemplateId): string {
  return `/apercu/${templateId}`;
}

export async function openApercu(template: string): Promise<ApercuOpened> {
  if (!isTemplateId(template)) notFound();

  // ── Le verrou d'offre s'AFFICHE, il ne lève pas ───────────────────────────
  //
  // `assertFeature` était appelée telle quelle. Elle lève une
  // `FeatureLockedError`, et cette page est le SEUL écran du produit à poser la
  // garde dans son propre fichier — partout ailleurs elle vit dans une server
  // action, dont le composant client attrape le refus et l'affiche.
  //
  // Pire : `/apercu` est traité comme une page publique par `AppShell` (elle
  // rend une vitrine, pas un écran de l'application), donc `RouteFeatureGate`
  // ne la juge pas et personne n'attrape rien. Une destination verrouillée doit
  // se VOIR, sinon elle ne se vend pas (§4.2) ; une destination qui plante ne
  // se vend pas non plus, elle fait croire que le produit est cassé.
  //
  // Trois issues, pas deux. La troisième : quand le service d'authentification
  // est injoignable, on ne connaît pas l'offre — donc on ne peut pas conclure
  // qu'elle est insuffisante. Afficher « passez à Kwasans » à un abonné Elit
  // parce que le réseau a expiré est un message faux qui parle d'argent.
  let locked = false;
  let unreachable = false;
  try {
    await assertFeature('online_store');
  } catch (err) {
    if (isTransportFailure(err)) unreachable = true;
    else locked = true;
  }

  if (unreachable) {
    return {
      kind: 'screen',
      node: (
        <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-4 px-4 text-center">
          <h1 className="text-screen font-semibold text-primary dark:text-dark-text">
            Votre compte est momentanément injoignable
          </h1>
          <p className="text-body text-text2 dark:text-dark-text2">
            Nous n'avons pas pu vérifier votre offre — c'est la connexion, pas votre
            abonnement. Rechargez la page dans un instant.
          </p>
          <Link
            href={apercuBase(template)}
            className="mt-2 flex min-h-hero items-center rounded-surface bg-accent px-6 text-body font-semibold text-accent-ink"
          >
            Réessayer
          </Link>
        </main>
      ),
    };
  }

  if (locked) {
    const preview = await getPreviewPlanServer();
    return {
      kind: 'screen',
      node: (
        <main className="min-h-screen">
          <PlanLockScreen
            feature="online_store"
            title="Aperçu des gabarits"
            hint="Voir votre boutique dans chacun des 23 gabarits, avec vos vrais produits"
          />
          {/* La cause la plus fréquente en développement, et la plus invisible :
              l'aperçu d'offre reste dans un cookie et filtre TOUT le produit, y
              compris cette page. Sans cette ligne, on cherche la panne dans le
              code de la vitrine pendant que le cookie la gouverne. */}
          {preview && (
            <p className="mx-auto max-w-lg px-4 pb-10 text-center text-note text-muted dark:text-dark-muted">
              Un aperçu d'offre est actif sur ce navigateur ({getPlanLabel(preview)}).
              C'est lui qui décide ici, pas votre abonnement réel — retirez-le pour
              retrouver vos droits.
            </p>
          )}
        </main>
      ),
    };
  }

  const { businessId } = await getBusinessContext();

  const svc = getSupabaseService();
  const { data } = await svc
    .from('store_settings')
    .select('*')
    .eq('business_id', businessId)
    .maybeSingle();

  const store = data as StoreSettings | null;

  // Sans boutique enregistrée, il n'y a rien à prévisualiser — et surtout rien
  // à inventer. On le dit, avec le chemin pour y remédier.
  if (!store?.slug) {
    return {
      kind: 'screen',
      node: (
        <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-4 px-4 text-center">
          <h1 className="text-screen font-semibold text-primary dark:text-dark-text">
            Votre boutique n'est pas encore créée
          </h1>
          <p className="text-body text-text2 dark:text-dark-text2">
            Donnez-lui un nom et une adresse dans l'éditeur : l'aperçu montrera
            alors vos vrais produits dans le gabarit de votre choix.
          </p>
          <Link
            href="/boutique/builder"
            className="mt-2 flex min-h-hero items-center rounded-surface bg-accent px-6 text-body font-semibold text-accent-ink"
          >
            Ouvrir l'éditeur
          </Link>
        </main>
      ),
    };
  }

  const routing = await getStoreRouting(store.slug);
  const origin  = process.env.NEXT_PUBLIC_APP_URL ?? '';

  // Le gabarit visé remplace celui de la base — y compris pour la résolution du
  // thème, que `toStoreView` refait avec lui.
  const view = toStoreView(store, {
    base:       apercuBase(template),
    origin,
    templateId: template,
  });

  return { kind: 'ready', store, view, templateId: template, liveBase: routing.base };
}
