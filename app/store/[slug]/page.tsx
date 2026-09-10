// ─────────────────────────────────────────────────────────────────────────────
// L'accueil d'une vitrine
//
// La page ne dessine rien. Elle charge une fois, assemble, et laisse le moteur
// de sections rendre l'ordre choisi par le marchand.
//
// Trois versions de ce fichier se sont succédé. La première dessinait sa
// bannière, ses catégories et sa grille ici même, avec des couleurs figées
// qu'aucun réglage n'atteignait. La deuxième déléguait à un composant par
// gabarit — trois fois le même code, donc trois fois la même correction à
// faire. Celle-ci délègue à des SECTIONS, dont le gabarit ne décide plus que
// l'ordre de départ.
//
// L'assemblage des données vit dans `lib/storefrontHome.ts`, partagé avec
// l'aperçu de gabarit du marchand : les deux écrans doivent montrer la même
// page, sinon l'aperçu ment.
// ─────────────────────────────────────────────────────────────────────────────

import { notFound } from 'next/navigation';
import { loadStore, buildStorefrontContext } from '../../../lib/storefrontData';
import { loadHome } from '../../../lib/storefrontHome';
import { toStoreView } from '../../../components/store/types';
import { resolveTemplateId } from '../../../components/store/templates/registry';
import { SectionRenderer } from '../../../components/store/sections';
import { TrackView } from '../../../components/store/blocks/TrackView';

type Props = { params: Promise<{ slug: string }> };

export default async function StorePage({ params }: Props) {
  const { slug } = await params;
  const store = await loadStore(slug);
  if (!store) notFound();

  const ctx        = await buildStorefrontContext(store, slug);
  const templateId = resolveTemplateId(store.template_id);
  const view       = toStoreView(store, { base: ctx.base, origin: ctx.origin, templateId });

  const { data, sections } = await loadHome(store, { slug, theme: ctx.theme, templateId });

  return (
    <>
      <TrackView businessId={store.business_id} event="page_view" path="/" />
      <SectionRenderer store={view} data={data} sections={sections} />
    </>
  );
}
