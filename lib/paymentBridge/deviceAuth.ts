// ─────────────────────────────────────────────────────────────────────────────
// Reconnaître un appareil — et ce qu'il a le droit de dire
//
// ── La phrase à retenir ────────────────────────────────────────────────────
//
// C'est le JETON qui désigne l'entreprise. Jamais la requête.
//
// Le §9 du cahier des charges est explicite, et il a raison de l'être : si la
// route acceptait un `business_id` venu du téléphone, un appareil enrôlé chez un
// marchand pourrait déclarer des encaissements chez un autre. Il suffirait de
// changer un champ du corps de la requête pour faire passer pour payées les
// commandes d'une boutique concurrente — ou pour empoisonner son rapprochement.
//
// Aucune fonction de ce fichier n'accepte donc de `businessId` en entrée. Elles le
// RENDENT.
//
// ── Ce que la révocation doit garantir ─────────────────────────────────────
//
// Immédiateté. `authenticateDevice` relit le statut à CHAQUE appel — pas de cache,
// pas de jeton signé portant une durée de validité. Un téléphone volé le vendredi
// soir doit cesser de parler à la seconde où le marchand appuie sur « Révoquer »,
// pas à l'expiration d'un jeton.
//
// C'est un aller-retour SQL par reçu. C'est le prix, et il est juste : le volume
// est de l'ordre de quelques dizaines de messages par jour et par commerce.
// ─────────────────────────────────────────────────────────────────────────────

import { getSupabaseService } from '../supabaseServiceClient';
import { hashDeviceToken, issueDeviceToken, sameHash } from './devices';
import { BridgeError, logPaymentEvent } from './intents';
import type { DeviceStatus } from './types';

export type AuthenticatedDevice = {
  deviceId:   string;
  businessId: string;
  deviceName: string;
  status:     DeviceStatus;
};

export type DeviceAuthResult =
  | { ok: true;  device: AuthenticatedDevice }
  /**
   * `status` est le code HTTP à rendre, et `reason` un message volontairement
   * PAUVRE. Un refus détaillé (« ce jeton existe mais l'appareil est révoqué »)
   * apprendrait à qui teste des jetons lesquels sont valides.
   */
  | { ok: false; status: 401 | 403; reason: string };

/**
 * Qui parle, et pour quelle entreprise.
 *
 * Le jeton en clair n'est jamais comparé à la base : il est haché, et c'est le
 * hachage qu'on cherche. La comparaison finale passe malgré tout par
 * `sameHash` (temps constant) — la requête indexée a déjà trouvé la ligne, mais
 * la défense en profondeur ne coûte rien ici.
 */
export async function authenticateDevice(token: string): Promise<DeviceAuthResult> {
  const hash = hashDeviceToken(token);

  const { data, error } = await getSupabaseService()
    .from('merchant_devices')
    // `token_hash` est demandé NOMMÉMENT. La clé service peut le lire ; le rôle
    // `authenticated`, non — le GRANT de la migration ne liste pas cette colonne.
    .select('id, business_id, device_name, status, token_hash')
    .eq('token_hash', hash)
    .maybeSingle();

  if (error) {
    // Une base injoignable n'est pas un refus d'identité. Rendre 401 ferait
    // conclure au téléphone que son jeton est mauvais, et certains clients
    // effacent leurs identifiants sur un 401 — un à-coup réseau désenrôlerait
    // l'appareil. C'est la même distinction que `isTransportFailure` dans
    // lib/serverAuth.ts, et elle a le même enjeu.
    throw new Error(`appareil illisible : ${error.message}`);
  }

  if (!data) return { ok: false, status: 401, reason: 'Appareil non reconnu.' };

  const row = data as any;
  if (!sameHash(row.token_hash, hash)) {
    return { ok: false, status: 401, reason: 'Appareil non reconnu.' };
  }

  // Relu à chaque appel. Voir l'en-tête : c'est ce qui rend la révocation
  // immédiate.
  if (row.status === 'revoked') {
    return { ok: false, status: 403, reason: 'Cet appareil a été révoqué.' };
  }

  return {
    ok: true,
    device: {
      deviceId:   row.id,
      businessId: row.business_id,
      deviceName: row.device_name,
      status:     row.status as DeviceStatus,
    },
  };
}

/**
 * Enrôler un appareil.
 *
 * Appelée depuis une session AUTHENTIFIÉE du marchand — c'est lui qui décide
 * qu'un téléphone a le droit de déclarer ses encaissements, et c'est ce geste-là
 * qui lie l'appareil à l'entreprise (§36). Un appareil ne s'enrôle pas tout seul :
 * il n'y a aucune route publique d'enrôlement.
 *
 * Le jeton en clair est rendu UNE FOIS. Il n'est pas relisible ensuite, et c'est
 * voulu : voir l'en-tête de devices.ts.
 */
