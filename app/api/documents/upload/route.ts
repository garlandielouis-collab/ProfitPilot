// ─────────────────────────────────────────────────────────────────────────────
// POST /api/documents/upload — le dépôt d'un document
//
// ── Pourquoi une route et pas une action serveur ────────────────────────────
//
// Une action serveur reçoit très bien un `FormData`, mais elle le reçoit
// APRÈS que Next l'ait entièrement mis en mémoire, et elle ne peut pas répondre
// autre chose qu'un résultat sérialisé : ni 413, ni 415, ni progression. Un
// dépôt de 25 Mo sur une connexion mobile haïtienne a besoin des trois. La
// route rend un vrai code HTTP, que l'interface traduit en une phrase.
//
// ── L'ordre des opérations, et pourquoi il n'est pas interchangeable ────────
//
//   1. qui, et pour quelle entreprise          (401)
//   2. l'offre et le rôle                      (402 / 403)
//   3. la taille, AVANT de lire le fichier     (413)
//   4. les octets décident du type             (415)
//   5. la ligne `documents` — elle donne l'identifiant du chemin
//   6. le fichier dans le bucket
//   7. le chemin recollé sur la ligne + la version 1
//
// L'étape 5 précède le stockage parce que le chemin contient l'identifiant du
// document : `<business>/<document>/v1/<nom>`. Si l'étape 6 échoue, la ligne
// écrite en 5 est retirée — sinon la bibliothèque afficherait un document sans
// fichier, c'est-à-dire une promesse vide.
// ─────────────────────────────────────────────────────────────────────────────

import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';

import { getBusinessContext } from '../../../../lib/serverAuth';
import { assertAccess, FeatureLockedError } from '../../../../lib/entitlements';
import { logActivity } from '../../../../lib/activityLog';
import {
  DOCUMENTS_BUCKET, DOCUMENT_ENTITY_TYPES, DOCUMENT_MAX_BYTES,
} from '../../../../lib/documents/types';
import {
  resolveUploadMime, buildStoragePath, filenameForMime, formatBytes,
} from '../../../../lib/documents/storage';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const UUID_RE  = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const VISIBILITIES = ['company', 'restricted', 'private'] as const;
type Visibility = (typeof VISIBILITIES)[number];

