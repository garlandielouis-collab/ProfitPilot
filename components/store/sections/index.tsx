// ─────────────────────────────────────────────────────────────────────────────
// Le registre des sections, et le moteur qui les rend
//
// Une clé, un composant. Le moteur ne sait pas ce qu'il rend et n'a pas à le
// savoir : c'est ce qui permet d'ajouter une trente-deuxième section sans revenir
// ici, et de retirer la seizième sans casser une vitrine en production — une
// clé absente du registre est simplement sautée. Elles sont trente-sept.
//
// Ce fichier remplace les trois gabarits monolithiques. Ils dessinaient chacun
// leur bannière, leurs catégories et leur grille : trois fois le même code,
// donc trois fois la même correction à faire, et deux fois faite en pratique.
// Ce qui distingue maintenant un gabarit d'un autre, c'est l'ordre des sections
// (`presetFor`), sa direction artistique (`designFor`) et son thème.
//
// Le profil de gabarit est résolu UNE fois ici et passé à chaque section. Une
// section qui appellerait `designFor` elle-même pourrait, un jour, en tirer un
// profil différent des autres — et une page dont la moitié des sections suit un
// rythme et l'autre moitié un second est exactement l'impression de « template
// généré » que la refonte cherche à effacer.
// ─────────────────────────────────────────────────────────────────────────────

import { Fragment, type ComponentType } from 'react';
import type { SectionKey } from '../../../lib/storeSections';
import { designFor, proofStripFor } from '../../../lib/storeDesign';
import type { SectionProps } from './types';

import {
  AnnouncementSection, HeroSection, BenefitsSection, CategoriesSection,
  PromotionSection, BrandStorySection, FaqSection, NewsletterSection,
  LocationSection, SocialSection,
} from './ContentSections';
import {
  FeaturedSection, FeaturedProductSection, BestsellersSection,
  NewArrivalsSection, CatalogSection,
} from './ProductSections';
import {
  StatsSection, ProcessSection, GallerySection, OrderFormSection, CtaBandSection,
  WhatsAppHelpSection,
} from './TradeSections';
import {
  ShippingSection, PaymentsSection, ContactSection, SizeGuideSection,
  IngredientsSection,
} from './InfoSections';
import {
  CountdownSection, VideoSection, PartnersSection, TeamSection,
} from './BrandSections';
import { PresentationSection } from './PresentationSection';
import { TestimonialsSection } from './TestimonialsSection';
import { BundlesSection } from './BundlesSection';
import {
  AvailabilitySection, WholesaleSection, PackagesSection, CaseStudiesSection,
  JournalSection, VideoWallSection,
} from './MetierSections';

// Une bande, pas une section : elle n'a pas de clé à elle et se range, non
// dans l'ordre du gabarit, mais sous la bannière. Elle s'éteint avec
// « Réassurance » — voir `SectionRenderer` plus bas.
import { ProofStrip } from '../blocks/ProofStrip';

const REGISTRY: Record<SectionKey, ComponentType<SectionProps>> = {
  announcement:     AnnouncementSection,
  hero:             HeroSection,
  benefits:         BenefitsSection,
  categories:       CategoriesSection,
  featured:         FeaturedSection,
  featured_product: FeaturedProductSection,
  stats:            StatsSection,
  process:          ProcessSection,
  gallery:          GallerySection,
  order_form:       OrderFormSection,
  cta_band:         CtaBandSection,
  bestsellers:      BestsellersSection,
  new_arrivals:     NewArrivalsSection,
  bundles:          BundlesSection,
  promotion:        PromotionSection,
  brand_story:      BrandStorySection,
  catalog:          CatalogSection,
  testimonials:     TestimonialsSection,
  faq:              FaqSection,
  newsletter:       NewsletterSection,
  location:         LocationSection,
  social:           SocialSection,

  // Les dix sections qui répondent (§36).
  presentation:     PresentationSection,
  shipping:         ShippingSection,
  payments:         PaymentsSection,
  contact:          ContactSection,
  countdown:        CountdownSection,
  video:            VideoSection,
  partners:         PartnersSection,
  size_guide:       SizeGuideSection,
  ingredients:      IngredientsSection,
  team:             TeamSection,

  // Les six sections qui achèvent les gabarits métier (§34).
  availability:     AvailabilitySection,
  wholesale:        WholesaleSection,
  packages:         PackagesSection,
  case_studies:     CaseStudiesSection,
  journal:          JournalSection,
  video_wall:       VideoWallSection,

  // La barre « Vous avez une question ? », avant « Comment payer ».
  whatsapp_help:    WhatsAppHelpSection,
};

export function SectionRenderer({ store, data, sections, infoPage }: {
  store:    SectionProps['store'];
  data:     SectionProps['data'];
  sections: SectionProps['section'][];
  /** La page interne rendue, absente sur l'accueil. Voir `SectionProps`. */
  infoPage?: string;
}) {
  const design = designFor(store.templateId);

  // La bande de preuves suit la bannière quand il y en a une ; la section
  // « Réassurance » s'efface alors, sans quoi la bande paraîtrait deux fois.
  // Un marchand qui a ÉTEINT « Réassurance » dans l'éditeur n'a pas de bande.
  //
  // Sauf sur un gabarit qui la veut à SA place dans l'ordre (`place:
  // 'section'`, « Style Chic ») : « Réassurance » la rend là où elle est
  // rangée, et rien ne s'accroche sous la bannière.
  const underHero      = proofStripFor(design).place === 'hero';
  const hasHero        = underHero && sections.some((s) => s.key === 'hero' && s.enabled);
  const proofsDisabled = sections.some((s) => s.key === 'benefits' && !s.enabled);

  return (
    <>
      {sections
        .filter((s) => s.enabled)
        .map((section) => {
          const Component = REGISTRY[section.key];
          if (!Component) return null;
          if (section.key === 'benefits' && hasHero) return null;

          const rendered = (
            <Component
              key={section.key}
              store={store}
              section={section}
              data={data}
              design={design}
              infoPage={infoPage}
            />
          );

          if (section.key !== 'hero') return rendered;

          // ── La bande de preuves, juste sous la bannière ─────────────────────
          //
          // Elle est accrochée à la BANNIÈRE et non à une clé de section, pour
          // deux raisons. Six des vingt et un gabarits n'ont pas de section
          // « Réassurance » dans leur ordre — ils n'auraient rien eu — et deux
          // autres la placent ailleurs qu'au deuxième rang, où elle ne serait
          // plus sous la bannière. Accrochée ici, la bande est au même endroit
          // sur les vingt et un.
          //
          // Sur une page sans bannière, c'est `BenefitsSection` qui la rend à
          // sa place. Les pages internes n'ont ni l'une ni l'autre :
          // la fiche produit et les pages « À propos » ou « Contact » n'en portent pas,
          // et une bande de preuves au-dessus d'un formulaire de contact
          // n'aurait rien à prouver.
          return (
            <Fragment key="hero">
              {rendered}
              {underHero && !proofsDisabled && <ProofStrip store={store} design={design} />}
            </Fragment>
          );
        })}
    </>
  );
}

export type { SectionProps, SectionData, StoreReview, RatingMap } from './types';
