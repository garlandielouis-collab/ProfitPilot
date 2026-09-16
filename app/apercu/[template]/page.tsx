// ─────────────────────────────────────────────────────────────────────────────
// L'aperçu d'un gabarit
//
// Dix-neuf gabarits décrits par trois lignes chacun dans l'éditeur, c'est un choix
// fait à l'aveugle. Ici, le marchand voit SA boutique — ses produits, ses
// photos, ses couleurs, ses textes — dans le gabarit qu'il envisage, et passe
// de l'un à l'autre depuis la barre du bas.
//
// ── Pourquoi ce n'est pas une capture d'écran de démonstration ─────────────
//
// Une vignette dessinée à l'avance montre une boutique qui n'est pas la sienne,
// avec des produits qu'il n'a pas et des photos qu'il n'aura jamais. Le seul
// aperçu qui ne ment pas est celui qui rend ses vraies données — c'est aussi la
// règle « aucune donnée fictive » du produit, appliquée là où la tentation
// était la plus forte.
//
// ── Ce qui garantit qu'il ne ment pas ──────────────────────────────────────
//
// La page réutilise l'enveloppe (`StorefrontShell`) et l'assemblage
// (`loadHome`) de la vitrine publique, sans une ligne de rendu à elle. Le thème
// est résolu comme il le sera en ligne : `toStoreView` repasse par
// `parseThemeConfig` avec le gabarit visé, donc un marchand qui a déjà choisi
// ses couleurs les voit ici, et celui qui n'y a jamais touché voit la palette
// du gabarit — dans les deux cas, ce que « Choisir ce gabarit » produira.
//
// L'accès est celui de l'application : le middleware refuse `/apercu` sans
// session, et la page relit l'entreprise du sélecteur, jamais un identifiant
// passé dans l'adresse.
// ─────────────────────────────────────────────────────────────────────────────

import { notFound } from 'next/navigation';
import Link from 'next/link';
import type { Metadata } from 'next';
import { assertFeature } from '../../../lib/entitlements';
import { getPreviewPlanServer } from '../../../lib/planPreviewServer';
import { getPlanLabel } from '../../../lib/plans';
import { PlanLockScreen } from '../../../components/PlanLock';
import { getBusinessContext, isTransportFailure } from '../../../lib/serverAuth';
import { getSupabaseService } from '../../../lib/supabaseServiceClient';
import { getStoreRouting, loadCatalog, loadCategories } from '../../../lib/storefrontData';
import { loadHome } from '../../../lib/storefrontHome';
import { isTemplateId, readableInk } from '../../../lib/storeTheme';
import { toStoreView } from '../../../components/store/types';
import { TEMPLATES } from '../../../components/store/templates/registry';
import { StorefrontShell } from '../../../components/store/StorefrontShell';
import { SectionRenderer } from '../../../components/store/sections';
import type { StoreSettings } from '../../actions/store-public';
import { ApercuBar } from './ApercuBar';

// Un aperçu n'est pas une page publique : il ne doit apparaître dans aucun
// index, même si son adresse fuit dans un historique ou un message.
export const metadata: Metadata = {
  title:  'Aperçu du gabarit',
  robots: { index: false, follow: false },
};

type Props = { params: Promise<{ template: string }> };

export default async function ApercuPage({ params }: Props) {
  const { template } = await params;
  if (!isTemplateId(template)) notFound();

  // ── Le verrou d'offre s'AFFICHE, il ne lève pas ───────────────────────────
  //
  // `assertFeature` était appelée ici telle quelle. Elle lève une
  // `FeatureLockedError`, et cette page est le SEUL écran du produit à poser la
  // garde dans son propre fichier — partout ailleurs elle vit dans une server
  // action, dont le composant client attrape le refus et l'affiche.
  //
  // Pire : `/apercu` est traité comme une page publique par `AppShell` (elle
  // rend une vitrine, pas un écran de l'application), donc `RouteFeatureGate`
  // ne la juge pas et personne n'attrape rien. Résultat : un marchand dont
  // l'offre ne couvre pas la boutique — ou dont l'aperçu d'offre est resté sur
  // une offre basse — obtenait un écran d'erreur brut à la place du catalogue
  // de gabarits. Une destination verrouillée doit se VOIR, sinon elle ne se
  // vend pas (§4.2) ; une destination qui plante ne se vend pas non plus, elle
  // fait croire que le produit est cassé.
  //
  // La garde reste `assertFeature`, attrapée — et non un `hasFeature` booléen :
  // une seule source de vérité pour « cet écran est-il dans mon offre », qui
  // porte déjà le nom de l'offre requise et attrape aussi un refus venu plus
  // profond. Deux gardes finiraient un jour par ne plus dire la même chose.
  // Trois issues, pas deux. La troisième est celle qui manquait, et c'est elle
  // qui a fait perdre le plus de temps : quand le service d'authentification
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
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-4 px-4 text-center">
        <h1 className="text-screen font-semibold text-primary dark:text-dark-text">
          Votre compte est momentanément injoignable
        </h1>
        <p className="text-body text-text2 dark:text-dark-text2">
          Nous n'avons pas pu vérifier votre offre — c'est la connexion, pas votre
          abonnement. Rechargez la page dans un instant.
        </p>
        <Link
          href={`/apercu/${template}`}
          className="mt-2 flex min-h-hero items-center rounded-surface bg-accent px-6 text-body font-semibold text-accent-ink"
        >
          Réessayer
        </Link>
      </main>
    );
  }

  if (locked) {
    const preview = await getPreviewPlanServer();
    return (
      <main className="min-h-screen">
        <PlanLockScreen
          feature="online_store"
          title="Aperçu des gabarits"
          hint="Voir votre boutique dans chacun des 22 gabarits, avec vos vrais produits"
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
    );
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
    return (
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
    );
  }

  const routing = await getStoreRouting(store.slug);
  const origin  = process.env.NEXT_PUBLIC_APP_URL ?? '';

  // Le gabarit visé remplace celui de la base — y compris pour la résolution du
  // thème, que `toStoreView` refait avec lui.
  const view = toStoreView(store, {
    base: routing.base,
    origin,
    templateId: template,
  });

  const onlyPublished = view.theme.catalog.mode === 'selected';

  const [catalog, categories, home] = await Promise.all([
    loadCatalog(store.business_id, { sort: 'name', limit: 200, onlyPublished }),
    loadCategories(store.business_id, onlyPublished),
    loadHome(store, { slug: store.slug, theme: view.theme, templateId: template }),
  ]);

  return (
    <>
      <StorefrontShell
        view={view}
        businessId={store.business_id}
        searchIndex={catalog.map((p) => ({ ...p, images: [] }))}
        categories={categories}
        dockMode="static"
        homeSections={home.sections.filter((sec) => sec.enabled).map((sec) => sec.key)}
      >
        <SectionRenderer store={view} data={home.data} sections={home.sections} />
        {/* La barre du bas recouvre la fin de la page : sans cette réserve, le
            dernier lien du pied de vitrine est intouchable au doigt. */}
        <div className="h-24" aria-hidden />
      </StorefrontShell>

      <ApercuBar
        templateId={template}
        name={TEMPLATES[template].name}
        tagline={TEMPLATES[template].tagline}
        isCurrent={store.template_id === template}
        productCount={home.data.products.length}
        accent={view.theme.palette.accent}
        accentInk={readableInk(view.theme.palette.accent)}
      />
    </>
  );
}
