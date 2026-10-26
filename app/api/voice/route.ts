// ─────────────────────────────────────────────────────────────────────────────
// POST /api/voice — un vocal devient des brouillons (spécification « commande
// vocale et matériel de caisse », §2.2)
//
//   1. droits : la voix est dans les trois offres (`voice_entry`) ; 50 vocaux
//      par jour et par commerce (`VOICE_DAILY_LIMIT`, décision du 26/10/2026) ;
//   2. transcription (lib/voice/transcription.ts) ;
//   3. extraction structurée avec le catalogue et les clients du commerce
//      (lib/voice/extract.ts), revérifiée, une seule nouvelle tentative ;
//   4. normalisation en brouillons (lib/voice/draft.ts).
//
// RIEN n'est enregistré ici, sinon la trace du vocal (`voice_notes`) : le
// marchand confirme chaque brouillon d'un tap (app/actions/voiceDrafts.ts).
// L'audio n'est jamais conservé.
//
// GET répond si la voix est disponible : l'écran ne montre pas un micro mort.
// ─────────────────────────────────────────────────────────────────────────────

import { NextResponse, type NextRequest } from 'next/server';
import { getBusinessContext } from '../../../lib/serverAuth';
import { hasFeature } from '../../../lib/entitlements';
import { getTranscriptionProvider } from '../../../lib/voice/transcription';
import { extractVoiceTransactions } from '../../../lib/voice/extract';
import { buildVoiceContext } from '../../../lib/voice/context';
import { normalizeExtraction } from '../../../lib/voice/draft';
import { localDay, zonedDayBounds } from '../../../lib/eveningReport';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** Une minute de voix compressée tient sous 2 Mo (§2.1 : 60 s au plus). */
const MAX_AUDIO_BYTES = 2 * 1024 * 1024;

function dailyLimit(): number {
  const n = Number(process.env.VOICE_DAILY_LIMIT);
  return Number.isInteger(n) && n > 0 ? n : 50;
}

const missingTable = (error: any) => error && ['42P01', 'PGRST205'].includes(error.code);

const fail = (status: number, ht: string, fr: string, code?: string) =>
  NextResponse.json({ error: ht, errorFr: fr, ...(code ? { code } : {}) }, { status });

export async function GET() {
  // Disponible = tout ce que POST exigera : la clé de transcription, la
  // session, l'offre, et la table des vocaux (migration 20261026 collée).
  if (!getTranscriptionProvider()) return NextResponse.json({ available: false });
  try {
    const ctx = await getBusinessContext();
    if (!ctx.can('sales:create') || !(await hasFeature('voice_entry'))) return NextResponse.json({ available: false });
    const { error } = await ctx.supabase.from('voice_notes').select('id', { head: true }).limit(1);
    return NextResponse.json({ available: !missingTable(error) });
  } catch {
    return NextResponse.json({ available: false });
  }
}

export async function POST(req: NextRequest) {
  let ctx: Awaited<ReturnType<typeof getBusinessContext>>;
  try {
    ctx = await getBusinessContext();
  } catch {
    return fail(401, 'Ou pa konekte.', 'Non connecté.');
  }
  if (!ctx.can('sales:create')) return fail(403, 'Ou pa gen dwa note vant.', 'Vous ne pouvez pas noter de ventes.');
  if (!(await hasFeature('voice_entry'))) return fail(403, 'Vwa a pa nan ofr ou.', 'La voix n’est pas dans votre offre.');

  const provider = getTranscriptionProvider();
  if (!provider) return fail(503, 'Vwa a poko aktive.', 'La saisie vocale n’est pas encore activée.', 'voice_unavailable');

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return fail(400, 'Demann lan pa bon.', 'Requête invalide.');
  }
  const audio = form.get('audio');
  if (!(audio instanceof Blob) || audio.size === 0) return fail(400, 'Pa gen son.', 'Aucun son reçu.');
  if (audio.size > MAX_AUDIO_BYTES) {
    return fail(413, 'Vokal la twò long : di l an yon fraz.', 'Message trop long : dites-le en une phrase.');
  }
  // L'heure de l'enregistrement, pas celle du traitement (§2.3).
  const recordedAtRaw = String(form.get('recordedAt') ?? '');
  const recordedAt = Number.isNaN(Date.parse(recordedAtRaw)) ? new Date().toISOString() : new Date(recordedAtRaw).toISOString();

  // ── La limite du jour, avant de payer quoi que ce soit ────────────────────
  const { data: biz } = await ctx.supabase.from('businesses').select('timezone').eq('id', ctx.businessId).maybeSingle();
  const tz = biz?.timezone || 'America/Port-au-Prince';
  const { start, end } = zonedDayBounds(localDay(new Date(), tz), tz);
  const { count, error: countErr } = await ctx.supabase
    .from('voice_notes')
    .select('id', { count: 'exact', head: true })
    .eq('business_id', ctx.businessId)
    .gte('created_at', start)
    .lt('created_at', end);
  if (missingTable(countErr)) {
    return fail(503, 'Vwa a poko ouvri sou kont sa a.', 'La voix n’est pas encore ouverte sur ce compte (mise à jour en attente).', 'voice_unavailable');
  }
  const limit = dailyLimit();
  if ((count ?? 0) >= limit) {
    return fail(429, `Ou rive nan ${limit} vokal jodi a. Tape montan an ; demen vwa a ap tounen.`,
      `Vous avez atteint ${limit} vocaux aujourd’hui. Tapez le montant ; la voix revient demain.`, 'voice_limit');
  }

  const { data: note, error: noteErr } = await ctx.supabase
    .from('voice_notes')
    .insert({ business_id: ctx.businessId, user_id: ctx.userId, provider: provider.name, recorded_at: recordedAt })
    .select('id')
    .single();
  if (noteErr || !note) return fail(500, 'Nou pa ka resevwa vokal la kounye a.', 'Le vocal n’a pas pu être reçu.');

  // ── Transcription ─────────────────────────────────────────────────────────
  let transcription = '';
  try {
    transcription = await provider.transcribe(new Uint8Array(await audio.arrayBuffer()));
  } catch (error) {
    console.error('[voice] transcription impossible :', error instanceof Error ? error.message : error);
    await ctx.supabase.from('voice_notes').update({ status: 'failed' }).eq('id', note.id);
    return fail(502, 'M pa t ka tande vokal la. Eseye ankò, pi pre telefòn nan.', 'Le son n’a pas pu être compris. Réessayez, plus près du téléphone.');
  }

  // ── Extraction ────────────────────────────────────────────────────────────
  const voiceCtx = await buildVoiceContext(ctx.supabase, ctx.businessId, ctx.exchangeRateSet ? ctx.exchangeRate : null);
  const outcome = transcription
    ? await extractVoiceTransactions(transcription, voiceCtx, ctx.defaultCurrency)
    : { ok: false as const, attempts: 0 };

  if (!outcome.ok) {
    await ctx.supabase.from('voice_notes')
      .update({ status: 'manual', transcription, attempts: outcome.attempts })
      .eq('id', note.id);
    return NextResponse.json({ noteId: note.id, transcription, drafts: [], manual: true, recordedAt });
  }

  const drafts = normalizeExtraction(outcome.raw, voiceCtx);
  await ctx.supabase.from('voice_notes')
    .update({ status: 'ready', transcription, drafts, attempts: outcome.attempts })
    .eq('id', note.id);

  return NextResponse.json({
    noteId: note.id,
    transcription,
    drafts,
    manual: false,
    recordedAt,
    usage: { used: (count ?? 0) + 1, limit },
  });
}
