'use server';

// ─────────────────────────────────────────────────────────────────────────────
// PilotAI Copy — les actions côté marchand
//
// Le pendant textuel du Studio photo (`aiStudio.ts`), et il suit exactement la
// même règle : GÉNÉRER ET APPLIQUER SONT DEUX GESTES. Une IA qui réécrit
// d'autorité la fiche d'un produit en vente est une IA qu'on désactive le
// lendemain — et là, contrairement à la photo, l'original n'a pas de colonne de
// secours. Le texte proposé transite par le navigateur, le marchand le corrige,
// et rien n'est écrit tant qu'il n'a pas cliqué.
//
// ── Pourquoi le texte revient au navigateur au lieu d'être écrit tout de suite
//
// Parce que le marchand doit pouvoir dire non, et parce qu'il doit pouvoir dire
// « oui, mais ». Enregistrer d'abord et proposer d'annuler ensuite fait la même
// chose sur le papier et pas du tout la même chose dans la tête de celui qui
// vient de voir sa description remplacée.
//
// Le prix de ce choix : `applyProductCopy` reçoit du texte venu du navigateur.
// C'est acceptable ici, et seulement ici, parce qu'il s'agit de champs
// descriptifs bornés que le marchand a de toute façon le droit d'écrire à la
// main. Aucun montant, aucun stock, aucun état de commande ne passe par là.
// ─────────────────────────────────────────────────────────────────────────────

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { assertFeature } from '../../lib/entitlements';
import { getBusinessContext, requirePermission } from '../../lib/serverAuth';
import { getSupabaseService } from '../../lib/supabaseServiceClient';
import { revalidateStore } from '../../lib/storefrontData';
import {
  creditBalance,
  refundCredits,
  spendCredits,
} from '../../lib/ai/credits';
import {
  copyProviderAvailable,
  writeProductCopy,
  writeProductSeo,
  type CopyLanguage,
  type CopyTone,
  type ProductFacts,
  writeStorePresentation,
  type StoreFacts,
} from '../../lib/ai/copywriter';
import { TEMPLATES, resolveTemplateId } from '../../components/store/templates/registry';
import { attempt, UserFacingError, type ActionResult } from '../../lib/actionResult';

// Même drapeau que le Studio photo : la rédaction n'existe que pour la
// vitrine. Le jour où elle se vend séparément, c'est cette constante qui
// change, pas les composants.
const COPY_FEATURE = 'online_store' as const;

export type CopyDraft = {
  title:      string;
  short:      string;
  long:       string;
  highlights: string[];
  /** Crédits restants après l'appel. Affiché tout de suite, pas au rechargement. */
  remaining:  number;
};

export type SeoDraft = {
  seoTitle:       string;
  seoDescription: string;
  tags:           string[];
  remaining:      number;
};

/** Ce que la fiche porte aujourd'hui. Sert à pré-remplir l'écran. */
export type ProductCopyState = {
  id:          string;
  name:        string;
  short:       string;
  long:        string;
  highlights:  string[];
  seoTitle:    string;
  seoDescription: string;
  tags:        string[];
  aiCopyAt:    string | null;
  /** `false` quand ANTHROPIC_API_KEY manque : l'écran le dit au lieu d'échouer. */
  available:   boolean;
  credits:     number;
};

const SELECT =
  'id, name, category, sale_price, currency, tags, attributes, ' +
  'store_description, store_short_description, store_highlights, ' +
  'seo_title, seo_description, ai_copy_at';

/**
 * Le produit, cadré par l'entreprise ouverte.
 *
 * Sans le filtre `business_id`, un identifiant deviné ferait rédiger — et
 * facturer — la fiche d'un autre marchand.
 */
async function loadProduct(productId: string, businessId: string) {
  const { data } = await getSupabaseService()
    .from('products')
    .select(SELECT)
    .eq('id', productId)
    .eq('business_id', businessId)
    .maybeSingle();

  if (!data) throw new UserFacingError('Produit introuvable.');
  return data as Record<string, any>;
}

/** Le nom de la boutique, quand il existe. Il situe le produit sans rien inventer. */
async function storeName(businessId: string): Promise<string | null> {
  const { data } = await getSupabaseService()
    .from('store_settings')
    .select('store_name')
    .eq('business_id', businessId)
    .maybeSingle();

  return (data as { store_name?: string } | null)?.store_name ?? null;
}

function factsFrom(product: Record<string, any>, store: string | null): ProductFacts {
  return {
    name:       String(product.name ?? ''),
    category:   product.category ?? null,
    price:      product.sale_price ?? null,
    currency:   product.currency ?? null,
    attributes: (product.attributes ?? null) as Record<string, unknown> | null,
    tags:       (product.tags ?? []) as string[],
    existing:   product.store_description ?? null,
    storeName:  store,
  };
}

