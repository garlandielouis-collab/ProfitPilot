'use server';

// ─────────────────────────────────────────────────────────────────────────────
// Les modèles, et ce qu'on en fait (§19, §21, §53, §54)
//
// Un modèle est un texte à trous. Créer un document depuis un modèle, c'est
// trois gestes enchaînés, dans cet ordre et pas un autre :
//
//   1. choisir la langue      un contrat réel n'est pas bilingue
//   2. remplir les variables   avec ce que l'application sait déjà (§21)
//   3. écrire le document      dans `documents`, comme n'importe quel autre
//
// Le troisième point est celui qui compte : un document écrit n'est pas un
// objet à part. Il entre dans la même table, hérite de la même politique RLS,
// se cherche dans la même bibliothèque, expire de la même façon. Seule sa
// colonne `content_blocks` le distingue d'un PDF déposé.
//
// ── Où s'arrête ce fichier ──────────────────────────────────────────────────
//
// Il ne rend pas les blocs — c'est `components/documents/DocumentBlocks.tsx`.
// Il ne substitue pas les variables — c'est `lib/documents/variables.ts`, qui
// est pur et se teste sans base. Il fait ce que lui seul peut faire : lire les
// sources, et écrire dans la base sous le bon `business_id`.
// ─────────────────────────────────────────────────────────────────────────────

import { revalidatePath } from 'next/cache';

import { getBusinessContext } from '../../lib/serverAuth';
import { assertAccess } from '../../lib/entitlements';
import { logActivity } from '../../lib/activityLog';
import { formatCurrency } from '../../lib/utils';
import {
  blocksToPlainText, isBlockEmpty, localizeBlocks, parseBlocks,
  type Block, type BlockLanguage, type PlainBlock,
} from '../../lib/documents/blocks';
import { substituteText } from '../../lib/documents/variables';
import { todayISO, type DocumentCategory, type DocumentEntityType } from '../../lib/documents/types';
import { attempt, UserFacingError, type ActionResult } from '../../lib/actionResult';

/**
 * Deux capacités, pas une seule.
 *
 * Écrire un document dans l'application est ouvert à toutes les offres : c'est
 * la contrepartie du §20, et un devis écrit à la main dans un cahier n'a jamais
 * été une fonctionnalité avancée. La BIBLIOTHÈQUE DE MODÈLES, elle, est ce que
 * l'union `Feature` classe en Kwasans (§54) — c'est elle qui fait gagner
 * l'heure de rédaction, et c'est elle qui se vend.
 */
const TEMPLATES = 'document_templates' as const;
const WRITING   = 'documents' as const;

// ─────────────────────────────────────────────────────────────────────────────
// Lecture
// ─────────────────────────────────────────────────────────────────────────────

export type TemplateSummary = {
  id:        string;
  key:       string;
  category:  DocumentCategory;
  titleFr:   string;
  titleHt:   string;
  summaryFr: string | null;
  summaryHt: string | null;
  variables: string[];
  /** §23 — la mention de vérification professionnelle s'affiche partout où ce
   *  modèle apparaît, pas seulement à la fin du document produit. */
  requiresProfessionalReview: boolean;
  /** `false` = modèle propre à l'entreprise, donc modifiable et supprimable. */
  isGlobal:  boolean;
};

export type TemplateDetail = TemplateSummary & {
  documentTypeId: string | null;
  blocks: Block[];
};

const TEMPLATE_COLUMNS = `
  id, business_id, key, category, title_fr, title_ht, summary_fr, summary_ht,
  variables, requires_professional_review, document_type_id, sort_order
`;

function toSummary(row: any): TemplateSummary {
  return {
    id:        row.id,
    key:       row.key,
    category:  row.category as DocumentCategory,
    titleFr:   row.title_fr,
    titleHt:   row.title_ht,
    summaryFr: row.summary_fr ?? null,
    summaryHt: row.summary_ht ?? null,
    variables: Array.isArray(row.variables) ? row.variables : [],
    requiresProfessionalReview: row.requires_professional_review === true,
    isGlobal:  row.business_id === null,
  };
}

/**
 * Le catalogue visible : les modèles livrés avec le produit, plus ceux de
 * l'entreprise. Le `.or()` reproduit exactement ce que dit la politique RLS —
 * écrire la condition ici ne l'ajoute pas, elle la rend lisible.
 */
