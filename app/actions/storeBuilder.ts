'use server';

// ─────────────────────────────────────────────────────────────────────────────
// Store Builder — les actions de l'éditeur
//
// Toutes passent par `getBusinessContext()` : l'entreprise vient du sélecteur,
// jamais de `owner_id` seul. Un compte qui tient deux commerces a deux vitrines,
// et l'éditeur doit modifier celle qui est ouverte.
//
// Toutes invalident le cache de la vitrine en sortant. Sans cela, le marchand
// change sa couleur, ouvre sa boutique, ne voit rien changer pendant cinq
// minutes, et conclut que l'enregistrement n'a pas marché — puis recommence.
//
// Toutes commencent par `assertFeature('online_store')`. Le verrou d'offre ne
// vivait que dans `components/nav.tsx`, c'est-à-dire dans le navigateur : un
// appel direct à ces actions ouvrait la boutique en ligne à n'importe quelle
// offre. « Ne jamais faire confiance uniquement au frontend » (§36 du cahier
// des charges) vaut aussi pour les server actions, qui sont des points
// d'entrée HTTP comme les autres.
//
// ── Toutes lisent et écrivent avec la SESSION du marchand ──────────────────
//
// `getBusinessContext().supabase`, jamais `getSupabaseService()`. L'éditeur ne
// touche que les lignes d'UNE entreprise — la sienne — et la RLS le permet
// déjà : `businesses`, `store_settings`, `products` et `store_sections` sont
// lisibles et modifiables par leur propriétaire (vérifié avec un compte réel).
//
// La clé de service n'y avait donc rien à faire, et elle coûtait deux choses.
//
//   Une PANNE. `getSupabaseService()` lève « SUPABASE_SERVICE_ROLE_KEY not
//   configured in .env.local » dès que la variable manque à l'environnement
//   qui sert la requête. Tout le reste de l'application continuait de
//   fonctionner, et l'éditeur de vitrine — lui seul — refusait de s'ouvrir.
//   Un écran de réglage ne doit pas dépendre d'un secret que sa tâche ne
//   réclame pas.
//
//   Un RISQUE. Le client de service contourne la RLS : la seule chose qui
//   empêchait un marchand de lire le catalogue d'un autre était le `.eq(
//   'business_id', …)` écrit à la main dans chaque requête. Un oubli, une
//   résolution d'entreprise fautive, et la base ne disait plus non. Avec la
//   session, la RLS redevient la barrière, et le filtre applicatif n'est plus
//   qu'une commodité.
//
// La vitrine PUBLIQUE, elle, garde la clé de service (app/actions/store-public.ts) :
// son visiteur n'a pas de compte, donc pas de session, et aucune politique RLS
// ne peut le reconnaître.
// ─────────────────────────────────────────────────────────────────────────────

import { revalidatePath } from 'next/cache';
import { assertFeature, FeatureLockedError } from '../../lib/entitlements';
import { getBusinessContext, isTransportFailure, requirePermission } from '../../lib/serverAuth';
import { revalidateStore } from '../../lib/storefrontData';
import {
  themeConfigSchema, parseThemeConfig, slugify, validateSlug,
  isTemplateId, storePublicUrl, themeForStorage, hasLegacyColorChoice,
  LEGACY_DEFAULT_COLORS, type ThemeConfig,
} from '../../lib/storeTheme';
import {
  resolveSections, isSectionKey, sectionConfigSchema,
  type ResolvedSection, type StoredSection,
} from '../../lib/storeSections';
import { attempt, UserFacingError, type ActionResult } from '../../lib/actionResult';

export type BuilderProduct = {
  id:                    string;
  name:                  string;
  category:              string | null;
  price:                 number;
  stock:                 number;
  image_url:             string | null;
  enhanced_image_url:    string | null;
  is_published_to_store: boolean;
  /** Alimente « Produits mis en avant » et « Produit à la une » (lib/storefrontHome.ts). */
  is_featured:           boolean;
  store_description:     string | null;
};

