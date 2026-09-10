// ─────────────────────────────────────────────────────────────────────────────
// Le contrat des gabarits de vitrine
//
// `StoreView` est ce qui traverse la frontière serveur/client. Volontairement
// plat et sérialisable : pas de client Supabase, pas de fonction, rien qui
// ressemble à `StoreSettings` complet.
//
// La ligne de base a longtemps porté les identifiants de passerelle de
// paiement ; ils vivent maintenant dans `store_payment_credentials`, hors de
// portée. Mais la règle tient toujours : elle porte le domaine personnalisé,
// les jetons de déploiement et tout ce qu'une colonne future y ajoutera. Ne
// faire suivre que ce qui est nommé ici.
//
// Un gabarit reçoit ce type et rien d'autre. C'est ce qui garantit qu'en
// changer un ne demande aucune modification ailleurs.
// ─────────────────────────────────────────────────────────────────────────────

import type {
  StoreProduct, StoreCategory, StoreSettings, ShippingMode,
} from '../../app/actions/store-public';
import { parseThemeConfig, type ThemeConfig, type TemplateId } from '../../lib/storeTheme';

export type StoreView = {
  slug:        string;
  /** Préfixe des liens internes : '' sur l'hôte de la boutique, sinon /store/<slug>. */
  base:        string;
  name:        string;
  tagline:     string | null;
  logoUrl:     string | null;
  bannerUrl:   string | null;
  currency:    string;
  showPrices:  boolean;
  showStock:   boolean;
  templateId:  TemplateId;
  theme:       ThemeConfig;
  /** Le numéro qui reçoit les commandes WhatsApp. Null : le bouton ne s'affiche pas. */
  whatsappPhone: string | null;
  contactPhone:  string | null;
  contactEmail:  string | null;
  contactAddress: string | null;
  /**
   * Ce que le tunnel d'achat proposera vraiment, livraison et paiement.
   *
   * Ces deux listes descendent déjà dans le navigateur à l'étape du paiement
   * (`/store/<slug>/checkout`) : les faire suivre ici ne découvre rien de
   * neuf. Ce qu'elles permettent, c'est de RÉPONDRE AVANT — « combien coûte la
   * livraison à Pétion-Ville » et « est-ce que vous prenez MonCash » sont les
   * deux questions qui arrêtent un acheteur, et il ne va pas jusqu'au checkout
   * pour les poser : il ferme la page, ou il écrit sur WhatsApp.
   *
   * Aucune des deux n'est saisie deux fois. Elles viennent des réglages de la
   * boutique, donc la page ne peut pas promettre un mode que la caisse
   * refusera.
   */
  paymentMethods: string[];
  shippingModes:  ShippingMode[];
  /** L'URL publique absolue, pour les liens de partage. */
  origin:      string;
};

export type { StoreProduct, StoreCategory, ShippingMode };

/**
 * Réduit la ligne de base à ce que le navigateur a le droit de voir.
 *
 * Le seul endroit du code où `StoreSettings` se transforme en `StoreView`.
 * Toute colonne sensible ajoutée plus tard à `store_settings` reste donc côté
 * serveur par défaut : il faut venir ici pour la faire sortir.
 */
export function toStoreView(
  store: StoreSettings,
  opts: { base: string; origin: string; templateId: TemplateId },
): StoreView {
  // Le gabarit est passé en troisième : c'est lui qui fournit les couleurs et
  // la typographie de départ quand la vitrine n'a pas encore les siennes.
  const theme = parseThemeConfig(
    store.theme_config,
    { primary_color: store.primary_color, secondary_color: store.secondary_color },
    opts.templateId,
  );

  const whatsappPhone =
    (theme.whatsapp.enabled ? theme.whatsapp.number.trim() : '') ||
    store.whatsapp_number ||
    null;

  return {
    slug:           store.slug,
    base:           opts.base,
    name:           store.store_name ?? 'Boutique',
    tagline:        store.tagline ?? null,
    logoUrl:        store.logo_url ?? null,
    bannerUrl:      store.banner_url ?? null,
    currency:       store.currency ?? 'HTG',
    showPrices:     store.show_prices !== false,
    showStock:      store.show_stock === true,
    templateId:     opts.templateId,
    theme,
    whatsappPhone:  theme.whatsapp.enabled ? whatsappPhone : null,
    contactPhone:   store.contact_phone ?? null,
    contactEmail:   store.contact_email ?? null,
    contactAddress: store.contact_address ?? null,
    paymentMethods: Array.isArray(store.payment_methods) ? store.payment_methods : [],
    shippingModes:  Array.isArray(store.shipping_modes)  ? store.shipping_modes  : [],
    origin:         opts.origin,
  };
}
