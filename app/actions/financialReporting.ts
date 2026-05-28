'use server';

import {
  generateProfitAndLoss,
  generateBalanceSheet,
  generateCashFlow,
  clearFinancialCache,
  type ProfitAndLossReport,
  type BalanceSheetReport,
  type CashFlowReport,
} from '../../lib/financialReporting';
import { supabaseServer } from '../../lib/supabaseServerClient';

/**
 * Server action pour récupérer le rapport P&L
 */
export async function getProfitAndLossAction(
  startDate: string,
  endDate: string,
  currency: 'HTG' | 'USD' = 'HTG'
): Promise<ProfitAndLossReport> {
  try {
    // Récupère l'utilisateur actuel
    const { data: userData, error: userError } = await supabaseServer.auth.getUser();
    if (userError || !userData.user) {
      throw new Error('Authentification requise');
    }

    // Récupère le business de l'utilisateur
    const { data: business, error: businessError } = await supabaseServer
      .from('businesses')
      .select('id')
      .eq('owner_id', userData.user.id)
      .single();

    if (businessError || !business) {
      throw new Error('Entreprise non trouvée');
    }

    // Génère le rapport
    const report = await generateProfitAndLoss(business.id, startDate, endDate, currency);
    return report;
  } catch (error) {
    console.error('[getProfitAndLossAction] Error:', error);
    throw error;
  }
}

/**
 * Server action pour récupérer le Bilan
 */
export async function getBalanceSheetAction(
  asOfDate: string,
  currency: 'HTG' | 'USD' = 'HTG'
): Promise<BalanceSheetReport> {
  try {
    const { data: userData, error: userError } = await supabaseServer.auth.getUser();
    if (userError || !userData.user) {
      throw new Error('Authentification requise');
    }

    const { data: business, error: businessError } = await supabaseServer
      .from('businesses')
      .select('id')
      .eq('owner_id', userData.user.id)
      .single();

    if (businessError || !business) {
      throw new Error('Entreprise non trouvée');
    }

    const report = await generateBalanceSheet(business.id, asOfDate, currency);
    return report;
  } catch (error) {
    console.error('[getBalanceSheetAction] Error:', error);
    throw error;
  }
}

/**
 * Server action pour récupérer l'État des Flux de Trésorerie
 */
export async function getCashFlowAction(
  startDate: string,
  endDate: string,
  currency: 'HTG' | 'USD' = 'HTG'
): Promise<CashFlowReport> {
  try {
    const { data: userData, error: userError } = await supabaseServer.auth.getUser();
    if (userError || !userData.user) {
      throw new Error('Authentification requise');
    }

    const { data: business, error: businessError } = await supabaseServer
      .from('businesses')
      .select('id')
      .eq('owner_id', userData.user.id)
      .single();

    if (businessError || !business) {
      throw new Error('Entreprise non trouvée');
    }

    const report = await generateCashFlow(business.id, startDate, endDate, currency);
    return report;
  } catch (error) {
    console.error('[getCashFlowAction] Error:', error);
    throw error;
  }
}

/**
 * Server action pour invalider le cache après une transaction
 */
export async function invalidateFinancialCacheAction(): Promise<void> {
  try {
    const { data: userData, error: userError } = await supabaseServer.auth.getUser();
    if (userError || !userData.user) {
      throw new Error('Authentification requise');
    }

    const { data: business } = await supabaseServer
      .from('businesses')
      .select('id')
      .eq('owner_id', userData.user.id)
      .single();

    if (business) {
      clearFinancialCache(business.id);
    }
  } catch (error) {
    console.error('[invalidateFinancialCacheAction] Error:', error);
    // Non-critical: continue anyway
  }
}
