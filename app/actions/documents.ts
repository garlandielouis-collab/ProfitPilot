'use server';

// ─────────────────────────────────────────────────────────────────────────────
// Le centre documentaire — lectures et écritures
//
// ── Ce que ce fichier ne fait PAS, et pourquoi ──────────────────────────────
//
// Il ne filtre jamais par rôle ni par visibilité. La politique RLS le fait
// déjà, en appelant `can_read_document()` sur chaque ligne. Refaire ce filtrage
// ici donnerait deux règles à maintenir, et le jour où elles divergeraient,
// c'est la plus permissive des deux qui gagnerait — celle de l'application,
// puisque c'est elle qui construit la requête.
//
// La conséquence est agréable : ces fonctions écrivent la requête qu'elles
// veulent, et la base ne rend que ce que l'utilisateur a le droit de voir.
//
// Le cadrage par entreprise, lui, reste explicite (`.eq('business_id', …)`).
// RLS le couvre aussi, mais un `business_id` écrit noir sur blanc est ce qui
// permet de relire une requête et de savoir de quel commerce elle parle.
// ─────────────────────────────────────────────────────────────────────────────

import { revalidatePath } from 'next/cache';

import { getBusinessContext } from '../../lib/serverAuth';
import { assertAccess, assertPermission } from '../../lib/entitlements';
import { logActivity } from '../../lib/activityLog';
import { localizeBlocks, parseBlocks, type PlainBlock } from '../../lib/documents/blocks';
import {
  expirationState, daysUntilExpiration, todayISO,
  type DocumentCategory, type DocumentEntityType, type DocumentRelation,
  type DocumentSensitivity, type DocumentStatus,
  type DocumentVisibility, type ExpirationState,
} from '../../lib/documents/types';
import { attempt, UserFacingError, type ActionResult } from '../../lib/actionResult';

const FEATURE = 'documents' as const;

// ─────────────────────────────────────────────────────────────────────────────
// Formes rendues à l'interface
// ─────────────────────────────────────────────────────────────────────────────

export type DocumentSummary = {
  id:          string;
  name:        string;
  description: string | null;
  status:      DocumentStatus;
  visibility:  DocumentVisibility;

  typeKey:     string | null;
  typeLabelFr: string | null;
  typeLabelHt: string | null;
  category:    DocumentCategory | null;
  sensitivity: DocumentSensitivity;

  expiresOn:   string | null;
  expiration:  ExpirationState;
  daysLeft:    number | null;

  mimeType:    string | null;
  sizeBytes:   number | null;
  version:     number;
  /** Un fichier déposé — par opposition à un document écrit dans l'application
   *  (§20), qui n'a pas d'objet de stockage mais un corps de blocs. */
  hasFile:     boolean;
  isDynamic:   boolean;
  tags:        string[];

  createdAt:   string;
  updatedAt:   string;
};

export type DocumentTypeOption = {
  id:          string;
  key:         string;
  category:    DocumentCategory;
  labelFr:     string;
  labelHt:     string;
  sensitivity: DocumentSensitivity;
  requiresExpiration: boolean;
  isDynamic:   boolean;
  defaultVisibility: DocumentVisibility;
};

export type DocumentFilters = {
  search?:     string;
  category?:   DocumentCategory | 'all';
  status?:     DocumentStatus | 'all';
  expiration?: ExpirationState | 'all';
  typeKey?:    string;
  tag?:        string;
  limit?:      number;
  offset?:     number;
};

// Les colonnes lues partout. Le type est embarqué via la clé étrangère
// `document_type_id` — PostgREST sait faire la jointure, inutile d'une vue.
const SELECT_COLUMNS = `
  id, name, description, status, visibility,
  expires_on, mime_type, size_bytes, current_version, is_dynamic, tags,
  storage_path,
  created_at, updated_at,
  document_types ( key, category, label_fr, label_ht, sensitivity )
`;