function field(form: FormData, key: string): string | null {
  const value = form.get(key);
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

export async function POST(request: Request) {
  // ── 1. Qui ────────────────────────────────────────────────────────────────
  let ctx;
  try {
    ctx = await getBusinessContext();
  } catch {
    return NextResponse.json({ error: 'Non authentifié.' }, { status: 401 });
  }

  // ── 2. L'offre et le rôle ─────────────────────────────────────────────────
  //
  // Vérifiés ici et pas seulement dans la navigation : une route API est un
  // point d'entrée public. Masquer l'écran n'empêche pas l'appel.
  try {
    await assertAccess('documents', 'documents:create');
  } catch (err) {
    const locked = err instanceof FeatureLockedError;
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Action non autorisée.' },
      { status: locked ? 402 : 403 },
    );
  }

  const { supabase, businessId, userId } = ctx;

  // ── 3. Le fichier, et sa taille avant tout le reste ───────────────────────
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: 'Envoi illisible.' }, { status: 400 });
  }

  const file = form.get('file');
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: 'Aucun fichier reçu.' }, { status: 400 });
  }

  if (file.size > DOCUMENT_MAX_BYTES) {
    return NextResponse.json(
      {
        error: `Ce fichier pèse ${formatBytes(file.size)} — la limite est de ${formatBytes(DOCUMENT_MAX_BYTES)}. `
             + 'Pour une photo, prenez-la en qualité moyenne ; pour un PDF, envoyez les pages utiles.',
      },
      { status: 413 },
    );
  }

  // ── 4. Ce que le fichier EST ──────────────────────────────────────────────
  //
  // On ne lit qu'une fois : `arrayBuffer()` matérialise le fichier, et c'est ce
  // même tampon qui repart vers le bucket. Le verdict porte sur les premiers
  // octets ; le `Content-Type` déclaré ne sert que d'arbitre entre les types
  // qui partagent une enveloppe (OOXML, OLE2).
  const bytes = new Uint8Array(await file.arrayBuffer());
  const verdict = resolveUploadMime({ bytes, declaredMime: file.type });
  if (!verdict.ok) {
    return NextResponse.json({ error: verdict.reason }, { status: 415 });
  }
  const mime = verdict.mime;

  // ── Les champs de la fiche ────────────────────────────────────────────────
  const filename = filenameForMime(file.name || 'document', mime);
  const name = (field(form, 'name') ?? filename).slice(0, 200);

  const documentTypeId = field(form, 'documentTypeId');
  if (documentTypeId && !UUID_RE.test(documentTypeId)) {
    return NextResponse.json({ error: 'Type de document inconnu.' }, { status: 400 });
  }

  const expiresOn = field(form, 'expiresOn');
  if (expiresOn && !ISO_DATE.test(expiresOn)) {
    return NextResponse.json(
      { error: 'Date d’expiration invalide (format attendu : AAAA-MM-JJ).' },
      { status: 400 },
    );
  }

  const rawVisibility = field(form, 'visibility');
  const visibility: Visibility | null =
    rawVisibility && (VISIBILITIES as readonly string[]).includes(rawVisibility)
      ? (rawVisibility as Visibility)
      : null;

  const description = field(form, 'description')?.slice(0, 2000) ?? null;

  const tags = (field(form, 'tags') ?? '')
    .split(',')
    .map((t) => t.trim().slice(0, 40))
    .filter(Boolean)
    .slice(0, 20);

  // Le rattachement optionnel : déposer depuis la fiche d'un fournisseur crée
  // le lien dans le même geste (§37).
  const linkType = field(form, 'entityType');
  const linkId   = field(form, 'entityId');
  const linkable =
    linkType !== null && linkId !== null
    && (DOCUMENT_ENTITY_TYPES as readonly string[]).includes(linkType)
    && UUID_RE.test(linkId);

  // ── La visibilité par défaut vient du TYPE ────────────────────────────────
  //
  // `documents.visibility` a pour valeur par défaut `'company'`, et le
  // catalogue porte un `default_visibility` par type — mais rien en base ne
  // relie les deux : aucun déclencheur ne va lire le catalogue à l'insertion.
  // Sans cette lecture, `default_visibility` ne servirait à rien, et une fiche
  // de paie déposée sans mention entrerait en « toute l'entreprise ». La
  // sensibilité du type la protégerait encore côté rôle, mais elle serait
  // rangée à l'inverse de ce que le catalogue annonce.
  //
  // La lecture vaut aussi contrôle d'existence : un `documentTypeId` inconnu —
  // ou appartenant à une autre entreprise, donc invisible pour RLS — fait
  // échouer le dépôt. Le ranger « sans type » serait plus doux et plus faux :
  // le marchand aurait choisi une famille, et le document serait ailleurs.
  let typeId: string | null = null;
  let typeVisibility: Visibility | null = null;

  if (documentTypeId) {
    const { data: type } = await supabase
      .from('document_types')
      .select('id, default_visibility')
      .eq('id', documentTypeId)
      .eq('is_active', true)
      .maybeSingle();

    if (!type) {
      return NextResponse.json({ error: 'Type de document inconnu.' }, { status: 400 });
    }

    typeId = type.id as string;
    const fallback = type.default_visibility as string | null;
    if (fallback && (VISIBILITIES as readonly string[]).includes(fallback)) {
      typeVisibility = fallback as Visibility;
    }
  }

  const finalVisibility = visibility ?? typeVisibility;

  // ── 5. La ligne, qui donne l'identifiant ──────────────────────────────────
  const { data: created, error: insertError } = await supabase
    .from('documents')
    .insert({
      business_id:      businessId,
      name,
      description,
      document_type_id: typeId,
      status:           'active',
      ...(finalVisibility ? { visibility: finalVisibility } : {}),
      storage_bucket:   DOCUMENTS_BUCKET,
      mime_type:        mime,
      size_bytes:       file.size,
      current_version:  1,
      expires_on:       expiresOn,
      tags:             tags.length ? tags : null,
      created_by:       userId,
      owner_user_id:    userId,
    })
    .select('id')
    .single();

  if (insertError || !created) {
    return NextResponse.json(
      { error: insertError?.message ?? "Le document n'a pas pu être enregistré." },
      { status: 400 },
    );
  }

  const documentId = created.id as string;
  const storagePath = buildStoragePath({
    businessId, documentId, version: 1, filename, mime,
  });

  // ── 6. Le fichier ─────────────────────────────────────────────────────────
  const { error: uploadError } = await supabase.storage
    .from(DOCUMENTS_BUCKET)
    .upload(storagePath, bytes, { contentType: mime, upsert: false });

  if (uploadError) {
    // La ligne de l'étape 5 n'a plus de raison d'être : elle n'a jamais été
    // montrée, et un document sans fichier est pire qu'un dépôt raté.
    await supabase.from('documents').delete().eq('id', documentId).eq('business_id', businessId);
    return NextResponse.json(
      { error: `Le fichier n'a pas pu être déposé : ${uploadError.message}` },
      { status: 502 },
    );
  }

  // ── 7. Recoller le chemin, ouvrir l'historique ────────────────────────────
  const [{ error: pathError }, { error: versionError }] = await Promise.all([
    supabase.from('documents')
      .update({ storage_path: storagePath, updated_at: new Date().toISOString() })
      .eq('id', documentId).eq('business_id', businessId),
    supabase.from('document_versions').insert({
      document_id:    documentId,
      business_id:    businessId,
      version:        1,
      storage_bucket: DOCUMENTS_BUCKET,
      storage_path:   storagePath,
      mime_type:      mime,
      size_bytes:     file.size,
      label:          'Original',
      origin:         'user',
      created_by:     userId,
    }),
  ]);

  // Le chemin, lui, est vital : sans lui le fichier existe mais devient
  // introuvable. On défait plutôt que de laisser une ligne orpheline.
  if (pathError) {
    await supabase.storage.from(DOCUMENTS_BUCKET).remove([storagePath]);
    await supabase.from('documents').delete().eq('id', documentId).eq('business_id', businessId);
    return NextResponse.json({ error: pathError.message }, { status: 400 });
  }

  // L'historique, non : un document dont la version 1 n'a pas pu s'inscrire
  // reste un document lisible et téléchargeable. On le signale sans annuler.
  if (versionError) {
    console.error('[documents/upload] version 1 non enregistrée:', versionError.message);
  }

  if (linkable) {
    const { error: linkError } = await supabase.from('document_links').insert({
      document_id: documentId,
      business_id: businessId,
      entity_type: linkType,
      entity_id:   linkId,
      relation:    'attached',
      created_by:  userId,
    });
    if (linkError && linkError.code !== '23505') {
      console.error('[documents/upload] rattachement refusé:', linkError.message);
    }
  }

  void logActivity({
    action: 'create', entity: 'document', entityId: documentId,
    newValues: { name, mime, size_bytes: file.size, storage_path: storagePath },
  });

  revalidatePath('/documents');
  revalidatePath('/documents/bibliotheque');

  return NextResponse.json({ id: documentId, name, mime, sizeBytes: file.size }, { status: 201 });
}
