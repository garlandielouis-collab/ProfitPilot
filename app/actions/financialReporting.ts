'use server';

// ─────────────────────────────────────────────────────────────────────────────
// Les trois états financiers — compte de résultat, bilan, flux de trésorerie
//
// ── Ce que ce fichier faisait de travers ───────────────────────────────────
//
// Il résolvait l'entreprise LUI-MÊME, quatre fois, en prenant la plus ancienne
// des boutiques du propriétaire :
//
//     .eq('owner_id', user.id).order('created_at').limit(1)
//
// Autrement dit, il ignorait le sélecteur d'entreprise. Un marchand qui possède
// deux commerces, bascule sur le second et demande son bilan obtenait celui du
// PREMIER — sans erreur, sans avertissement, avec le bon en-tête et le mauvais
// contenu. Un état financier sur la mauvaise boutique ne plante pas : c'est
// exactement ce qui le rend dangereux. Il se porte à une banque.
//
// Les quatre résolutions passent maintenant par `getBusinessContext()`, la même
// source que tout le reste du produit — celle qui lit le sélecteur, vérifie
// l'appartenance et renvoie le rôle. Elle est mémoïsée sur la requête : quatre
// appels dans la même action ne coûtent qu'un aller-retour.
//
// ── L'accès en lecture ─────────────────────────────────────────────────────
//
// `reports:read` est vérifié ici : un vendeur ne consulte pas le bilan de
// l'entreprise. Le gating d'offre, lui, se fait à l'écran qui appelle ces
// actions (`/rapports/comptabilite` → `advanced_reports`), comme pour les
// autres rapports du produit.
//
// > Ce fichier n'est encore importé par aucun écran. Il est corrigé maintenant
// > parce qu'un piège désarmé le jour où on le pose coûte une ligne, et le jour
// > où on marche dessus, un client.
// ─────────────────────────────────────────────────────────────────────────────

import {
  generateProfitAndLoss,
  generateBalanceSheet,
  generateCashFlow,
  clearFinancialCache,
  type ProfitAndLossReport,
  type BalanceSheetReport,
  type CashFlowReport,
} from '../../lib/financialReporting';
import { getBusinessContext } from '../../lib/serverAuth';
import { assertPermission } from '../../lib/entitlements';

/** L'entreprise ACTIVE — celle du sélecteur, jamais « la plus ancienne ». */
async function activeBusinessId(): Promise<string> {
  const { businessId } = await getBusinessContext();
  return businessId;
}

/** Le compte de résultat : ce que le commerce a gagné sur une période. */
export async function getProfitAndLossAction(
  startDate: string,
  endDate: string,
  currency: 'HTG' | 'USD' = 'HTG',
): Promise<ProfitAndLossReport> {
  await assertPermission('reports:read');
  return generateProfitAndLoss(await activeBusinessId(), startDate, endDate, currency);
}

/** Le bilan : ce que le commerce possède et ce qu'il doit, à une date. */
export async function getBalanceSheetAction(
  asOfDate: string,
  currency: 'HTG' | 'USD' = 'HTG',
): Promise<BalanceSheetReport> {
  await assertPermission('reports:read');
  return generateBalanceSheet(await activeBusinessId(), asOfDate, currency);
}

/** Les flux de trésorerie : d'où l'argent est venu, où il est allé. */
export async function getCashFlowAction(
  startDate: string,
  endDate: string,
  currency: 'HTG' | 'USD' = 'HTG',
): Promise<CashFlowReport> {
  await assertPermission('reports:read');
  return generateCashFlow(await activeBusinessId(), startDate, endDate, currency);
}

/**
 * Vide le cache des états après une écriture comptable.
 *
 * Volontairement silencieuse : elle est appelée en fin de transaction, et une
 * vente enregistrée ne doit pas échouer parce qu'un cache n'a pas pu être vidé.
 * Au pire, un rapport reste tiède quelques minutes.
 */
export async function invalidateFinancialCacheAction(): Promise<void> {
  try {
    clearFinancialCache(await activeBusinessId());
  } catch (error) {
    console.error('[invalidateFinancialCacheAction]', error);
  }
}