type Row = {
  id: string; name: string; description: string | null;
  status: string; visibility: string;
  expires_on: string | null; mime_type: string | null; size_bytes: number | null;
  storage_path: string | null;
  current_version: number | null; is_dynamic: boolean | null; tags: string[] | null;
  created_at: string; updated_at: string;
  document_types: {
    key: string; category: string; label_fr: string; label_ht: string; sensitivity: string;
  } | null;
};

function toSummary(row: Row, today: string): DocumentSummary {
  const type = row.document_types;
  return {
    id:          row.id,
    name:        row.name,
    description: row.description,
    status:      (row.status as DocumentStatus) ?? 'active',
    visibility:  (row.visibility as DocumentVisibility) ?? 'company',

    typeKey:     type?.key ?? null,
    typeLabelFr: type?.label_fr ?? null,
    typeLabelHt: type?.label_ht ?? null,
    category:    (type?.category as DocumentCategory) ?? null,
    // Type inconnu : la lecture la plus prudente, exactement comme le fait
    // `can_read_document()` côté base.
    sensitivity: (type?.sensitivity as DocumentSensitivity) ?? 'general',

    expiresOn:   row.expires_on,
    expiration:  expirationState(row.expires_on, today),
    daysLeft:    daysUntilExpiration(row.expires_on, today),

    mimeType:    row.mime_type,
    sizeBytes:   row.size_bytes,
    version:     row.current_version ?? 1,
    hasFile:     Boolean(row.storage_path),
    isDynamic:   row.is_dynamic ?? false,
    tags:        row.tags ?? [],

    createdAt:   row.created_at,
    updatedAt:   row.updated_at,
  };
}

/**
 * Un terme de recherche qui ne peut pas casser la grammaire PostgREST.
 *
 * `.or()` prend une CHAÎNE que PostgREST analyse : une virgule, une parenthèse
 * ou un point y sont des séparateurs. Y injecter le texte du marchand tel quel
 * permet de réécrire le filtre — c'est exactement ce que fait encore
 * `listActivityLogs()`, et c'est noté comme risque n° 12 de l'audit.
 *
 * On ne garde donc que des lettres, des chiffres et des espaces. Un marchand
 * qui cherche « licence » n'a jamais besoin d'une parenthèse ; celui qui en
 * met une cherche autre chose.
 */
