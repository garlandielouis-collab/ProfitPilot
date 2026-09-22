// ─────────────────────────────────────────────────────────────────────────────
// Le balayage quotidien de Payment Bridge
//
// Deux ménages, aucun qui touche à de l'argent :
//
//   les SESSIONS échues sont fermées en base (`pp_expire_payment_sessions`), et
//   les dettes réellement abandonnées — rien reçu, rien signalé — passent « sans
//   suite ». La page de paiement n'attend pas ce balayage pour afficher un délai
//   écoulé (elle compare l'heure elle-même, voir `getPublicIntent`) : il sert à
//   ce que la boîte de réception du marchand ne garde pas « en attente » pour
//   toujours une commande que personne ne paiera.
//
//   les TÉLÉPHONES muets depuis plus d'un jour passent « hors ligne ». C'est ce
//   qui permet au marchand de distinguer « aucun paiement aujourd'hui » de « mon
//   téléphone ne parle plus » — sans ce statut, les deux se ressemblent.
// ─────────────────────────────────────────────────────────────────────────────

import { getSupabaseService } from '../supabaseServiceClient';

const OFFLINE_AFTER_MS = 24 * 60 * 60 * 1000;

export async function sweepPaymentBridge(): Promise<{ sessions: number; intents: number; offline: number }> {
  const svc = getSupabaseService();

  const { data, error } = await svc.rpc('pp_expire_payment_sessions');
  if (error) throw new Error(`sessions non balayées : ${error.message}`);
  const row = (Array.isArray(data) ? data[0] : data) as any;

  const cutoff = new Date(Date.now() - OFFLINE_AFTER_MS).toISOString();
  const { data: offline, error: devErr } = await svc
    .from('merchant_devices')
    .update({ status: 'offline' })
    .eq('status', 'active')
    .lt('last_seen_at', cutoff)
    .select('id');
  if (devErr) throw new Error(`appareils non balayés : ${devErr.message}`);

  return {
    sessions: Number(row?.out_sessions ?? 0),
    intents:  Number(row?.out_intents ?? 0),
    offline:  (offline ?? []).length,
  };
}