export type BuilderState = {
  storeId:       string | null;
  businessId:    string;
  businessName:  string;
  slug:          string;
  isActive:      boolean;
  storeName:     string;
  tagline:       string;
  logoUrl:       string | null;
  templateId:    string;
  theme:         ThemeConfig;
  /**
   * Vrai quand le marchand a déjà enregistré SES couleurs.
   *
   * L'éditeur en a besoin pour se comporter comme l'aperçu. Tant que la
   * réponse est non, changer de gabarit change la palette — c'est ce que
   * l'aperçu montre, et ce que la vitrine rendra. Dès qu'elle est oui, la
   * palette du marchand tient, gabarit compris : personne ne défait à sa place
   * un réglage qu'il a fait exprès.
   *
   * Sans ce drapeau, l'éditeur enregistrait le nouveau gabarit AVEC les
   * anciennes couleurs, gelait la palette pour toujours, et faisait mentir
   * l'aperçu au moment précis où le marchand le suivait.
   */
  ownsPalette:   boolean;
  customDomain:  string | null;
  whatsappNumber: string;
  currency:      string;
  publicUrl:     string;
  products:      BuilderProduct[];
  publishedCount: number;
  /**
   * Les sections de la page d'accueil, dans leur ordre courant.
   *
   * Déjà résolues : le préréglage du gabarit, corrigé par ce que le marchand a
   * enregistré. L'éditeur n'a donc pas à connaître la règle de fusion, et il
   * montre exactement ce que la vitrine rendra.
   */
  sections:      ResolvedSection[];
};

/**
 * Ce que l'éditeur reçoit : son état, ou la RAISON de ne pas l'avoir.
 *
 * ── Pourquoi un résultat et non une exception ──────────────────────────────
 *
 * Next.js REMPLACE le message de toute erreur levée dans une server action par
 * un texte générique en production — « An error occurred in the Server
 * Components render. The specific message is omitted… ». C'est une protection
 * utile (une erreur de base ne doit pas fuir vers le navigateur) et elle ne se
 * désactive pas.
 *
 * Conséquence : `throw new Error('Fonctionnalité disponible à partir de
 * l'offre Kwasans')` n'arrive JAMAIS jusqu'au marchand. Il lit une phrase en
 * anglais qui parle de composants serveur, sur l'écran de sa boutique, et il
 * n'a aucun moyen de savoir s'il doit réessayer, changer d'offre, ou appeler
 * quelqu'un. C'est ce qui est arrivé ici.
 *
 * Un résultat RETOURNÉ, lui, traverse la frontière intact. Les trois cas sont
 * ceux que /apercu distingue déjà — et pour la même raison : une destination
 * verrouillée doit se voir (§4.2), une panne réseau doit se réessayer, et on
 * ne confond jamais les deux.
 */
export type BuilderLoad =
  | { ok: true;  state: BuilderState }
  | { ok: false; reason: 'locked' | 'unreachable' | 'failed'; message: string };

// ── Lecture ─────────────────────────────────────────────────────────────────

export async function getBuilderState(): Promise<BuilderLoad> {
  try {
    return { ok: true, state: await readBuilderState() };
  } catch (err) {
    // L'offre ne couvre pas la boutique : ce n'est pas une panne, et l'écran
    // le dira avec le nom de l'offre qui l'ouvre.
    if (err instanceof FeatureLockedError) {
      return { ok: false, reason: 'locked', message: err.message };
    }
    // Compte injoignable : on ne sait rien de l'offre, donc on n'en dit rien.
    // Annoncer un verrou ici reviendrait à réclamer de l'argent à cause d'un
    // délai réseau.
    if (isTransportFailure(err)) {
      return {
        ok: false,
        reason: 'unreachable',
        message:
          "Nous n'avons pas pu joindre votre compte — c'est la connexion, pas "
          + 'votre boutique. Réessayez dans un instant.',
      };
    }
    // Le reste : journalisé côté serveur, où le message complet est lisible,
    // et résumé côté marchand.
    console.error('[getBuilderState] lecture impossible :', err);
    return {
      ok: false,
      reason: 'failed',
      message: err instanceof Error && err.message
        ? err.message
        : "Votre vitrine n'a pas pu être lue.",
    };
  }
}