function safeSearchTerm(raw: string): string {
  return raw
    .normalize('NFC')
    .replace(/[^\p{L}\p{N}\s-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);
}

// ─────────────────────────────────────────────────────────────────────────────
// Le catalogue des types
// ─────────────────────────────────────────────────────────────────────────────

export async function listDocumentTypes(): Promise<ActionResult<DocumentTypeOption[]>> {
  return attempt(async () => {
  await assertAccess(FEATURE, 'documents:read');
  const { supabase, businessId } = await getBusinessContext();

  // Catalogue global (business_id NULL) + types propres à l'entreprise.
  const { data, error } = await supabase
    .from('document_types')
    .select('id, key, category, label_fr, label_ht, sensitivity, requires_expiration, is_dynamic, default_visibility, business_id, sort_order')
    .or(`business_id.is.null,business_id.eq.${businessId}`)
    .eq('is_active', true)
    .order('sort_order', { ascending: true });

  if (error) throw new Error(error.message);

  return (data ?? []).map((r: any) => ({
    id:          r.id,
    key:         r.key,
    category:    r.category as DocumentCategory,
    labelFr:     r.label_fr,
    labelHt:     r.label_ht,
    sensitivity: r.sensitivity as DocumentSensitivity,
    requiresExpiration: !!r.requires_expiration,
    isDynamic:   !!r.is_dynamic,
    defaultVisibility: (r.default_visibility as DocumentVisibility) ?? 'company',
  }));
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// La bibliothèque
// ─────────────────────────────────────────────────────────────────────────────

export async function listDocuments(
  filters: DocumentFilters = {},
): Promise<ActionResult<{ documents: DocumentSummary[]; total: number }>> {
  return attempt(async () => {
  await assertAccess(FEATURE, 'documents:read');
  const { supabase, businessId } = await getBusinessContext();

  const limit  = Math.min(Math.max(filters.limit ?? 50, 1), 200);
  const offset = Math.max(filters.offset ?? 0, 0);
  const today  = todayISO();

  // Filtrer SUR le type embarqué exige une jointure interne : sans `!inner`,
  // PostgREST applique le filtre à l'embarquement et laisse passer les
  // documents sans type, avec un `document_types` à `null`. Un document non
  // classé apparaîtrait alors dans toutes les catégories à la fois.
  const filtersOnType = Boolean((filters.category && filters.category !== 'all') || filters.typeKey);
  const select = filtersOnType
    ? SELECT_COLUMNS.replace('document_types (', 'document_types!inner (')
    : SELECT_COLUMNS;

  let q = supabase
    .from('documents')
    .select(select, { count: 'exact' })
    .eq('business_id', businessId)
    .is('deleted_at', null);

  // « Archivé » est un statut, pas une corbeille : il ne s'affiche que si on le
  // demande. Sans cette règle, la bibliothèque se remplirait de ce que le
  // marchand a justement rangé pour ne plus le voir.
  if (filters.status && filters.status !== 'all') q = q.eq('status', filters.status);
  else q = q.neq('status', 'archived');

  if (filters.category && filters.category !== 'all') q = q.eq('document_types.category', filters.category);
  if (filters.typeKey) q = q.eq('document_types.key', filters.typeKey);
  if (filters.tag)     q = q.contains('tags', [filters.tag]);

  if (filters.search) {
    const term = safeSearchTerm(filters.search);
    if (term) q = q.or(`name.ilike.%${term}%,description.ilike.%${term}%`);
  }

  // L'expiration se filtre sur `expires_on` (DATE), jamais sur `expires_at` :
  // comparer un instant à « aujourd'hui » dépendrait du fuseau de la session.
  if (filters.expiration && filters.expiration !== 'all') {
    const horizon = new Date(`${today}T00:00:00Z`);
    horizon.setUTCDate(horizon.getUTCDate() + 30);
    const in30 = horizon.toISOString().slice(0, 10);

    if (filters.expiration === 'expired')       q = q.lt('expires_on', today);
    if (filters.expiration === 'expiring_soon') q = q.gte('expires_on', today).lte('expires_on', in30);
    if (filters.expiration === 'valid')         q = q.gt('expires_on', in30);
    if (filters.expiration === 'none')          q = q.is('expires_on', null);
  }

  const { data, count, error } = await q
    .order('updated_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) throw new Error(error.message);

  return {
    documents: (data ?? []).map((r) => toSummary(r as unknown as Row, today)),
    total:     count ?? 0,
  };
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// L'accueil du module (§4, §6)
// ─────────────────────────────────────────────────────────────────────────────

export type DocumentsOverview = {
  /** `true` si l'entreprise n'a aucun document : l'écran bascule en FirstRun. */
  empty:          boolean;
  total:          number;
  expiringSoon:   DocumentSummary[];
  expired:        DocumentSummary[];
  recent:         DocumentSummary[];
  /** Nombre de documents par catégorie, pour la répartition. */
  byCategory:     Array<{ category: DocumentCategory; count: number }>;
};

export async function getDocumentsOverview(): Promise<DocumentsOverview> {
  await assertAccess(FEATURE, 'documents:read');
  const { supabase, businessId } = await getBusinessContext();
  const today = todayISO();

  const horizon = new Date(`${today}T00:00:00Z`);
  horizon.setUTCDate(horizon.getUTCDate() + 30);
  const in30 = horizon.toISOString().slice(0, 10);

  const base = () => supabase
    .from('documents')
    .select(SELECT_COLUMNS)
    .eq('business_id', businessId)
    .is('deleted_at', null)
    .neq('status', 'archived');

  const [countRes, soonRes, expiredRes, recentRes] = await Promise.all([
    supabase.from('documents')
      .select('id', { count: 'exact', head: true })
      .eq('business_id', businessId).is('deleted_at', null),
    base().gte('expires_on', today).lte('expires_on', in30)
      .order('expires_on', { ascending: true }).limit(8),
    base().lt('expires_on', today)
      .order('expires_on', { ascending: false }).limit(8),
    base().order('updated_at', { ascending: false }).limit(6),
  ]);

  const map = (rows: unknown) => ((rows ?? []) as Row[]).map((r) => toSummary(r, today));
  const total = countRes.count ?? 0;

  // La répartition se compte sur ce qui est lisible, donc après RLS. Une seule
  // lecture des catégories plutôt que six requêtes de comptage.
  const { data: catRows } = await supabase
    .from('documents')
    .select('document_types!inner ( category )')
    .eq('business_id', businessId)
    .is('deleted_at', null)
    .neq('status', 'archived');

  // L'embarquement se lit dans les deux formes. PostgREST rend un OBJET pour
  // une relation « plusieurs vers un » — c'est le cas ici, `document_type_id`
  // pointant vers une seule ligne — mais les types générés décrivent un tableau
  // tant que `lib/database.types.ts` n'a pas été régénéré après la migration
  // qui a créé la clé étrangère. Accepter les deux évite de faire dépendre le
  // comptage d'une génération de types qui se fait à la main.
  type CategoryEmbed = { category: string } | Array<{ category: string }> | null;

  const tally = new Map<DocumentCategory, number>();
  for (const row of (catRows ?? []) as unknown as Array<{ document_types: CategoryEmbed }>) {
    const embedded = Array.isArray(row.document_types) ? row.document_types[0] : row.document_types;
    const c = embedded?.category as DocumentCategory | undefined;
    if (c) tally.set(c, (tally.get(c) ?? 0) + 1);
  }

  return {
    empty:        total === 0,
    total,
    expiringSoon: map(soonRes.data),
    expired:      map(expiredRes.data),
    recent:       map(recentRes.data),
    byCategory:   [...tally.entries()].map(([category, count]) => ({ category, count })),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Un document
// ─────────────────────────────────────────────────────────────────────────────

export type DocumentVersionRow = {
  id: string; version: number; label: string | null;
  origin: 'user' | 'ai' | 'system';
  mimeType: string | null; sizeBytes: number | null; createdAt: string;
};

export type DocumentDetail = DocumentSummary & {
  versions: DocumentVersionRow[];
  links:    Array<{ id: string; entityType: string; entityId: string; relation: string }>;
  /** Le corps d'un document écrit (§20). `null` pour un fichier déposé. */
  contentBlocks: PlainBlock[] | null;
  templateId:    string | null;
};

export async function getDocument(id: string): Promise<ActionResult<DocumentDetail | null>> {
  return attempt(async () => {
  await assertAccess(FEATURE, 'documents:read');
  const { supabase, businessId } = await getBusinessContext();
  const today = todayISO();

  // Pas de `.single()` : une ligne refusée par RLS revient VIDE, pas en erreur.
  // `.single()` lèverait « JSON object requested, 0 rows » — un message qui
  // ferait chercher un bug de requête là où il n'y a qu'un refus d'accès.
  // `content_blocks` n'est demandé QUE sur la fiche : c'est la colonne la plus
  // lourde de la table, et une liste de trente documents n'en a aucun usage.
  const { data, error } = await supabase
    .from('documents')
    .select(`${SELECT_COLUMNS}, content_blocks, template_id`)
    .eq('id', id)
    .eq('business_id', businessId)
    .is('deleted_at', null)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) return null;

  const [{ data: versions }, { data: links }] = await Promise.all([
    supabase.from('document_versions')
      .select('id, version, label, origin, mime_type, size_bytes, created_at')
      .eq('document_id', id).is('deleted_at', null)
      .order('version', { ascending: false }),
    supabase.from('document_links')
      .select('id, entity_type, entity_id, relation')
      .eq('document_id', id),
  ]);

  const raw = data as any;

  return {
    ...toSummary(data as unknown as Row, today),
    contentBlocks: raw.content_blocks
      ? localizeBlocks(parseBlocks(raw.content_blocks), 'fr')
      : null,
    templateId: raw.template_id ?? null,
    versions: (versions ?? []).map((v: any) => ({
      id: v.id, version: v.version, label: v.label,
      origin: v.origin, mimeType: v.mime_type,
      sizeBytes: v.size_bytes, createdAt: v.created_at,
    })),
    links: (links ?? []).map((l: any) => ({
      id: l.id, entityType: l.entity_type, entityId: l.entity_id, relation: l.relation,
    })),
  };
  });
}

/**
 * Un document rattaché, et le rattachement lui-même.
 *
 * `linkId` remonte avec la ligne parce que la fiche détache UN lien — elle ne
 * supprime pas le document. Le même contrat peut être attaché au fournisseur
 * et à la commande ; le retirer de l'un ne doit rien changer à l'autre.
 */
export type EntityDocument = DocumentSummary & {
  linkId:   string;
  relation: DocumentRelation;
};

/**
 * Les documents rattachés à un objet — la fiche fournisseur, client… (§37)
 *
 * Les documents ARCHIVÉS restent visibles ici, avec leur pastille. Ranger un
 * bail ne le retire pas du fournisseur qui l'a signé, et une fiche qui cache
 * ce qu'elle porte pousse à redéposer un document qui existe déjà. Les
 * supprimés en douceur, eux, disparaissent : `deleted_at` est une réponse à
 * « ce document n'existe plus », pas à « on ne le regarde plus ».
 */
export async function listDocumentsForEntity(
  entityType: DocumentEntityType,
  entityId: string,
): Promise<ActionResult<EntityDocument[]>> {
  return attempt(async () => {
  await assertAccess(FEATURE, 'documents:read');
  const { supabase, businessId } = await getBusinessContext();
  const today = todayISO();

  const { data, error } = await supabase
    .from('document_links')
    .select(`id, relation, documents!inner ( ${SELECT_COLUMNS}, deleted_at )`)
    .eq('business_id', businessId)
    .eq('entity_type', entityType)
    .eq('entity_id', entityId)
    .is('documents.deleted_at', null)
    .order('created_at', { ascending: false });

  if (error) throw new Error(error.message);

  return (data ?? [])
    .map((r: any) => {
      // Tant que `lib/database.types.ts` n'est pas régénéré, PostgREST rend
      // l'embarquement tantôt en objet, tantôt en tableau d'un élément. Les
      // deux formes se lisent ici, comme ailleurs dans ce fichier.
      const row = (Array.isArray(r.documents) ? r.documents[0] : r.documents) as Row | null;
      if (!row?.id) return null;
      return {
        ...toSummary(row, today),
        linkId:   r.id as string,
        relation: (r.relation ?? 'attached') as DocumentRelation,
      };
    })
    .filter((d): d is EntityDocument => d !== null);
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Écritures
// ─────────────────────────────────────────────────────────────────────────────

export type DocumentPatch = {
  name?:        string;
  description?: string | null;
  status?:      DocumentStatus;
  visibility?:  DocumentVisibility;
  documentTypeId?: string | null;
  /** `YYYY-MM-DD`. Jamais un horodatage — voir `expires_on` en base. */
  expiresOn?:   string | null;
  tags?:        string[];
};

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export async function updateDocument(id: string, patch: DocumentPatch): Promise<ActionResult> {
  return attempt(async () => {
  await assertAccess(FEATURE, 'documents:update');
  const { supabase, businessId } = await getBusinessContext();

  const update: Record<string, unknown> = {};
  if (patch.name !== undefined) {
    const name = patch.name.trim().slice(0, 200);
    if (!name) throw new UserFacingError('Le nom du document ne peut pas être vide.');
    update.name = name;
  }
  if (patch.description !== undefined) update.description = patch.description?.trim().slice(0, 2000) || null;
  if (patch.status !== undefined)      update.status = patch.status;
  if (patch.visibility !== undefined)  update.visibility = patch.visibility;
  if (patch.documentTypeId !== undefined) update.document_type_id = patch.documentTypeId;
  if (patch.tags !== undefined) {
    update.tags = patch.tags.map((t) => t.trim().slice(0, 40)).filter(Boolean).slice(0, 20);
  }
  if (patch.expiresOn !== undefined) {
    if (patch.expiresOn && !ISO_DATE.test(patch.expiresOn)) {
      throw new UserFacingError('Date d’expiration invalide (format attendu : AAAA-MM-JJ).');
    }
    update.expires_on = patch.expiresOn || null;
  }

  if (Object.keys(update).length === 0) return;
  update.updated_at = new Date().toISOString();

  const { error } = await supabase
    .from('documents')
    .update(update)
    .eq('id', id)
    .eq('business_id', businessId);

  if (error) throw new Error(error.message);

  void logActivity({ action: 'update', entity: 'document', entityId: id, newValues: update });
  revalidatePath('/documents');
  });
}

/** Ranger, pas supprimer. C'est le geste que le §9 attend par défaut. */
export async function archiveDocument(id: string, archived = true): Promise<ActionResult> {
  return attempt(async () => {
  await assertAccess(FEATURE, 'documents:update');
  const { supabase, businessId } = await getBusinessContext();

  const { error } = await supabase
    .from('documents')
    .update({ status: archived ? 'archived' : 'active', is_archived: archived, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('business_id', businessId);

  if (error) throw new Error(error.message);

  void logActivity({ action: archived ? 'archive' : 'restore', entity: 'document', entityId: id });
  revalidatePath('/documents');
  });
}

/**
 * Suppression douce. Le fichier RESTE dans le bucket.
 *
 * Le §38 interdit d'effacer un historique sans acte administratif explicite, et
 * la politique RLS de `document_versions` n'accorde aucun DELETE physique. Une
 * purge réelle viendra plus tard, par une fonction dédiée et journalisée.
 */
export async function deleteDocument(id: string): Promise<ActionResult> {
  return attempt(async () => {
  await assertAccess(FEATURE, 'documents:delete');
  const { supabase, businessId } = await getBusinessContext();

  const { data: before } = await supabase
    .from('documents').select('name').eq('id', id).eq('business_id', businessId).maybeSingle();

  const { error } = await supabase
    .from('documents')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)
    .eq('business_id', businessId);

  if (error) throw new Error(error.message);

  void logActivity({ action: 'delete', entity: 'document', entityId: id, oldValues: before ?? undefined });
  revalidatePath('/documents');
  });
}

// ── Rattachements (§36, §37) ────────────────────────────────────────────────

export async function linkDocument(input: {
  documentId: string;
  entityType: DocumentEntityType;
  entityId:   string;
  relation?:  DocumentRelation;
}): Promise<void> {
  await assertAccess(FEATURE, 'documents:update');
  const { supabase, businessId, userId } = await getBusinessContext();

  const { error } = await supabase.from('document_links').insert({
    document_id: input.documentId,
    business_id: businessId,
    entity_type: input.entityType,
    entity_id:   input.entityId,
    relation:    input.relation ?? 'attached',
    created_by:  userId,
  });

  // Le lien existe déjà : ce n'est pas une erreur, c'est le résultat voulu.
  if (error && error.code !== '23505') throw new Error(error.message);
  revalidatePath('/documents');
}

export async function unlinkDocument(linkId: string): Promise<ActionResult> {
  return attempt(async () => {
  await assertAccess(FEATURE, 'documents:update');
  const { supabase, businessId } = await getBusinessContext();

  const { error } = await supabase
    .from('document_links').delete().eq('id', linkId).eq('business_id', businessId);

  if (error) throw new Error(error.message);
  revalidatePath('/documents');
  });
}

/** Journalise une consultation ou un téléchargement (§43). */
export async function logDocumentAccess(id: string, action: 'view' | 'download'): Promise<void> {
  try {
    await assertPermission('documents:read');
    void logActivity({ action, entity: 'document', entityId: id });
  } catch {
    // Le journal ne doit jamais empêcher la lecture.
  }
}
