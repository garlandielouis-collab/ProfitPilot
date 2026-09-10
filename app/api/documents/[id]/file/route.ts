// ─────────────────────────────────────────────────────────────────────────────
// GET /api/documents/[id]/file — le SEUL chemin de lecture d'un document
//
//   navigateur
//     → getBusinessContext()          qui est-ce, quelle entreprise
//     → SELECT sur `documents`        RLS applique can_read_document(id)
//     → service.createSignedUrl(60s)  le chemin ne sort jamais d'ici
//     → 302 vers l'URL signée
//
// ── Pourquoi la lecture de la ligne SUFFIT à autoriser ──────────────────────
//
// La politique `documents_select` est `USING (can_read_document(id))` : rôle,
// sensibilité du type et visibilité du document y sont déjà pesés. Une ligne
// qui revient est une ligne que l'appelant a le droit de voir. Refaire ce
// calcul ici donnerait une seconde règle à maintenir, et le jour où les deux
// divergeraient, c'est la plus permissive qui gagnerait.
//
// Un refus ne se distingue donc pas d'une absence : les deux rendent 404. C'est
// voulu — répondre 403 sur un document confidentiel confirmerait son existence.
//
// ── Pourquoi le client de service pour l'URL signée ─────────────────────────
//
// La politique RLS du bucket est la SECONDE barrière, celle qui protège d'un
// appel direct depuis le navigateur. Elle raisonne sur le premier segment du
// chemin ; sur un projet où elle n'a pas pu s'installer (schéma `storage` non
// possédé par le rôle de migration), le module cesserait de fonctionner. La
// décision d'accès est déjà prise ci-dessus, à l'endroit qui la connaît.
// ─────────────────────────────────────────────────────────────────────────────

import { NextResponse, type NextRequest } from 'next/server';

import { getBusinessContext } from '../../../../../lib/serverAuth';
import { assertAccess, FeatureLockedError } from '../../../../../lib/entitlements';
import { logActivity } from '../../../../../lib/activityLog';
import { getSupabaseService } from '../../../../../lib/supabaseServiceClient';
import { DOCUMENTS_BUCKET } from '../../../../../lib/documents/types';
import {
  ALLOWED_MIME_TYPES, filenameForMime, sanitizeFilename, type AllowedMime,
} from '../../../../../lib/documents/storage';

export const runtime = 'nodejs';
// Une URL signée vit soixante secondes : rien de tout cela ne se met en cache.
export const dynamic = 'force-dynamic';

const SIGNED_URL_TTL_SECONDS = 60;

const notFound = () =>
  NextResponse.json({ error: 'Document introuvable.' }, { status: 404 });

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  let ctx;
  try {
    ctx = await getBusinessContext();
  } catch {
    return NextResponse.json({ error: 'Non authentifié.' }, { status: 401 });
  }

  try {
    await assertAccess('documents', 'documents:read');
  } catch (err) {
    const locked = err instanceof FeatureLockedError;
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Action non autorisée.' },
      { status: locked ? 402 : 403 },
    );
  }

  const { supabase, businessId } = ctx;

  // `maybeSingle()` et non `single()` : une ligne refusée par RLS revient VIDE,
  // pas en erreur. `single()` lèverait « 0 rows » là où il n'y a qu'un refus.
  const { data: doc, error } = await supabase
    .from('documents')
    .select('id, name, mime_type, storage_bucket, storage_path')
    .eq('id', id)
    .eq('business_id', businessId)
    .is('deleted_at', null)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  if (!doc) return notFound();

  // ── La version demandée ───────────────────────────────────────────────────
  //
  // Sans paramètre, c'est le fichier vif porté par `documents`. Avec, on relit
  // `document_versions` — dont la politique appelle la MÊME fonction, donc
  // l'autorisation ne se rejoue pas ici non plus.
  let bucket = doc.storage_bucket ?? DOCUMENTS_BUCKET;
  let path   = doc.storage_path as string | null;
  let mime   = doc.mime_type as string | null;

  const askedVersion = Number(request.nextUrl.searchParams.get('version'));
  if (Number.isInteger(askedVersion) && askedVersion >= 1) {
    const { data: version } = await supabase
      .from('document_versions')
      .select('storage_bucket, storage_path, mime_type')
      .eq('document_id', id)
      .eq('version', askedVersion)
      .is('deleted_at', null)
      .maybeSingle();

    if (!version?.storage_path) return notFound();
    bucket = version.storage_bucket ?? DOCUMENTS_BUCKET;
    path   = version.storage_path;
    mime   = version.mime_type ?? mime;
  }

  // Un document dynamique (§29) n'a pas encore de fichier : il se rend, il ne
  // se télécharge pas. Le dire vaut mieux qu'un 404 qui ferait croire à une
  // perte de données.
  if (!path) {
    return NextResponse.json(
      { error: "Ce document n'a pas de fichier joint." },
      { status: 409 },
    );
  }

  const wantsDownload = request.nextUrl.searchParams.get('download') === '1';

  const { data: signed, error: signError } = await getSupabaseService()
    .storage
    .from(bucket)
    .createSignedUrl(path, SIGNED_URL_TTL_SECONDS, {
      // Le nom rendu au marchand est celui de sa fiche — « Licence 2027.pdf »,
      // pas le dernier segment d'un chemin technique.
      // Un type inconnu — une ligne d'avant le catalogue — ne doit pas produire
      // « Licence.undefined » : on garde alors le nom tel qu'il est.
      ...(wantsDownload
        ? {
            download: (ALLOWED_MIME_TYPES as readonly string[]).includes(mime ?? '')
              ? filenameForMime(doc.name, mime as AllowedMime)
              : sanitizeFilename(doc.name),
          }
        : {}),
    });

  if (signError || !signed?.signedUrl) {
    return NextResponse.json(
      { error: "Le fichier est momentanément inaccessible." },
      { status: 502 },
    );
  }

  // §43 : le téléchargement se journalise ici, parce que c'est ici qu'il a
  // lieu. La CONSULTATION, elle, se journalise depuis la fiche : l'aperçu d'une
  // image ou d'un PDF passe par cette route, un `.docx` non — journaliser aux
  // deux endroits produirait deux lignes pour une seule ouverture sur les
  // formats affichables, et aucune sur les autres. Le journal ne bloque jamais.
  if (wantsDownload) {
    void logActivity({ action: 'download', entity: 'document', entityId: id });
  }

  return NextResponse.redirect(signed.signedUrl, {
    status: 302,
    headers: { 'Cache-Control': 'no-store, max-age=0' },
  });
}
