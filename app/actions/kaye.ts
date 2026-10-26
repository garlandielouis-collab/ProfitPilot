'use server';

// ─────────────────────────────────────────────────────────────────────────────
// Les réglages du kaye — métier, heure du bilan, salaire du patron
//
// Écrits dans `businesses.settings.kaye` (voir lib/kaye.ts pour le pourquoi).
// Seul qui peut modifier les paramètres du commerce peut les changer : un aide
// ne choisit ni le métier de la boutique, ni le salaire de son patron.
// ─────────────────────────────────────────────────────────────────────────────

import { revalidatePath } from 'next/cache';
import { requirePermission } from '../../lib/serverAuth';
import { attempt, UserFacingError, type ActionResult } from '../../lib/actionResult';
import { mergeKaye, normalizeTrade, readKaye, type KayeSettings } from '../../lib/kaye';

export type KayePatch = Partial<Pick<KayeSettings,
  'trade' | 'eveningHour' | 'eveningEnabled' | 'ownerWeeklySalary' | 'setupDone'
>>;

/** Garde ce que l'écran a le droit de changer, et refuse ce qui n'a pas de sens. */
function cleanPatch(patch: KayePatch): KayePatch {
  const out: KayePatch = {};
  if (patch.trade !== undefined) {
    const trade = normalizeTrade(patch.trade);
    if (!trade) throw new UserFacingError('Choisissez Machandiz, Sèvis ou Toulède.');
    out.trade = trade;
  }
  if (patch.eveningHour !== undefined) {
    const hour = Number(patch.eveningHour);
    if (!Number.isInteger(hour) || hour < 0 || hour > 23) {
      throw new UserFacingError("L'heure du bilan doit être entre 0 h et 23 h.");
    }
    out.eveningHour = hour;
  }
  if (patch.eveningEnabled !== undefined) out.eveningEnabled = Boolean(patch.eveningEnabled);
  if (patch.ownerWeeklySalary !== undefined) {
    const salary = patch.ownerWeeklySalary === null ? null : Number(patch.ownerWeeklySalary);
    if (salary !== null && (!Number.isFinite(salary) || salary < 0)) {
      throw new UserFacingError('Le salaire doit être un montant positif.');
    }
    out.ownerWeeklySalary = salary && salary > 0 ? Math.round(salary) : null;
  }
  if (patch.setupDone !== undefined) out.setupDone = Boolean(patch.setupDone);
  return out;
}

export async function saveKayeSettings(patch: KayePatch): Promise<ActionResult<KayeSettings>> {
  return attempt(async () => {
    const clean = cleanPatch(patch);
    const { supabase, businessId } = await requirePermission('settings:write');

    // Lire puis fusionner : `settings` porte peut-être d'autres clés, et un
    // UPDATE de la colonne entière les effacerait.
    const { data: biz, error: readErr } = await supabase
      .from('businesses')
      .select('settings')
      .eq('id', businessId)
      .maybeSingle();
    if (readErr) throw readErr;

    const settings = mergeKaye(biz?.settings, clean);
    const { error } = await supabase
      .from('businesses')
      .update({ settings })
      .eq('id', businessId);
    if (error) throw error;

    revalidatePath('/dashboard');
    return readKaye(settings);
  });
}