async function readBuilderState(): Promise<BuilderState> {
  await assertFeature('online_store');
  const { businessId, supabase: db } = await getBusinessContext();

  const [businessRes, storeRes, productsRes] = await Promise.all([
    db.from('businesses').select('name, whatsapp_number, default_currency').eq('id', businessId).maybeSingle(),
    db.from('store_settings').select('*').eq('business_id', businessId).maybeSingle(),
    db
      .from('products')
      // Cadré par entreprise, exactement comme la vitrine publique
      // (app/actions/store-public.ts). Les deux listes doivent coïncider :
      // sinon le marchand coche des produits dans l'éditeur sans savoir
      // lesquels partent réellement en ligne.
      .select('id, name, category, sale_price, purchase_price, stock_quantity, image_url, enhanced_image_url, is_published_to_store, is_featured, store_description')
      .eq('business_id', businessId)
      .order('name', { ascending: true })
      .limit(500),
  ]);

  const business = businessRes.data as any;
  const store    = storeRes.data as any;

  const products: BuilderProduct[] = (productsRes.data ?? []).map((p: any) => ({
    id:                    p.id,
    name:                  p.name,
    category:              p.category ?? null,
    price:                 Number(p.sale_price ?? p.purchase_price ?? 0),
    stock:                 Number(p.stock_quantity ?? 0),
    image_url:             p.image_url ?? null,
    enhanced_image_url:    p.enhanced_image_url ?? null,
    is_published_to_store: p.is_published_to_store === true,
    is_featured:           p.is_featured === true,
    store_description:     p.store_description ?? null,
  }));

  const slug = store?.slug ?? slugify(business?.name ?? 'ma-boutique');

  const templateId = isTemplateId(store?.template_id) ? store.template_id : 'modern';

  // Lue après le reste : elle dépend du gabarit, qui fournit l'ordre de départ.
  // La lecture est tolérante à une table absente (migration non jouée) — comme
  // la vitrine, l'éditeur retombe alors sur le préréglage.
  //
  // Lue ICI avec la session, pas via `getStoreSections()` (store-content.ts) :
  // celle-ci sert la vitrine publique et passe donc par la clé de service. C'est
  // par elle que l'éditeur réclamait encore la clé après le passage à la session.
  const { data: storedSections, error: sectionsError } = await db
    .from('store_sections')
    .select('section_key, position, is_enabled, config')
    .eq('business_id', businessId)
    .order('position', { ascending: true });
  const sections = resolveSections(
    templateId,
    sectionsError || !storedSections ? [] : (storedSections as StoredSection[]),
  );

  return {
    storeId:      store?.id ?? null,
    businessId,
    businessName: business?.name ?? 'Mon entreprise',
    slug,
    isActive:     store?.is_active === true,
    storeName:    store?.store_name ?? business?.name ?? '',
    tagline:      store?.tagline ?? '',
    logoUrl:      store?.logo_url ?? null,
    templateId,
    // Le gabarit sert de source aux couleurs de départ : l'éditeur doit montrer
    // au marchand la palette qu'il verra en ligne, pas celle du produit.
    theme: parseThemeConfig(
      store?.theme_config,
      { primary_color: store?.primary_color, secondary_color: store?.secondary_color },
      store?.template_id,
    ),
    ownsPalette:
      (typeof store?.theme_config === 'object' &&
        store.theme_config !== null &&
        'palette' in (store.theme_config as object)) ||
      hasLegacyColorChoice(store),
    customDomain:   store?.custom_domain ?? null,
    whatsappNumber: store?.whatsapp_number ?? business?.whatsapp_number ?? '',
    currency:       store?.currency ?? business?.default_currency ?? 'HTG',
    publicUrl:      storePublicUrl({ slug, custom_domain: store?.custom_domain ?? null }),
    products,
    publishedCount: products.filter((p) => p.is_published_to_store).length,
    sections,
  };
}

// ── Écriture ────────────────────────────────────────────────────────────────

/**
 * Enregistre l'onglet Général : identité, sous-domaine, WhatsApp.
 *
 * Le slug est validé ici ET par une contrainte SQL. Les deux barrières sont
 * volontaires : celle-ci donne un message lisible au marchand, celle de la base
 * protège contre une écriture qui ne passerait pas par cet écran.
 */