export async function registerDevice(params: {
  businessId: string;
  userId:     string;
  deviceName: string;
  platform?:  'android' | 'ios' | 'web' | 'other';
  appVersion?: string | null;
}): Promise<{ deviceId: string; token: string; prefix: string }> {
  const issued = issueDeviceToken();

  const { data, error } = await getSupabaseService()
    .from('merchant_devices')
    .insert({
      business_id:   params.businessId,
      device_name:   params.deviceName.trim().slice(0, 80) || 'Téléphone',
      platform:      params.platform ?? 'android',
      app_version:   params.appVersion ?? null,
      token_hash:    issued.hash,
      token_prefix:  issued.prefix,
      // `active` et non `pending` : le marchand vient de faire le geste, et lui
      // demander de confirmer deux fois n'ajoute aucune sécurité. `pending` reste
      // dans le CHECK pour un enrôlement par code à saisir sur le téléphone, si
      // ce parcours est ajouté plus tard.
      status:        'active',
      registered_by: params.userId,
    })
    .select('id')
    .single();

  if (error) throw new Error(`appareil non enrôlé : ${error.message}`);

  const deviceId = (data as any).id as string;

  await logPaymentEvent({
    businessId: params.businessId,
    eventType:  'device_registered',
    actorType:  'merchant',
    actorId:    params.userId,
    actorLabel: params.deviceName,
    // Le préfixe, jamais le jeton. Le journal est lisible par tous les membres.
    metadata:   { device_id: deviceId, token_prefix: issued.prefix },
  });

  return { deviceId, token: issued.token, prefix: issued.prefix };
}

/**
 * Révoquer.
 *
 * Écrit aussi par la politique RLS `md_update` depuis l'interface : le marchand
 * peut révoquer sans que cette fonction existe, et c'est délibéré. Révoquer est
 * le geste le plus urgent du module — téléphone perdu, employé parti — et il ne
 * doit dépendre d'aucune route qui pourrait être en panne.
 *
 * Cette fonction sert le chemin serveur, pour que le journal soit écrit et que
 * l'action laisse la même trace quelle que soit la porte.
 */
export async function revokeDevice(params: {
  deviceId:   string;
  businessId: string;
  /**
   * Le membre qui révoque. `null` quand c'est l'appareil lui-même qui se retire
   * (désinstallation, déconnexion) : il a le droit de renoncer à son propre
   * accès, jamais à celui d'un autre.
   */
  userId:     string | null;
}): Promise<void> {
  const { data, error } = await getSupabaseService()
    .from('merchant_devices')
    .update({
      status:     'revoked',
      revoked_at: new Date().toISOString(),
      revoked_by: params.userId,
    })
    .eq('id', params.deviceId)
    // Le cloisonnement, écrit ICI : la clé service ignore la RLS, et sans ce
    // filtre un identifiant d'appareil suffirait à révoquer le téléphone d'un
    // autre commerce.
    .eq('business_id', params.businessId)
    .select('id, device_name')
    .maybeSingle();

  if (error) throw new Error(`appareil non révoqué : ${error.message}`);
  if (!data) throw new BridgeError('Appareil introuvable.');

  await logPaymentEvent({
    businessId: params.businessId,
    eventType:  'device_revoked',
    actorType:  params.userId ? 'merchant' : 'device',
    actorId:    params.userId,
    actorLabel: (data as any).device_name,
    metadata:   { device_id: params.deviceId },
  });
}

/**
 * « Je suis là. »
 *
 * Sert à une chose utile au marchand : distinguer « aucun paiement n'est arrivé »
 * de « mon téléphone ne parle plus depuis hier ». Sans ce battement, un compagnon
 * hors service est indistinguable d'une journée sans vente — et le marchand
 * n'apprend la panne qu'en constatant des commandes non réglées.
 *
 * N'écrit rien d'autre que deux horodatages. Un appareil ne peut pas se
 * ré-autoriser lui-même en battant : un appareil révoqué est refusé avant
 * d'arriver ici, par `authenticateDevice`.
 */
export async function deviceHeartbeat(params: {
  deviceId:    string;
  appVersion?: string | null;
  synced?:     boolean;
}): Promise<void> {
  const now = new Date().toISOString();

  const patch: Record<string, unknown> = { last_seen_at: now };
  if (params.synced) patch.last_sync_at = now;
  if (params.appVersion) patch.app_version = String(params.appVersion).slice(0, 40);

  // `offline` repasse `active` : c'est le seul changement de statut qu'un battement
  // provoque, et il ne va que dans ce sens. `revoked` n'est pas dans le filtre.
  const { error } = await getSupabaseService()
    .from('merchant_devices')
    .update({ ...patch, status: 'active' })
    .eq('id', params.deviceId)
    .in('status', ['active', 'offline', 'pending']);

  if (error) throw new Error(`battement non enregistré : ${error.message}`);
}
