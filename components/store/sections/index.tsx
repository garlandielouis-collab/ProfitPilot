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

import type { ComponentType } from 'react';
import type { SectionKey } from '../../../lib/storeSections';
import { designFor } from '../../../lib/storeDesign';
import type { SectionProps } from './types';

import {
  HeroSection, BenefitsSection, CategoriesSection,
  PromotionSection, BrandStorySection, FaqSection, NewsletterSection,
  LocationSection, SocialSection,
} from './ContentSections';
import {
  FeaturedSection, FeaturedProductSection, BestsellersSection,
  NewArrivalsSection, CatalogSection,
} from './ProductSections';
import {
  StatsSection, ProcessSection, GallerySection, OrderFormSection, CtaBandSection,
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

const REGISTRY: Record<SectionKey, ComponentType<SectionProps>> = {
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
};

export function SectionRenderer({ store, data, sections }: {
  store:    SectionProps['store'];
  data:     SectionProps['data'];
  sections: SectionProps['section'][];
}) {
  const design = designFor(store.templateId);

  return (
    <>
      {sections
        .filter((s) => s.enabled)
        .map((section) => {
          const Component = REGISTRY[section.key];
          if (!Component) return null;
          return (
            <Component
              key={section.key}
              store={store}
              section={section}
              data={data}
              design={design}
            />
          );
        })}
    </>
  );
}

export type { SectionProps, SectionData, StoreReview, RatingMap } from './types';
