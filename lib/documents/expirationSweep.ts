// ─────────────────────────────────────────────────────────────────────────────
// Le moteur d'expiration documentaire (§34)
//
// Passe une fois par nuit, dans le cron quotidien qui existe déjà. L'audit
// était clair là-dessus : pas de cron neuf pour un quatrième balayage — une
// route de plus à surveiller, une entrée de plus dans `vercel.json`, et le même
// travail.
//
// ── Ce qu'il fait, dans l'ordre ─────────────────────────────────────────────
//
//   1. bascule en `expired` les documents dont la date est passée
//   2. prévient à J-30, J-15, J-7, J-1, le jour même, et le lendemain
//   3. ne prévient jamais deux fois le même jour pour le même document
//
// Le point 1 est ce qui rend le statut honnête : sans lui, une patente périmée
// depuis six mois s'afficherait encore « active » parce que personne n'a rouvert
// sa fiche. Le statut cesserait de vouloir dire quelque chose.
//
// ── Pourquoi des jours EXACTS et pas des seuils ─────────────────────────────
//
// « Moins de 30 jours » préviendrait trente fois. Les quatre paliers du §34
// sont des rendez-vous : un rappel loin pour s'organiser, un proche pour agir,
// un dernier pour ne pas oublier. Entre deux paliers, l'application se tait —
// c'est ce silence qui fait qu'on lit les alertes qui restent.
//
// ── Clé de service, et c'est justifié ───────────────────────────────────────
//
// Ce code tourne sans utilisateur : il n'y a pas de session dont RLS pourrait
// tirer un `business_id`. C'est l'un des trois cas que l'audit autorise —
// crons, webhooks, compteurs de quota — et le cadrage se fait alors à la main,
// entreprise par entreprise, dans les requêtes ci-dessous.
// ─────────────────────────────────────────────────────────────────────────────

import { getSupabaseService } from '../supabaseServiceClient';
import { notify } from '../notify';
import { REMINDER_OFFSETS_DAYS, daysUntilExpiration, todayISO } from './types';

export type ExpirationSweepResult = {
  /** Documents passés en `expired` cette nuit. */
  transitioned: number;
  /** Notifications réellement envoyées. */
  alerts: number;
};

/** Les paliers où l'on parle. Le reste du temps, on se tait. */
const SPEAKING_DAYS = new Set<number>([...REMINDER_OFFSETS_DAYS, 0, -1]);

function alertText(name: string, daysLeft: number): { title: string; body: string } {
  if (daysLeft < 0) {
    return {
      title: `Dokiman ekspire : ${name}`,
      body:  'Dat la pase depi yè. Renouvle l anvan ou bezwen l.',
    };
  }
  if (daysLeft === 0) {
    return {
      title: `Dokiman an ekspire jodi a : ${name}`,
      body:  'Se jodi a dat la rive. Aji jodi a.',
    };
  }
  if (daysLeft === 1) {
    return {
      title: `Demen : ${name}`,
      body:  'Dokiman an ekspire demen.',
    };
  }
  return {
    title: `Nan ${daysLeft} jou : ${name}`,
    body:  `Dokiman an ap ekspire nan ${daysLeft} jou. Kòmanse demach la kounye a.`,
  };
}

export async function sweepDocumentExpirations(): Promise<ExpirationSweepResult> {
  const svc = getSupabaseService();
  const today = todayISO();

  // ── 1. Le statut suit la date ─────────────────────────────────────────────
  //
  // `active` et `approved` seulement : un brouillon expiré reste un brouillon,
  // et un document archivé a déjà quitté la vue courante.
  const { data: expiredRows } = await svc
    .from('documents')
    .update({ status: 'expired', updated_at: new Date().toISOString() })
    .lt('expires_on', today)
    .in('status', ['active', 'approved'])
    .is('deleted_at', null)
    .select('id');

  const transitioned = (expiredRows ?? []).length;

  // ── 2. Les échéances dont il faut parler ──────────────────────────────────
  //
  // Une seule requête pour toutes les entreprises : la borne haute est le plus
  // grand palier, la borne basse hier. Charger tout `documents` pour filtrer
  // en mémoire coûterait la table entière chaque nuit.
  const horizon = new Date(`${today}T00:00:00Z`);
  horizon.setUTCDate(horizon.getUTCDate() + Math.max(...REMINDER_OFFSETS_DAYS));
  const floor = new Date(`${today}T00:00:00Z`);
  floor.setUTCDate(floor.getUTCDate() - 1);

  const { data: documents } = await svc
    .from('documents')
    .select('id, business_id, name, expires_on')
    .not('expires_on', 'is', null)
    .gte('expires_on', floor.toISOString().slice(0, 10))
    .lte('expires_on', horizon.toISOString().slice(0, 10))
    .neq('status', 'archived')
    .neq('status', 'draft')
    .is('deleted_at', null);

  const candidates = (documents ?? []).filter((doc: any) => {
    const daysLeft = daysUntilExpiration(doc.expires_on, today);
    return daysLeft !== null && SPEAKING_DAYS.has(daysLeft);
  });

  if (candidates.length === 0) return { transitioned, alerts: 0 };

  // ── 3. Le garde-fou : une alerte par document et par jour ─────────────────
  //
  // Le cron peut être rejoué — un déploiement, une reprise après incident. Sans
  // cette lecture, une reprise à midi doublerait toutes les alertes du matin, et
  // un marchand noyé sous les alertes les désactive toutes.
  const { data: already } = await svc
    .from('notifications')
    .select('reference_id')
    .eq('reference_type', 'document')
    .in('type', ['document_expiring', 'document_expired'])
    .gte('created_at', `${today}T00:00:00Z`);

  const alertedToday = new Set((already ?? []).map((n: any) => n.reference_id));

  let alerts = 0;
  for (const doc of candidates) {
    if (alertedToday.has(doc.id)) continue;

    const daysLeft = daysUntilExpiration(doc.expires_on, today) as number;
    const { title, body } = alertText(doc.name, daysLeft);

    await notify({
      companyId: doc.business_id,
      type: daysLeft < 0 ? 'document_expired' : 'document_expiring',
      title,
      body,
      entity: 'document',
      entityId: doc.id,
      data: { href: `/documents/${doc.id}`, daysLeft, expiresOn: doc.expires_on },
    });

    alerts++;
  }

  return { transitioned, alerts };
}