/** L'état de la fiche, à l'ouverture de la modale. */
export async function getProductCopyState(productId: string): Promise<ProductCopyState> {
  await assertFeature(COPY_FEATURE);
  const { businessId } = await getBusinessContext();

  const product = await loadProduct(productId, businessId);

  return {
    id:             product.id,
    name:           product.name ?? '',
    short:          product.store_short_description ?? '',
    long:           product.store_description ?? '',
    highlights:     (product.store_highlights ?? []) as string[],
    seoTitle:       product.seo_title ?? '',
    seoDescription: product.seo_description ?? '',
    tags:           (product.tags ?? []) as string[],
    aiCopyAt:       product.ai_copy_at ?? null,
    available:      copyProviderAvailable(),
    credits:        await creditBalance(businessId),
  };
}

/**
 * Rédige. Ne sauvegarde rien.
 *
 * Le crédit part AVANT l'appel au fournisseur et revient si l'appel échoue.
 * L'ordre inverse laisserait passer gratuitement toute rédaction dont le débit
 * échoue, et c'est de l'argent réel chez un tiers à chaque fois.
 */
export async function draftProductCopy(
  productId: string,
  tone:      CopyTone     = 'standard',
  language:  CopyLanguage = 'fr',
): Promise<ActionResult<CopyDraft>> {
  return attempt(async () => {
  await assertFeature(COPY_FEATURE);
  const { businessId, userId } = await requirePermission('products:write');

  const product = await loadProduct(productId, businessId);
  const facts   = factsFrom(product, await storeName(businessId));

  const { remaining } = await spendCredits(
    businessId, userId, 'product_description', `product:${productId}`,
  );

  try {
    const copy = await writeProductCopy(facts, tone, language);
    return { ...copy, highlights: copy.highlights.slice(0, 5), remaining };
  } catch (err) {
    await refundCredits(businessId, 'product_description', `product:${productId}`);
    throw err;
  }
  });
}

/** §16 — le volet SEO, demandé et facturé à part. */
export async function draftProductSeo(
  productId: string,
  language:  CopyLanguage = 'fr',
): Promise<ActionResult<SeoDraft>> {
  return attempt(async () => {
  await assertFeature(COPY_FEATURE);
  const { businessId, userId } = await requirePermission('products:write');

  const product = await loadProduct(productId, businessId);
  // La description fraîchement écrite, si elle existe, aide le SEO à parler du
  // même produit que la fiche.
  const facts = factsFrom(product, await storeName(businessId));

  const { remaining } = await spendCredits(
    businessId, userId, 'product_seo', `product:${productId}`,
  );

  try {
    const seo = await writeProductSeo(facts, language);
    return { ...seo, tags: seo.tags.slice(0, 8), remaining };
  } catch (err) {
    await refundCredits(businessId, 'product_seo', `product:${productId}`);
    throw err;
  }
  });
}

// ── L'enregistrement ────────────────────────────────────────────────────────

const applySchema = z.object({
  name:           z.string().trim().min(1).max(160).optional(),
  short:          z.string().trim().max(240).optional(),
  long:           z.string().trim().max(4000).optional(),
  highlights:     z.array(z.string().trim().min(1).max(160)).max(6).optional(),
  seoTitle:       z.string().trim().max(120).optional(),
  seoDescription: z.string().trim().max(320).optional(),
  tags:           z.array(z.string().trim().min(1).max(40)).max(12).optional(),
});

export type ApplyCopyInput = z.input<typeof applySchema>;

/**
 * Écrit les champs fournis, et seulement ceux-là.
 *
 * Un champ absent n'est pas un champ vidé : le marchand qui régénère l'accroche
 * seule ne doit pas perdre sa description. `undefined` veut dire « ne touche
 * pas », la chaîne vide veut dire « efface ».
 */
export async function applyProductCopy(
  productId: string,
  input:     ApplyCopyInput,
): Promise<ActionResult> {
  return attempt(async () => {
  await assertFeature(COPY_FEATURE);
  const { businessId } = await requirePermission('products:write');

  const parsed = applySchema.safeParse(input);
  if (!parsed.success) throw new UserFacingError('Texte invalide.');
  const value = parsed.data;

  const patch: Record<string, unknown> = { ai_copy_at: new Date().toISOString() };

  if (value.name           !== undefined) patch.name                    = value.name;
  if (value.short          !== undefined) patch.store_short_description = value.short || null;
  if (value.long           !== undefined) patch.store_description       = value.long || null;
  if (value.seoTitle       !== undefined) patch.seo_title               = value.seoTitle || null;
  if (value.seoDescription !== undefined) patch.seo_description         = value.seoDescription || null;
  if (value.highlights     !== undefined) {
    patch.store_highlights = value.highlights.filter(Boolean);
  }
  if (value.tags !== undefined) {
    // Dédoublonnées et normalisées : les étiquettes servent aux filtres (§20),
    // et « Nivea » et « nivea » ne doivent pas y compter pour deux.
    patch.tags = Array.from(
      new Set(value.tags.map((t) => t.toLowerCase()).filter(Boolean)),
    );
  }

  const { error } = await getSupabaseService()
    .from('products')
    .update(patch)
    .eq('id', productId)
    .eq('business_id', businessId);

  if (error) throw new Error(`Enregistrement impossible : ${error.message}`);

  await refreshStorefront(businessId);
  revalidatePath('/products');
  revalidatePath('/boutique/builder');
  });
}

