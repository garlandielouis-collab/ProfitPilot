'use server';

// ─────────────────────────────────────────────────────────────────────────────
// Conformité, échéances et contrats (§33, §34, §35, §51, §64)
//
// Trois lectures, une seule idée : répondre à « qu'est-ce qui va me tomber
// dessus ? » avant que ça ne tombe.
//
//   getComplianceOverview()   le score, ses cinq facteurs, ce qui manque
//   getComplianceCalendar()   les échéances des six prochains mois
//   listContracts()           les engagements en cours et leur fin
//
// ── Le calcul n'est pas ici ─────────────────────────────────────────────────
//
// Ce fichier LIT. Le score se calcule dans `lib/documents/health.ts`, qui est
// pur : on peut lui donner un jeu de documents inventé et vérifier la note sans
// base de données. Mélanger les deux rendrait le score intestable, et un score
// intestable finit par être faux sans que personne ne s'en aperçoive.
// ─────────────────────────────────────────────────────────────────────────────

import { getBusinessContext } from '../../lib/serverAuth';
import { assertAccess } from '../../lib/entitlements';
import {
  documentHealth, type HealthScore,
} from '../../lib/documents/health';
import type { HeldDocument, Requirement } from '../../lib/documents/requirements';
import {
  CONTRACT_TYPE_KEYS, expirationState, daysUntilExpiration, todayISO,
  type Bilingual, type DocumentCategory, type DocumentStatus, type ExpirationState,
} from '../../lib/documents/types';

/**
 * Le pays de l'entreprise, en code ISO.
 *
 * `businesses.country` porte un NOM ('Haiti'), le référentiel un CODE ('HT').
 * La traduction se fait ici, une fois. Aujourd'hui aucune ligne du référentiel
 * n'est propre à un pays — toutes sont universelles — mais le jour où le
 * corpus haïtien sourcé sera inséré, il n'y aura rien à changer ailleurs.
 */