export async function saveGeneral(input: {
  storeName:      string;
  tagline:        string;
  slug:           string;
  logoUrl:        string | null;
  whatsappNumber: string;
  isActive:       boolean;
}): Promise<{ slug: string; publicUrl: string }> {
  await assertFeature('online_store');
  await requirePermission('settings:write');
  const { businessId, supabase: db } = await getBusinessContext();

  const slug = slugify(input.slug);
  const check = validateSlug(slug);
  if (!check.ok) throw new Error(check.reason);

  // Un slug déjà pris se constate à l'écriture, pas avant.
  //
  // Une lecture préalable cherchait la ligne d'une AUTRE vitrine portant ce
  // slug. Elle ne le peut plus, et c'est très bien : la RLS n'expose au
  // marchand que SES lignes, ce qui est exactement la propriété recherchée —
  // il n'a pas à savoir quelles adresses ses concurrents occupent.
  //
  // Deux raisons de ne pas la regretter. La contrainte d'unicité SQL a
  // toujours été la vraie barrière ; la lecture ne servait qu'à formuler la
  // phrase. Et entre la lecture et l'écriture, deux marchands qui choisissent
  // la même adresse à la même seconde passaient tous les deux le contrôle —
  // c'est la base qui tranchait, avec un message illisible. Lire le code
  // d'erreur supprime la course en même temps que la lecture.
  const { data: previous } = await db
    .from('store_settings')
    .select('slug')
    .eq('business_id', businessId)
    .maybeSingle();

  const { error } = await db.from('store_settings').upsert(
    {
      business_id:     businessId,
      slug,
      store_name:      input.storeName.trim() || null,
      tagline:         input.tagline.trim() || null,
      logo_url:        input.logoUrl,
      whatsapp_number: input.whatsappNumber.trim() || null,
      is_active:       input.isActive,
      published_at:    input.isActive ? new Date().toISOString() : null,
    },
    { onConflict: 'business_id' },
  );
  // 23505 : violation d'unicité. Sur cette table, une seule colonne est unique
  // en plus de la clé — le slug. Le marchand lit donc pourquoi son adresse est
  // refusée, au lieu de « duplicate key value violates unique constraint ».
  if (error?.code === '23505') {
    throw new UserFacingError(`L'adresse « ${slug} » est déjà utilisée par une autre boutique.`);
  }
  if (error) throw new Error(`Enregistrement impossible : ${error.message}`);

  // L'ancien slug est invalidé lui aussi : sans ça, l'ancienne adresse continue
  // de servir la version en cache après un changement de nom.
  await revalidateStore(previous?.slug ?? null, businessId);
  await revalidateStore(slug, businessId);
  revalidatePath('/boutique');

  return { slug, publicUrl: storePublicUrl({ slug, custom_domain: null }) };
}

/** Enregistre l'onglet Design : gabarit et thème. */
export async function saveDesign(input: {
  templateId: string;
  theme:      unknown;
  /** Le marchand a choisi ses couleurs — voir `BuilderState.ownsPalette`. */
  ownsPalette: boolean;
}): Promise<void> {
  await assertFeature('online_store');
  await requirePermission('settings:write');
  const { businessId, supabase: db } = await getBusinessContext();

  if (!isTemplateId(input.templateId)) throw new UserFacingError('Gabarit inconnu.');

  // Le thème est revalidé avant écriture : ce qui entre en base est toujours un
  // objet complet et conforme, jamais le JSON brut d'un formulaire.
  const theme = themeConfigSchema.parse(input.theme ?? {});

  const { data: store } = await db
    .from('store_settings')
    .select('slug')
    .eq('business_id', businessId)
    .maybeSingle();

  if (!store?.slug) {
    throw new UserFacingError("Enregistrez d'abord le nom et l'adresse de la boutique.");
  }

  // Des couleurs que le marchand n'a pas choisies ne s'écrivent pas : elles
  // figeraient la palette de ce gabarit sur tous les autres (`themeForStorage`).
  // Les colonnes héritées reviennent alors à leur défaut, que `parseThemeConfig`
  // lit comme une absence de choix — sinon ce seraient elles qui repeindraient
  // chaque gabarit.
  const owns = input.ownsPalette === true;

  const { error } = await db
    .from('store_settings')
    .update({
      template_id:  input.templateId,
      theme_config: themeForStorage(
        theme,
        owns ? { palette: theme.palette, typography: theme.typography } : {},
      ),
      // Les deux colonnes héritées restent synchronisées : d'anciens écrans
      // (aperçu, e-mails de commande) les lisent encore.
      primary_color:   owns ? theme.palette.primary : LEGACY_DEFAULT_COLORS.primary,
      secondary_color: owns ? theme.palette.accent  : LEGACY_DEFAULT_COLORS.accent,
    })
    .eq('business_id', businessId);

  if (error) throw new Error(`Enregistrement impossible : ${error.message}`);

  await revalidateStore(store.slug, businessId);
  revalidatePath('/boutique');
}

/**
 * Applique un gabarit, et lui seul.
 *
 * C'est le bouton de l'écran d'aperçu : le marchand a vu SA boutique dans ce
 * gabarit, il le prend. Ni couleurs ni contenu ne sont touchés — et c'est ce
 * qui rend l'aperçu honnête, puisqu'il est rendu avec exactement le thème que
 * cette action laisse en place.
 */