/** Le solde, pour les écrans qui l'affichent sans rien générer. */
export async function getAiCredits(): Promise<number> {
  await assertFeature(COPY_FEATURE);
  const { businessId } = await getBusinessContext();
  return creditBalance(businessId);
}

/** Le catalogue de la vitrine a changé : on invalide son cache. */
async function refreshStorefront(businessId: string) {
  const { data } = await getSupabaseService()
    .from('store_settings')
    .select('slug')
    .eq('business_id', businessId)
    .maybeSingle();

  await revalidateStore((data as { slug?: string } | null)?.slug ?? null, businessId);
}

// ── §36 — la présentation de la boutique ────────────────────────────────────

export type PresentationDraft = {
  intro: string;
  items: Array<{ title: string; body: string }>;
  /** Crédits restants après l'appel. */
  remaining: number;
};

/**
 * Les faits de la maison, lus en base.
 *
 * Trois lectures et pas une de plus : les réglages de la vitrine, les rayons,
 * quelques noms de produits. Ce qui n'est pas là ne sera pas écrit — c'est ce
 * qui empêche la présentation de promettre une ancienneté ou une garantie que
 * personne n'a saisies.
 */
async function storeFacts(businessId: string): Promise<StoreFacts> {
  const svc = getSupabaseService();

  const [{ data: settings }, { data: products }] = await Promise.all([
    svc
      .from('store_settings')
      .select(
        'store_name, tagline, contact_address, payment_methods, shipping_modes, '
        + 'whatsapp_number, template_id, theme_config',
      )
      .eq('business_id', businessId)
      .maybeSingle(),
    svc
      .from('products')
      .select('name, category')
      .eq('business_id', businessId)
      .eq('is_published_to_store', true)
      .limit(40),
  ]);

  const rows = (products ?? []) as Array<{ name: string | null; category: string | null }>;
  const store = (settings ?? {}) as Record<string, any>;

  const categories = [...new Set(rows.map((r) => r.category).filter(Boolean))] as string[];
  const names = rows.map((r) => r.name).filter(Boolean).slice(0, 10) as string[];

  const methods = Array.isArray(store.payment_methods) ? store.payment_methods : [];
  const modes = Array.isArray(store.shipping_modes) ? store.shipping_modes : [];

  const template = resolveTemplateId(store.template_id);
  const existing = store.theme_config?.presentation?.intro ?? null;

  return {
    storeName:  store.store_name ?? 'Boutique',
    tagline:    store.tagline ?? null,
    trade:      TEMPLATES[template]?.name ?? null,
    city:       store.contact_address ?? null,
    categories,
    products:   names,
    payments:   methods.map((m: string) => PAYMENT_WORDS[m] ?? m),
    shipping:   modes
      .filter((m: any) => m?.label)
      .map((m: any) => [m.label, m.days].filter(Boolean).join(' — ')),
    whatsapp:   Boolean(store.whatsapp_number),
    existing:   typeof existing === 'string' ? existing : null,
  };
}

/** Les modes de paiement, dans les mots de la vitrine et non ceux de la base. */
const PAYMENT_WORDS: Record<string, string> = {
  cash:     'Paiement à la livraison',
  moncash:  'MonCash',
  natcash:  'NatCash',
  visa:     'Carte Visa',
  card:     'Carte bancaire',
  transfer: 'Virement',
};

/**
 * Rédige la présentation. N'enregistre rien.
 *
 * Comme pour les fiches produits : le texte revient au navigateur, le marchand
 * le corrige, et c'est « Enregistrer le contenu » qui écrit. Une présentation
 * publiée d'autorité sur la page d'accueil d'un commerçant serait la pire des
 * écritures automatiques — c'est le texte que ses clients liront en premier.
 */
export async function draftStorePresentation(
  language: CopyLanguage = 'fr',
): Promise<ActionResult<PresentationDraft>> {
  return attempt(async () => {
  await assertFeature(COPY_FEATURE);
  const { businessId, userId } = await requirePermission('settings:write');

  const facts = await storeFacts(businessId);

  const { remaining } = await spendCredits(
    businessId, userId, 'store_presentation', `store:${businessId}`,
  );

  try {
    const draft = await writeStorePresentation(facts, language);
    return {
      intro: draft.intro,
      items: draft.items.slice(0, 4),
      remaining,
    };
  } catch (err) {
    await refundCredits(businessId, 'store_presentation', `store:${businessId}`);
    throw err;
  }
  });
}
