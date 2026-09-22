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
// Un clic sur un produit reste dans l'aperçu : la fiche s'ouvre dans CE
// gabarit (`products/[id]`), et non dans celui de la boutique en ligne.
//
// L'accès est celui de l'application : le middleware refuse `/apercu` sans
// session, et la page relit l'entreprise du sélecteur, jamais un identifiant
// passé dans l'adresse (`openApercu`).
// ─────────────────────────────────────────────────────────────────────────────

import type { Metadata } from 'next';
import { loadCatalog, loadCategories } from '../../../lib/storefrontData';
import { loadHome } from '../../../lib/storefrontHome';
import { readableInk } from '../../../lib/storeTheme';
import { TEMPLATES } from '../../../components/store/templates/registry';
import { StorefrontShell } from '../../../components/store/StorefrontShell';
import { SectionRenderer } from '../../../components/store/sections';
import { ApercuBar } from './ApercuBar';
import { openApercu } from './openApercu';

// Un aperçu n'est pas une page publique : il ne doit apparaître dans aucun
// index, même si son adresse fuit dans un historique ou un message.
export const metadata: Metadata = {
  title:  'Aperçu du gabarit',
  robots: { index: false, follow: false },
};

type Props = { params: Promise<{ template: string }> };

export default async function ApercuPage({ params }: Props) {
  const { template } = await params;

  const opened = await openApercu(template);
  if (opened.kind === 'screen') return opened.node;

  const { store, view, templateId } = opened;
  const onlyPublished = view.theme.catalog.mode === 'selected';

  const [catalog, categories, home] = await Promise.all([
    loadCatalog(store.business_id, { sort: 'name', limit: 200, onlyPublished }),
    loadCategories(store.business_id, onlyPublished),
    loadHome(store, { slug: store.slug, theme: view.theme, templateId }),
  ]);

  return (
    <>
      <StorefrontShell
        view={view}
        businessId={store.business_id}
        searchIndex={catalog.map((p) => ({ ...p, images: [] }))}
        categories={categories}
        dockMode="static"
      >
        <SectionRenderer store={view} data={home.data} sections={home.sections} />
        {/* La barre du bas recouvre la fin de la page : sans cette réserve, le
            dernier lien du pied de vitrine est intouchable au doigt. */}
        <div className="h-24" aria-hidden />
      </StorefrontShell>

      <ApercuBar
        templateId={templateId}
        name={TEMPLATES[templateId].name}
        tagline={TEMPLATES[templateId].tagline}
        isCurrent={store.template_id === templateId}
        productCount={home.data.products.length}
        accent={view.theme.palette.accent}
        accentInk={readableInk(view.theme.palette.accent)}
      />
    </>
  );
}