export async function listDocumentTemplates(
  category?: DocumentCategory | 'all',
): Promise<ActionResult<TemplateSummary[]>> {
  return attempt(async () => {
  await assertAccess(TEMPLATES, 'documents:read');
  const { supabase, businessId } = await getBusinessContext();

  let q = supabase
    .from('document_templates')
    .select(TEMPLATE_COLUMNS)
    .eq('is_active', true)
    .or(`business_id.is.null,business_id.eq.${businessId}`);

  if (category && category !== 'all') q = q.eq('category', category);

  const { data, error } = await q.order('sort_order', { ascending: true });
  if (error) throw new Error(error.message);

  return (data ?? []).map(toSummary);
  });
}

export async function getDocumentTemplate(id: string): Promise<TemplateDetail | null> {
  await assertAccess(TEMPLATES, 'documents:read');
  const { supabase } = await getBusinessContext();

  const { data, error } = await supabase
    .from('document_templates')
    .select(`${TEMPLATE_COLUMNS}, blocks`)
    .eq('id', id)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) return null;

  return {
    ...toSummary(data),
    documentTypeId: (data as any).document_type_id ?? null,
    blocks: parseBlocks((data as any).blocks),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Les sources des variables (§21)
//
// Une lecture par portée, et seulement si le modèle la réclame. Charger le
// client quand le modèle n'en parle pas serait une requête pour rien — et sur
// une connexion haïtienne, chaque aller-retour se sent.
//
// ⚠️ Les employés RH vivent dans `employees`, cadrée par **`company_id`** et non
// `business_id`. C'est la seule table du domaine dans ce cas ; s'y tromper rend
// zéro ligne sans erreur.
// ─────────────────────────────────────────────────────────────────────────────

export type VariableSources = {
  customerId?: string;
  employeeId?: string;
  supplierId?: string;
};

type Values = Record<string, string>;

async function resolveVariableValues(sources: VariableSources): Promise<Values> {
  const { supabase, businessId, defaultCurrency } = await getBusinessContext();
  const values: Values = {};

  const currency = defaultCurrency === 'USD' ? 'USD' : 'HTG';
  const today = todayISO();

  // `date` et `company` ne se demandent jamais : ils sont toujours connus.
  values['date.today'] = today;
  values['date.year']  = today.slice(0, 4);

  const { data: business } = await supabase
    .from('businesses')
    .select('name, legal_name, address, city, phone, email, tax_id')
    .eq('id', businessId)
    .maybeSingle();

  if (business) {
    values['company.name']       = business.name ?? '';
    values['company.legal_name'] = business.legal_name ?? business.name ?? '';
    values['company.address']    = business.address ?? '';
    values['company.city']       = business.city ?? '';
    values['company.phone']      = business.phone ?? '';
    values['company.email']      = business.email ?? '';
    values['company.tax_id']     = business.tax_id ?? '';
  }

  if (sources.customerId) {
    const { data: customer } = await supabase
      .from('customers')
      .select('name, phone, email, outstanding_balance')
      .eq('id', sources.customerId)
      .eq('business_id', businessId)
      .maybeSingle();

    if (customer) {
      values['customer.name']    = customer.name ?? '';
      values['customer.phone']   = customer.phone ?? '';
      values['customer.email']   = customer.email ?? '';
      values['customer.balance'] = formatCurrency(Number(customer.outstanding_balance ?? 0), currency);
    }
  }

  if (sources.employeeId) {
    const { data: employee } = await supabase
      .from('employees')
      .select('first_name, last_name, position, phone, hire_date, salary, salary_currency')
      .eq('id', sources.employeeId)
      .eq('company_id', businessId)
      .maybeSingle();

    if (employee) {
      values['employee.full_name'] = `${employee.first_name ?? ''} ${employee.last_name ?? ''}`.trim();
      values['employee.position']  = employee.position ?? '';
      values['employee.phone']     = employee.phone ?? '';
      values['employee.hire_date'] = employee.hire_date ?? '';
      values['employee.salary']    = employee.salary != null
        ? formatCurrency(Number(employee.salary), employee.salary_currency === 'USD' ? 'USD' : 'HTG')
        : '';
    }
  }

  if (sources.supplierId) {
    const { data: supplier } = await supabase
      .from('suppliers')
      .select('name, phone, email')
      .eq('id', sources.supplierId)
      .eq('business_id', businessId)
      .maybeSingle();

    if (supplier) {
      values['supplier.name']  = supplier.name ?? '';
      values['supplier.phone'] = supplier.phone ?? '';
      values['supplier.email'] = supplier.email ?? '';
    }
  }

  return values;
}

/** Applique les valeurs à un document entier, et rapporte ce qui manque. */
function fillBlocks(blocks: PlainBlock[], values: Values): { blocks: PlainBlock[]; blank: string[] } {
  const blank = new Set<string>();

  const filled = blocks.map((block) => {
    const substitute = (text: string) => {
      const result = substituteText(text, values);
      result.blank.forEach((k) => blank.add(k));
      return result.text;
    };

    switch (block.type) {
      case 'heading':
      case 'paragraph':
      case 'notice':
        return { ...block, text: substitute(block.text) };
      case 'list':
        return { ...block, items: block.items.map(substitute) };
      case 'signature':
        return { ...block, parties: block.parties.map(substitute) };
      case 'fields':
        return { ...block, items: block.items.map((i) => ({ label: substitute(i.label), value: substitute(i.value) })) };
      case 'table':
        return {
          ...block,
          columns: block.columns.map(substitute),
          rows: block.rows.map((row) => row.map(substitute)),
        };
      case 'spacer':
        return block;
    }
  });

  return { blocks: filled, blank: [...blank] };
}

// ─────────────────────────────────────────────────────────────────────────────
// Écriture
// ─────────────────────────────────────────────────────────────────────────────

export type CreateFromTemplateInput = {
  templateId: string;
  /** Le nom du document. À défaut, le titre du modèle dans la langue choisie. */
  name?:      string;
  language:   BlockLanguage;
  expiresOn?: string | null;
  sources?:   VariableSources;
  /** Rattachement immédiat à la fiche d'où l'on vient (§37). */
  link?:      { entityType: DocumentEntityType; entityId: string };
};

export type CreateFromTemplateResult = {
  id: string;
  /** Les variables restées vides — l'écran les annonce avant l'impression. */
  blank: string[];
};

/**
 * Écrit un document depuis un modèle.
 *
 * L'ordre des écritures suit celui du dépôt de fichier : la ligne `documents`
 * d'abord, sa version 1 ensuite, le rattachement en dernier. Si la version ne
 * s'écrit pas, le document existe quand même — un document sans historique est
 * réparable, un historique sans document ne veut rien dire.
 */
export async function createDocumentFromTemplate(
  input: CreateFromTemplateInput,
): Promise<ActionResult<CreateFromTemplateResult>> {
  return attempt(async () => {
  await assertAccess(TEMPLATES, 'documents:create');
  const { supabase, businessId, userId } = await getBusinessContext();

  const template = await getDocumentTemplate(input.templateId);
  if (!template) throw new UserFacingError('Ce modèle n’existe pas ou n’est plus disponible.');

  const values = await resolveVariableValues(input.sources ?? {});

  const localized = localizeBlocks(template.blocks, input.language);
  const { blocks, blank } = fillBlocks(localized, values);

  const name = (input.name?.trim()
    || (input.language === 'ht' ? template.titleHt : template.titleFr)).slice(0, 200);

  // La visibilité par défaut vient du TYPE, comme au dépôt : un contrat de
  // travail ne s'ouvre pas à toute l'entreprise parce qu'il a été écrit ici
  // plutôt que déposé.
  let visibility = 'company';
  if (template.documentTypeId) {
    const { data: type } = await supabase
      .from('document_types')
      .select('default_visibility')
      .eq('id', template.documentTypeId)
      .maybeSingle();
    if (type?.default_visibility) visibility = type.default_visibility;
  }

  const plainText = blocksToPlainText(blocks);

  const { data: created, error } = await supabase
    .from('documents')
    .insert({
      business_id:      businessId,
      name,
      document_type_id: template.documentTypeId,
      template_id:      template.id,
      // Un document neuf est un BROUILLON. Le passer « actif » d'office
      // dirait qu'il est prêt alors qu'il porte encore des traits à remplir.
      status:           'draft',
      visibility,
      content_blocks:   blocks,
      // Le texte brut alimente `search_vector` : sans lui, un contrat écrit
      // dans l'application serait introuvable par son contenu (§16).
      ocr_text:         plainText,
      current_version:  1,
      expires_on:       input.expiresOn || null,
      created_by:       userId,
      owner_user_id:    userId,
      url:              null,
    })
    .select('id')
    .single();

  if (error) throw new Error(error.message);
  const documentId = created.id as string;

  const { error: versionError } = await supabase.from('document_versions').insert({
    document_id:    documentId,
    business_id:    businessId,
    version:        1,
    content_blocks: blocks,
    label:          input.language === 'ht' ? 'Orijinal' : 'Original',
    origin:         'user',
    created_by:     userId,
  });
  if (versionError) console.error('[documentTemplates] version 1 non enregistrée:', versionError.message);

  if (input.link) {
    const { error: linkError } = await supabase.from('document_links').insert({
      document_id: documentId,
      business_id: businessId,
      entity_type: input.link.entityType,
      entity_id:   input.link.entityId,
      relation:    'attached',
      created_by:  userId,
    });
    if (linkError && linkError.code !== '23505') {
      console.error('[documentTemplates] rattachement refusé:', linkError.message);
    }
  }

  void logActivity({
    action: 'create', entity: 'document', entityId: documentId,
    newValues: { name, template: template.key, language: input.language },
  });

  revalidatePath('/documents');
  revalidatePath('/documents/bibliotheque');

  return { id: documentId, blank };
  });
}

/** Un document vierge : trois blocs, de quoi commencer sans page blanche. */
export async function createBlankDocument(input: {
  name: string;
  documentTypeId?: string | null;
  link?: { entityType: DocumentEntityType; entityId: string };
}): Promise<ActionResult<{ id: string }>> {
  return attempt(async () => {
  await assertAccess(WRITING, 'documents:create');
  const { supabase, businessId, userId } = await getBusinessContext();

  const name = input.name.trim().slice(0, 200);
  if (!name) throw new UserFacingError('Le nom du document ne peut pas être vide.');

  const blocks: PlainBlock[] = [
    { type: 'heading', level: 1, text: name },
    { type: 'paragraph', text: '' },
  ];

  const { data: created, error } = await supabase
    .from('documents')
    .insert({
      business_id:      businessId,
      name,
      document_type_id: input.documentTypeId ?? null,
      status:           'draft',
      visibility:       'company',
      content_blocks:   blocks,
      ocr_text:         name,
      current_version:  1,
      created_by:       userId,
      owner_user_id:    userId,
      url:              null,
    })
    .select('id')
    .single();

  if (error) throw new Error(error.message);
  const documentId = created.id as string;

  const { error: versionError } = await supabase.from('document_versions').insert({
    document_id: documentId, business_id: businessId, version: 1,
    content_blocks: blocks, label: 'Original', origin: 'user', created_by: userId,
  });
  if (versionError) console.error('[documentTemplates] version 1 non enregistrée:', versionError.message);

  if (input.link) {
    const { error: linkError } = await supabase.from('document_links').insert({
      document_id: documentId, business_id: businessId,
      entity_type: input.link.entityType, entity_id: input.link.entityId,
      relation: 'attached', created_by: userId,
    });
    if (linkError && linkError.code !== '23505') {
      console.error('[documentTemplates] rattachement refusé:', linkError.message);
    }
  }

  void logActivity({ action: 'create', entity: 'document', entityId: documentId, newValues: { name } });
  revalidatePath('/documents');

  return { id: documentId };
  });
}

/**
 * Enregistre le corps d'un document écrit, et garde le passé (§38).
 *
 * Chaque enregistrement ajoute une version — sauf s'il n'a rien changé. Cette
 * exception est ce qui évite dix versions identiques quand on ouvre l'éditeur,
 * qu'on relit, et qu'on referme par le bouton d'enregistrement.
 */
export async function saveDocumentContent(
  documentId: string,
  blocks: PlainBlock[],
  label?: string,
): Promise<{ version: number; changed: boolean }> {
  await assertAccess(WRITING, 'documents:update');
  const { supabase, businessId, userId } = await getBusinessContext();

  const { data: current, error: readError } = await supabase
    .from('documents')
    .select('current_version, content_blocks')
    .eq('id', documentId)
    .eq('business_id', businessId)
    .maybeSingle();

  if (readError) throw new Error(readError.message);
  if (!current) throw new UserFacingError('Ce document n’existe pas ou vous n’y avez pas accès.');

  const clean = blocks.filter((b) => !isBlockEmpty(b));
  const unchanged = JSON.stringify(current.content_blocks ?? null) === JSON.stringify(clean);
  const version = unchanged ? (current.current_version ?? 1) : (current.current_version ?? 1) + 1;

  if (unchanged) return { version, changed: false };

  const plainText = blocksToPlainText(clean);

  const { error } = await supabase
    .from('documents')
    .update({
      content_blocks:  clean,
      ocr_text:        plainText,
      current_version: version,
      updated_at:      new Date().toISOString(),
    })
    .eq('id', documentId)
    .eq('business_id', businessId);

  if (error) throw new Error(error.message);

  const { error: versionError } = await supabase.from('document_versions').insert({
    document_id:    documentId,
    business_id:    businessId,
    version,
    content_blocks: clean,
    label:          label?.trim().slice(0, 120) || null,
    origin:         'user',
    created_by:     userId,
  });
  if (versionError) console.error('[documentTemplates] version non enregistrée:', versionError.message);

  void logActivity({ action: 'update', entity: 'document', entityId: documentId, newValues: { version } });
  revalidatePath(`/documents/${documentId}`);
  revalidatePath('/documents');

  return { version, changed: true };
}
