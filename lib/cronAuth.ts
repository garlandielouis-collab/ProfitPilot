// ─────────────────────────────────────────────────────────────────────────────
// Garde d'accès des routes cron.
//
// Ces routes tournent avec la clé service : elles voient TOUTES les entreprises.
// Sans secret partagé, une simple requête HTTP depuis Internet déclencherait
// des notifications chez tous les marchands.
// ─────────────────────────────────────────────────────────────────────────────

import type { NextRequest } from 'next/server';

/**
 * Vrai si l'appel vient bien de l'ordonnanceur.
 *
 * Accepte l'en-tête `Authorization: Bearer <CRON_SECRET>` (format Vercel Cron)
 * ou `x-cron-secret`. Sans `CRON_SECRET` configuré, tout est refusé : mieux
 * vaut un cron muet qu'un endpoint ouvert.
 */
export function isAuthorizedCron(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;

  const bearer = req.headers.get('authorization');
  if (bearer === `Bearer ${secret}`) return true;

  return req.headers.get('x-cron-secret') === secret;
}
