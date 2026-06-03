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
import { getSupabaseServer } from '../../lib/supabaseServerClient';

/**
 * Server action pour rÃ©cupÃ©rer le rapport P&L
 */
export async function getProfitAndLossAction(
  startDate: string,
  endDate: string,
  currency: 'HTG' | 'USD' = 'HTG'
): Promise<ProfitAndLossReport> {
  try {
    const supabase = await getSupabaseServer();
    // RÃ©cupÃ¨re l'utilisateur actuel
    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData.user) {
      throw new Error('Authentification requise');
    }

    // RÃ©cupÃ¨re le business de l'utilisateur
    const { data: business, error: businessError } = await supabase
      .from('businesses')
      .select('id')
      .eq('owner_id', userData.user.id)
      .single();

    if (businessError || !business) {
      throw new Error('Entreprise non trouvÃ©e');
    }

    // GÃ©nÃ¨re le rapport
    const report = await generateProfitAndLoss(business.id, startDate, endDate, currency);
    return report;
  } catch (error) {
    console.error('[getProfitAndLossAction] Error:', error);
    throw error;
  }
}

/**
 * Server action pour rÃ©cupÃ©rer le Bilan
 */
export async function getBalanceSheetAction(
  asOfDate: string,
  currency: 'HTG' | 'USD' = 'HTG'
): Promise<BalanceSheetReport> {
  try {
    const supabase = await getSupabaseServer();
    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData.user) {
      throw new Error('Authentification requise');
    }

    const { data: business, error: businessError } = await supabase
      .from('businesses')
      .select('id')
      .eq('owner_id', userData.user.id)
      .single();

    if (businessError || !business) {
      throw new Error('Entreprise non trouvÃ©e');
    }

    const report = await generateBalanceSheet(business.id, asOfDate, currency);
    return report;
  } catch (error) {
    console.error('[getBalanceSheetAction] Error:', error);
    throw error;
  }
}

/**
 * Server action pour rÃ©cupÃ©rer l'Ã‰tat des Flux de TrÃ©sorerie
 */
export async function getCashFlowAction(
  startDate: string,
  endDate: string,
  currency: 'HTG' | 'USD' = 'HTG'
): Promise<CashFlowReport> {
  try {
    const supabase = await getSupabaseServer();
    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData.user) {
      throw new Error('Authentification requise');
    }

    const { data: business, error: businessError } = await supabase
      .from('businesses')
      .select('id')
      .eq('owner_id', userData.user.id)
      .single();

    if (businessError || !business) {
      throw new Error('Entreprise non trouvÃ©e');
    }

    const report = await generateCashFlow(business.id, startDate, endDate, currency);
    return report;
  } catch (error) {
    console.error('[getCashFlowAction] Error:', error);
    throw error;
  }
}

/**
 * Server action pour invalider le cache aprÃ¨s une transaction
 */
export async function invalidateFinancialCacheAction(): Promise<void> {
  try {
    const supabase = await getSupabaseServer();
    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData.user) {
      throw new Error('Authentification requise');
    }

    const { data: business } = await supabase
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