function countryCode(country: string | null | undefined): string | null {
  const normalized = (country ?? '').trim().toLowerCase();
  if (normalized === 'haiti' || normalized === 'haïti' || normalized === 'ht') return 'HT';
  if (normalized === 'dominican republic' || normalized === 'république dominicaine') return 'DO';
  if (normalized === 'united states' || normalized === 'états-unis' || normalized === 'usa') return 'US';
  if (normalized === 'france') return 'FR';
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Le socle : ce que l'entreprise possède, et ce qu'on attend d'elle
// ─────────────────────────────────────────────────────────────────────────────

type Loaded = {
  held:         HeldDocument[];
  requirements: Requirement[];
  today:        string;
};

async function loadComplianceInputs(): Promise<Loaded> {
  const { supabase, businessId } = await getBusinessContext();
  const today = todayISO();

  const { data: business } = await supabase
    .from('businesses')
    .select('country, sector')
    .eq('id', businessId)
    .maybeSingle();

  const code     = countryCode(business?.country);
  const industry = (business?.sector ?? '').trim() || null;

  const [{ data: documents, error: documentsError }, { data: requirements, error: requirementsError }] =
    await Promise.all([
      supabase
        .from('documents')
        .select(`
          id, status, expires_on, updated_at, tags, document_type_id,
          document_types ( key, category )
        `)
        .eq('business_id', businessId)
        .is('deleted_at', null),
      supabase
        .from('document_requirements')
        .select(`
          id, necessity, rationale, source_url, renewal_months, country_code, industry, sort_order,
          document_types!inner ( key, category, label_fr, label_ht )
        `)
        .eq('is_active', true)
        .order('sort_order', { ascending: true }),
    ]);

  if (documentsError)    throw new Error(documentsError.message);
  if (requirementsError) throw new Error(requirementsError.message);

  // Quels documents portent au moins un rattachement (§64, organisation).
  // Une seule requête pour tous : demander « ce document a-t-il un lien ? »
  // ligne par ligne ferait cent allers-retours sur une bibliothèque de cent.
  const { data: links } = await supabase
    .from('document_links')
    .select('document_id')
    .eq('business_id', businessId);

  const linked = new Set((links ?? []).map((l: any) => l.document_id));

  const held: HeldDocument[] = (documents ?? []).map((row: any) => {
    const type = Array.isArray(row.document_types) ? row.document_types[0] : row.document_types;
    const tags = Array.isArray(row.tags) ? row.tags : [];
    return {
      id:         row.id,
      typeKey:    type?.key ?? null,
      category:   (type?.category as DocumentCategory) ?? null,
      status:     (row.status as DocumentStatus) ?? 'active',
      expiration: expirationState(row.expires_on, today),
      expiresOn:  row.expires_on ?? null,
      updatedAt:  row.updated_at,
      // Classé = on sait CE QUE C'EST, et À QUOI ÇA SERT. Un type sans
      // rattachement ni étiquette se retrouve par la recherche, pas par la
      // fiche du fournisseur qui l'a signé.
      classified: Boolean(row.document_type_id) && (tags.length > 0 || linked.has(row.id)),
    };
  });

  // Le filtrage par pays et industrie se fait ici plutôt qu'en SQL : la
  // condition « NULL veut dire partout » s'écrit en une ligne lisible, là où
  // le `.or()` de PostgREST demanderait quatre clauses imbriquées.
  const applicable: Requirement[] = (requirements ?? [])
    .filter((row: any) =>
      (row.country_code === null || row.country_code === code)
      && (row.industry === null || row.industry === industry))
    .map((row: any) => {
      const type = Array.isArray(row.document_types) ? row.document_types[0] : row.document_types;
      return {
        id:            row.id,
        typeKey:       type?.key ?? '',
        typeLabelFr:   type?.label_fr ?? '',
        typeLabelHt:   type?.label_ht ?? '',
        category:      (type?.category as DocumentCategory) ?? 'compliance',
        necessity:     row.necessity,
        rationale:     (row.rationale ?? { fr: '', ht: '' }) as Bilingual,
        sourceUrl:     row.source_url ?? null,
        renewalMonths: row.renewal_months ?? null,
      };
    })
    .filter((r) => r.typeKey !== '');

  return { held, requirements: applicable, today };
}

// ─────────────────────────────────────────────────────────────────────────────
// Le score (§5, §64)
// ─────────────────────────────────────────────────────────────────────────────

export async function getComplianceOverview(): Promise<HealthScore> {
  await assertAccess('document_health', 'documents:read');
  const { held, requirements, today } = await loadComplianceInputs();
  return documentHealth({ documents: held, requirements, today });
}

// ─────────────────────────────────────────────────────────────────────────────
// Le calendrier (§35)
// ─────────────────────────────────────────────────────────────────────────────

export type CalendarEntry = {
  id:        string;
  name:      string;
  typeLabelFr: string | null;
  typeLabelHt: string | null;
  expiresOn: string;
  daysLeft:  number;
  expiration: ExpirationState;
};

export type CalendarMonth = {
  /** `YYYY-MM`. La clé du groupe, pas une étiquette : l'écran la formate. */
  month:   string;
  entries: CalendarEntry[];
};

/**
 * Les échéances à venir, groupées par mois.
 *
 * Les documents DÉJÀ expirés sont rendus à part, en tête, et jamais fondus
 * dans le mois où ils sont tombés : « expiré depuis quatre mois » et « expire
 * en mars » n'appellent pas le même geste, et les mettre côte à côte dans une
 * frise mensuelle les rendrait équivalents.
 */
export async function getComplianceCalendar(months = 6): Promise<{
  expired:  CalendarEntry[];
  upcoming: CalendarMonth[];
}> {
  await assertAccess('document_compliance', 'documents:read');
  const { supabase, businessId } = await getBusinessContext();
  const today = todayISO();

  const horizon = new Date(`${today}T00:00:00Z`);
  horizon.setUTCMonth(horizon.getUTCMonth() + Math.max(1, Math.min(24, months)));

  const { data, error } = await supabase
    .from('documents')
    .select('id, name, expires_on, document_types ( label_fr, label_ht )')
    .eq('business_id', businessId)
    .is('deleted_at', null)
    .neq('status', 'archived')
    .not('expires_on', 'is', null)
    .lte('expires_on', horizon.toISOString().slice(0, 10))
    .order('expires_on', { ascending: true });

  if (error) throw new Error(error.message);

  const entries: CalendarEntry[] = (data ?? []).map((row: any) => {
    const type = Array.isArray(row.document_types) ? row.document_types[0] : row.document_types;
    return {
      id:          row.id,
      name:        row.name,
      typeLabelFr: type?.label_fr ?? null,
      typeLabelHt: type?.label_ht ?? null,
      expiresOn:   row.expires_on,
      daysLeft:    daysUntilExpiration(row.expires_on, today) ?? 0,
      expiration:  expirationState(row.expires_on, today),
    };
  });

  const expired  = entries.filter((e) => e.expiration === 'expired');
  const upcoming = new Map<string, CalendarEntry[]>();

  for (const entry of entries) {
    if (entry.expiration === 'expired') continue;
    const month = entry.expiresOn.slice(0, 7);
    const bucket = upcoming.get(month);
    if (bucket) bucket.push(entry);
    else upcoming.set(month, [entry]);
  }

  return {
    expired,
    upcoming: [...upcoming.entries()].map(([month, list]) => ({ month, entries: list })),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Les contrats (§31, §32)
// ─────────────────────────────────────────────────────────────────────────────

export type ContractRow = {
  id:          string;
  name:        string;
  typeKey:     string | null;
  typeLabelFr: string | null;
  typeLabelHt: string | null;
  status:      DocumentStatus;
  expiresOn:   string | null;
  daysLeft:    number | null;
  expiration:  ExpirationState;
  signatureStatus: string | null;
  /** À quoi ce contrat est rattaché — le fournisseur, le client, l'employé. */
  links: Array<{ entityType: string; entityId: string }>;
};

/**
 * Les engagements en cours.
 *
 * « Contrat » n'est pas un statut mais une FAMILLE DE TYPES : bail, accord de
 * fourniture, contrat de travail, conditions de service. La liste vit dans
 * `lib/documents/types.ts` pour que l'écran et l'action ne puissent pas en
 * avoir deux versions.
 */
export async function listContracts(): Promise<ContractRow[]> {
  await assertAccess('document_contracts', 'documents:read');
  const { supabase, businessId } = await getBusinessContext();
  const today = todayISO();

  const { data, error } = await supabase
    .from('documents')
    .select(`
      id, name, status, expires_on, signature_status,
      document_types!inner ( key, label_fr, label_ht )
    `)
    .eq('business_id', businessId)
    .is('deleted_at', null)
    .neq('status', 'archived')
    .in('document_types.key', [...CONTRACT_TYPE_KEYS])
    .order('expires_on', { ascending: true, nullsFirst: false });

  if (error) throw new Error(error.message);

  const rows = data ?? [];
  const ids  = rows.map((r: any) => r.id);

  const { data: links } = ids.length
    ? await supabase
        .from('document_links')
        .select('document_id, entity_type, entity_id')
        .eq('business_id', businessId)
        .in('document_id', ids)
    : { data: [] as any[] };

  return rows.map((row: any) => {
    const type = Array.isArray(row.document_types) ? row.document_types[0] : row.document_types;
    return {
      id:          row.id,
      name:        row.name,
      typeKey:     type?.key ?? null,
      typeLabelFr: type?.label_fr ?? null,
      typeLabelHt: type?.label_ht ?? null,
      status:      (row.status as DocumentStatus) ?? 'active',
      expiresOn:   row.expires_on ?? null,
      daysLeft:    daysUntilExpiration(row.expires_on, today),
      expiration:  expirationState(row.expires_on, today),
      signatureStatus: row.signature_status ?? null,
      links: (links ?? [])
        .filter((l: any) => l.document_id === row.id)
        .map((l: any) => ({ entityType: l.entity_type, entityId: l.entity_id })),
    };
  });
}
