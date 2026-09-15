// ─────────────────────────────────────────────────────────────────────────────
// Déposer une NOUVELLE version d'un document (§38)
//
// La route de dépôt initial crée un document ; celle-ci en fait avancer un qui
// existe. La différence tient en une ligne : ici, l'identifiant du document est
// donné, et c'est la politique RLS qui dit si on a le droit d'y toucher.
//
// ── L'ordre des écritures ───────────────────────────────────────────────────
//
//   1. le fichier part vers le bucket, à un chemin qui porte le NUMÉRO de la
//      nouvelle version — donc sans jamais écraser celui de la précédente ;
//   2. la ligne de version s'inscrit ;
//   3. le document pointe sur elle.
//
// Si (2) échoue, on retire le fichier : une version invisible est un objet
// payé et jamais lu. Si (3) échoue après (2), le document reste sur l'ancienne
// version et la nouvelle apparaît dans l'historique — état incohérent mais
// lisible, et réparable d'un clic sur « Restaurer ».
//
// ── Pourquoi le MIME peut changer ───────────────────────────────────────────
//
// Rien n'interdit de remplacer un scan JPEG par le PDF signé du même contrat :
// c'est même le cas le plus fréquent. Le type de la nouvelle version est donc
// détecté à part, et le document adopte celui de sa version courante.
// ─────────────────────────────────────────────────────────────────────────────

import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';

import { getBusinessContext } from '../../../../../lib/serverAuth';
import { assertAccess, FeatureLockedError } from '../../../../../lib/entitlements';
import { logActivity } from '../../../../../lib/activityLog';
import { DOCUMENTS_BUCKET, DOCUMENT_MAX_BYTES } from '../../../../../lib/documents/types';
import {
  resolveUploadMime, buildStoragePath, filenameForMime, formatBytes,
} from '../../../../../lib/documents/storage';
import { screenMessage } from '../../../../../lib/actionResult';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function field(form: FormData, key: string): string | null {
  const value = form.get(key);
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: 'Document inconnu.' }, { status: 400 });
  }

  let ctx;
  try {
    ctx = await getBusinessContext();
  } catch {
    return NextResponse.json({ error: 'Non authentifié.' }, { status: 401 });
  }

  try {
    await assertAccess('documents', 'documents:update');
  } catch (err) {
    const locked = err instanceof FeatureLockedError;
    return NextResponse.json(
      { error: screenMessage(err, 'Action non autorisée.') },
      { status: locked ? 402 : 403 },
    );
  }

  const { supabase, businessId, userId } = ctx;

  // ── Le document existe-t-il, et pour cet utilisateur-là ? ─────────────────
  //
  // Une ligne qui ne revient pas est un refus. On répond 404, jamais 403 :
  // dire « interdit » confirmerait l'existence du document à qui le cherche.
  const { data: document, error: readError } = await supabase
    .from('documents')
    .select('id, name, current_version, content_blocks')
    .eq('id', id)
    .eq('business_id', businessId)
    .is('deleted_at', null)
    .maybeSingle();

  if (readError) return NextResponse.json({ error: readError.message }, { status: 400 });
  if (!document) return NextResponse.json({ error: 'Document introuvable.' }, { status: 404 });

  if (document.content_blocks != null) {
    return NextResponse.json(
      { error: 'Ce document est écrit dans l’application : ses versions se créent en l’éditant, pas en déposant un fichier.' },
      { status: 409 },
    );
  }

  // ── Le fichier ────────────────────────────────────────────────────────────
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
        error: `Ce fichier pèse ${formatBytes(file.size)} — la limite est de ${formatBytes(DOCUMENT_MAX_BYTES)}.`,
      },
      { status: 413 },
    );
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const verdict = resolveUploadMime({ bytes, declaredMime: file.type });
  if (!verdict.ok) return NextResponse.json({ error: verdict.reason }, { status: 415 });

  const mime     = verdict.mime;
  const filename = filenameForMime(file.name || 'document', mime);
  const label    = field(form, 'label')?.slice(0, 120) ?? null;

  const version = (document.current_version ?? 1) + 1;
  const storagePath = buildStoragePath({ businessId, documentId: id, version, filename, mime });

  const { error: uploadError } = await supabase.storage
    .from(DOCUMENTS_BUCKET)
    .upload(storagePath, bytes, { contentType: mime, upsert: false });

  if (uploadError) {
    return NextResponse.json(
      { error: `Le fichier n'a pas pu être déposé : ${uploadError.message}` },
      { status: 502 },
    );
  }

  const { error: versionError } = await supabase.from('document_versions').insert({
    document_id:    id,
    business_id:    businessId,
    version,
    storage_bucket: DOCUMENTS_BUCKET,
    storage_path:   storagePath,
    mime_type:      mime,
    size_bytes:     file.size,
    label,
    origin:         'user',
    created_by:     userId,
  });

  if (versionError) {
    await supabase.storage.from(DOCUMENTS_BUCKET).remove([storagePath]);
    return NextResponse.json({ error: versionError.message }, { status: 400 });
  }

  const { error: pointError } = await supabase
    .from('documents')
    .update({
      current_version: version,
      storage_bucket:  DOCUMENTS_BUCKET,
      storage_path:    storagePath,
      mime_type:       mime,
      size_bytes:      file.size,
      updated_at:      new Date().toISOString(),
    })
    .eq('id', id)
    .eq('business_id', businessId);

  if (pointError) {
    return NextResponse.json(
      { error: `La version ${version} est enregistrée, mais le document pointe encore sur la précédente : ${pointError.message}` },
      { status: 500 },
    );
  }

  void logActivity({
    action: 'update', entity: 'document_version', entityId: id,
    newValues: { version, mime, size_bytes: file.size, label },
  });

  revalidatePath(`/documents/${id}`);
  revalidatePath('/documents');

  return NextResponse.json({ id, version, mime, sizeBytes: file.size }, { status: 201 });
}
