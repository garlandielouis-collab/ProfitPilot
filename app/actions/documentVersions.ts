'use server';

// ─────────────────────────────────────────────────────────────────────────────
// Les versions d'un document (§38, §71)
//
// « Ne jamais supprimer définitivement une version historique sans une action
// administrative explicite. » Ce fichier est la mise en œuvre de cette phrase :
// on ajoute, on consulte, on restaure. On n'écrase rien, on n'efface rien.
//
// ── Restaurer, c'est avancer ────────────────────────────────────────────────
//
// Restaurer la version 2 ne fait PAS revenir le document à la version 2 : cela
// crée une version 5 dont le contenu est celui de la version 2. L'historique
// s'allonge, il ne recule pas. C'est ce qui permet de restaurer, de constater
// que ce n'était pas la bonne, et de revenir à la 4 — qui existe toujours.
//
// ── Le fichier n'est pas recopié ────────────────────────────────────────────
//
// Une version restaurée pointe sur le MÊME objet de stockage que la version
// d'origine. Une version est immuable — rien ne peut réécrire ce fichier — donc
// le partager ne risque rien, et recopier vingt mégaoctets pour obtenir un
// octet près identique serait payer deux fois le même stockage.
// ─────────────────────────────────────────────────────────────────────────────

import { revalidatePath } from 'next/cache';

import { getBusinessContext } from '../../lib/serverAuth';
import { assertAccess } from '../../lib/entitlements';
import { logActivity } from '../../lib/activityLog';
import { blocksToPlainText, parseBlocks, localizeBlocks } from '../../lib/documents/blocks';
import { attempt, UserFacingError, type ActionResult } from '../../lib/actionResult';

const FEATURE = 'documents' as const;

export type DocumentVersionDetail = {
  id:        string;
  version:   number;
  label:     string | null;
  origin:    'user' | 'ai' | 'system';
  mimeType:  string | null;
  sizeBytes: number | null;
  createdAt: string;
  /** Une version de fichier déposé. */
  hasFile:   boolean;
  /** Une version de document écrit. Les deux ne sont jamais vrais ensemble. */
  hasContent: boolean;
};

const VERSION_COLUMNS = `
  id, version, label, origin, mime_type, size_bytes, created_at,
  storage_bucket, storage_path, content_blocks
`;

function toVersion(row: any): DocumentVersionDetail {
  return {
    id:         row.id,
    version:    row.version,
    label:      row.label ?? null,
    origin:     (row.origin ?? 'user') as 'user' | 'ai' | 'system',
    mimeType:   row.mime_type ?? null,
    sizeBytes:  row.size_bytes ?? null,
    createdAt:  row.created_at,
    hasFile:    Boolean(row.storage_path),
    hasContent: row.content_blocks != null,
  };
}

/**
 * L'historique complet, la plus récente d'abord.
 *
 * Aucun filtre de rôle ici : `document_versions` est un satellite de
 * `documents`, et sa politique RLS appelle `can_read_document()`. Une version
 * qui revient est une version qu'on a le droit de voir.
 */
export async function listDocumentVersions(documentId: string): Promise<DocumentVersionDetail[]> {
  await assertAccess(FEATURE, 'documents:read');
  const { supabase } = await getBusinessContext();

  const { data, error } = await supabase
    .from('document_versions')
    .select(VERSION_COLUMNS)
    .eq('document_id', documentId)
    .is('deleted_at', null)
    .order('version', { ascending: false });

  if (error) throw new Error(error.message);
  return (data ?? []).map(toVersion);
}

/** Le contenu d'une version écrite — pour lire le passé sans le restaurer. */
export async function getVersionContent(versionId: string) {
  await assertAccess(FEATURE, 'documents:read');
  const { supabase } = await getBusinessContext();

  const { data, error } = await supabase
    .from('document_versions')
    .select('content_blocks')
    .eq('id', versionId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data?.content_blocks) return null;

  // Les blocs d'un document sont déjà résolus dans une langue ; `localizeBlocks`
  // ne fait ici que traverser la validation sans rien traduire.
  return localizeBlocks(parseBlocks(data.content_blocks), 'fr');
}

export async function restoreDocumentVersion(
  documentId: string,
  versionId: string,
): Promise<ActionResult<{ version: number }>> {
  return attempt(async () => {
  await assertAccess(FEATURE, 'documents:update');
  const { supabase, businessId, userId } = await getBusinessContext();

  const [{ data: source, error: sourceError }, { data: document, error: documentError }] =
    await Promise.all([
      supabase.from('document_versions')
        .select(VERSION_COLUMNS)
        .eq('id', versionId).eq('document_id', documentId)
        .is('deleted_at', null)
        .maybeSingle(),
      supabase.from('documents')
        .select('current_version, name')
        .eq('id', documentId).eq('business_id', businessId)
        .maybeSingle(),
    ]);

  if (sourceError)   throw new Error(sourceError.message);
  if (documentError) throw new Error(documentError.message);
  if (!source)   throw new UserFacingError('Cette version n’existe pas ou vous n’y avez pas accès.');
  if (!document) throw new UserFacingError('Ce document n’existe pas ou vous n’y avez pas accès.');

  const next = (document.current_version ?? 1) + 1;

  const { error: insertError } = await supabase.from('document_versions').insert({
    document_id:    documentId,
    business_id:    businessId,
    version:        next,
    storage_bucket: source.storage_bucket,
    storage_path:   source.storage_path,
    mime_type:      source.mime_type,
    size_bytes:     source.size_bytes,
    content_blocks: source.content_blocks,
    label:          `Restauration de la version ${source.version}`,
    origin:         'system',
    created_by:     userId,
  });
  if (insertError) throw new Error(insertError.message);

  const update: Record<string, unknown> = {
    current_version: next,
    storage_bucket:  source.storage_bucket,
    storage_path:    source.storage_path,
    mime_type:       source.mime_type,
    size_bytes:      source.size_bytes,
    content_blocks:  source.content_blocks,
    updated_at:      new Date().toISOString(),
  };

  // Le texte indexé suit le contenu restauré : sans cela, la recherche
  // continuerait de rendre le document sur des mots qu'il ne contient plus.
  if (source.content_blocks) {
    update.ocr_text = blocksToPlainText(localizeBlocks(parseBlocks(source.content_blocks), 'fr'));
  }

  const { error } = await supabase
    .from('documents').update(update)
    .eq('id', documentId).eq('business_id', businessId);

  if (error) throw new Error(error.message);

  void logActivity({
    action: 'restore', entity: 'document_version', entityId: versionId,
    newValues: { document: documentId, restored_from: source.version, new_version: next },
  });

  revalidatePath(`/documents/${documentId}`);
  revalidatePath('/documents');

  return { version: next };
  });
}