export async function applyTemplate(templateId: string): Promise<ActionResult> {
  return attempt(async () => {
  await assertFeature('online_store');
  await requirePermission('settings:write');
  const { businessId, supabase: db } = await getBusinessContext();

  if (!isTemplateId(templateId)) throw new UserFacingError('Gabarit inconnu.');

  const { data: store } = await db
    .from('store_settings')
    .select('slug')
    .eq('business_id', businessId)
    .maybeSingle();

  if (!store?.slug) {
    throw new UserFacingError("Enregistrez d'abord le nom et l'adresse de la boutique.");
  }

  const { error } = await db
    .from('store_settings')
    .update({ template_id: templateId })
    .eq('business_id', businessId);

  if (error) throw new Error(`Enregistrement impossible : ${error.message}`);

  await revalidateStore(store.slug, businessId);
  revalidatePath('/boutique');
  });
}

/**
 * Enregistre l'onglet Contenu : ce que les sections affichent.
 *
 * Même écriture que `saveDesign`, sans le gabarit. Les deux sont séparées parce
 * que les deux écrans le sont : changer un texte de bannière ne doit pas
 * réenregistrer un gabarit que le marchand n'a pas rouvert — et surtout pas
 * celui que l'autre onglet a en mémoire depuis dix minutes.
 */
export async function saveContent(theme: unknown): Promise<void> {
  await assertFeature('online_store');
  await requirePermission('settings:write');
  const { businessId, supabase: db } = await getBusinessContext();

  const parsed = themeConfigSchema.parse(theme ?? {});

  const { data: store } = await db
    .from('store_settings')
    .select('slug, theme_config')
    .eq('business_id', businessId)
    .maybeSingle();

  if (!store?.slug) {
    throw new UserFacingError("Enregistrez d'abord le nom et l'adresse de la boutique.");
  }

  // Cet onglet n'édite ni couleurs ni typographie : il garde celles de la base
  // telles quelles — présentes si le marchand les a choisies, absentes sinon.
  // Écrire celles du thème reçu, résolues depuis le gabarit, les figeait.
  const raw = store.theme_config && typeof store.theme_config === 'object'
    ? (store.theme_config as Record<string, unknown>)
    : {};

  const { error } = await db
    .from('store_settings')
    .update({
      theme_config: themeForStorage(parsed, { palette: raw.palette, typography: raw.typography }),
    })
    .eq('business_id', businessId);

  if (error) throw new Error(`Enregistrement impossible : ${error.message}`);

  await revalidateStore(store.slug, businessId);
  revalidatePath('/boutique');
}

/**
 * Enregistre l'ordre, l'activation et le réglage des sections (§6).
 *
 * La position est l'INDEX dans la liste reçue, jamais un nombre venu du
 * navigateur : deux sections à la même position donneraient un ordre dépendant
 * de l'ordre de lecture de PostgreSQL, c'est-à-dire un ordre qui change tout
 * seul entre deux visites.
 *
 * Les lignes sont écrites en une fois par `upsert` sur (business_id,
 * section_key) — la clé unique de la table. Une clé que le code ne connaît pas
 * est écartée ici : c'est la même règle qu'au rendu, où elle est ignorée.
 */
export async function saveSections(
  input: Array<{ key: string; enabled: boolean; title: string; limit: number }>,
): Promise<void> {
  await assertFeature('online_store');
  await requirePermission('settings:write');
  const { businessId, supabase: db } = await getBusinessContext();

  const rows = input
    .filter((s) => isSectionKey(s.key))
    .map((s, index) => ({
      business_id: businessId,
      section_key: s.key,
      position:    index,
      is_enabled:  s.enabled === true,
      config:      sectionConfigSchema.parse({ title: s.title, limit: s.limit }),
    }));

  if (rows.length === 0) return;

  const { error } = await db
    .from('store_sections')
    .upsert(rows, { onConflict: 'business_id,section_key' });

  if (error) {
    // La table peut manquer si la migration du catalogue n'a pas été jouée.
    // Le dire en clair vaut mieux qu'un message de PostgREST : c'est une action
    // à mener sur la base, pas une erreur de saisie.
    throw new Error(
      /store_sections/.test(error.message)
        ? "L'organisation des sections n'est pas encore disponible sur cette base : la migration du catalogue n'a pas été appliquée."
        : `Enregistrement impossible : ${error.message}`,
    );
  }

  const { data: store } = await db
    .from('store_settings')
    .select('slug')
    .eq('business_id', businessId)
    .maybeSingle();

  if (store?.slug) await revalidateStore(store.slug, businessId);
  revalidatePath('/boutique');
}

/**
 * Publie ou retire un produit de la vitrine.
 *
 * Cadré par `business_id` seul. Le `.or(user_id, business_id)` précédent était
 * plus large que le catalogue affiché : il laissait un propriétaire de deux
 * commerces publier, depuis la vitrine de l'un, un produit de l'autre.
 */
export async function toggleProductPublication(
  productId: string,
  published: boolean,
): Promise<void> {
  await assertFeature('online_store');
  const { businessId, supabase: db } = await requirePermission('products:write');

  const { error } = await db
    .from('products')
    .update({ is_published_to_store: published })
    .eq('id', productId)
    .eq('business_id', businessId);

  if (error) throw new Error(`Publication impossible : ${error.message}`);
  await refreshStorefront(businessId);
}

/**
 * Met un produit en avant, ou l'en retire.
 *
 * `is_featured` n'avait aucun écran pour l'écrire : le merchandising conseillait
 * « Mettre en avant » sans geste possible. Même cadrage que la publication.
 */
export async function toggleProductFeatured(
  productId: string,
  featured: boolean,
): Promise<void> {
  await assertFeature('online_store');
  const { businessId, supabase: db } = await requirePermission('products:write');

  const { error } = await db
    .from('products')
    .update({ is_featured: featured })
    .eq('id', productId)
    .eq('business_id', businessId);

  if (error) throw new Error(`Mise en avant impossible : ${error.message}`);
  await refreshStorefront(businessId);
}

/** Publie ou retire tout le catalogue d'un coup. */
export async function setAllProductsPublication(published: boolean): Promise<number> {
  await assertFeature('online_store');
  const { businessId, supabase: db } = await requirePermission('products:write');

  const { data, error } = await db
    .from('products')
    .update({ is_published_to_store: published })
    .eq('business_id', businessId)
    .select('id');

  if (error) throw new Error(`Opération impossible : ${error.message}`);
  await refreshStorefront(businessId);
  return data?.length ?? 0;
}

/**
 * Rattache un domaine acheté par le marchand.
 *
 * On enregistre le domaine sans le vérifier : la vérification DNS est un
 * aller-retour avec le registrar et le fournisseur d'hébergement, et le
 * marchand doit pouvoir coller son domaine avant que le CNAME se propage.
 * `domain_verified_at` reste donc nul jusqu'à ce qu'une première requête
 * arrive réellement sur cet hôte.
 */
export async function setCustomDomain(domain: string | null): Promise<void> {
  await assertFeature('online_store');
  await requirePermission('settings:write');
  const { businessId, supabase: db } = await getBusinessContext();

  let normalized: string | null = null;
  if (domain && domain.trim()) {
    normalized = domain
      .trim()
      .toLowerCase()
      .replace(/^https?:\/\//, '')
      .replace(/\/.*$/, '');

    if (!/^[a-z0-9][a-z0-9.-]{2,251}[a-z0-9]\.[a-z]{2,}$/.test(normalized)) {
      throw new UserFacingError('Ce nom de domaine ne semble pas valide (exemple : maboutique.com).');
    }
    // Même raisonnement que pour le slug dans `saveGeneral` : avec la session,
    // la RLS cache les domaines des autres boutiques, donc une lecture préalable
    // ne trouverait jamais le doublon. L'index unique sur lower(custom_domain)
    // tranche à l'écriture — on traduit son code plus bas.
  }

  const { data: store } = await db
    .from('store_settings')
    .select('slug')
    .eq('business_id', businessId)
    .maybeSingle();

  const { error } = await db
    .from('store_settings')
    .update({ custom_domain: normalized, domain_verified_at: null })
    .eq('business_id', businessId);

  // 23505 : l'index unique idx_store_settings_custom_domain — le domaine est
  // déjà rattaché à une autre boutique.
  if (error?.code === '23505') {
    throw new UserFacingError('Ce domaine est déjà rattaché à une autre boutique.');
  }
  if (error) throw new Error(`Enregistrement impossible : ${error.message}`);

  await revalidateStore(store?.slug ?? null, businessId);
  revalidatePath('/boutique');
}

async function refreshStorefront(businessId: string) {
  const { supabase: db } = await getBusinessContext();
  const { data } = await db
    .from('store_settings')
    .select('slug')
    .eq('business_id', businessId)
    .maybeSingle();

  await revalidateStore(data?.slug ?? null, businessId);
  revalidatePath('/boutique');
}
