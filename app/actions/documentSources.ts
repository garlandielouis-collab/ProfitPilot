'use server';

// ─────────────────────────────────────────────────────────────────────────────
// Les listes de choix des variables (§21)
//
// « Pour quel employé ? » — la feuille de création a besoin de noms et
// d'identifiants, rien d'autre. Passer par `listHrEmployees()` rendrait
// salaires, notes internes et dates d'embauche de tout le personnel au
// navigateur pour peupler un menu déroulant : c'est une fuite gratuite, et
// c'est aussi trois fois plus d'octets sur une connexion mobile.
//
// D'où trois fonctions qui ne savent dire qu'une chose : cet identifiant
// s'appelle comme ça.
//
// ⚠️ `employees` est cadrée par `company_id`. C'est la seule table du domaine
// dans ce cas ; s'y tromper rend zéro ligne, sans erreur.
// ─────────────────────────────────────────────────────────────────────────────

import { getBusinessContext } from '../../lib/serverAuth';
import { assertAccess } from '../../lib/entitlements';

export type SourceOption = { id: string; label: string };

/** Assez pour un menu déroulant qu'on parcourt au pouce ; au-delà, on tape. */
const LIMIT = 200;

export async function listCustomersLight(): Promise<SourceOption[]> {
  await assertAccess('documents', 'documents:read');
  const { supabase, businessId } = await getBusinessContext();

  const { data, error } = await supabase
    .from('customers')
    .select('id, name')
    .eq('business_id', businessId)
    .is('deleted_at', null)
    .order('name', { ascending: true })
    .limit(LIMIT);

  if (error) throw new Error(error.message);
  return (data ?? []).map((r: any) => ({ id: r.id, label: r.name ?? '—' }));
}

export async function listSuppliersLight(): Promise<SourceOption[]> {
  await assertAccess('documents', 'documents:read');
  const { supabase, businessId } = await getBusinessContext();

  const { data, error } = await supabase
    .from('suppliers')
    .select('id, name')
    .eq('business_id', businessId)
    .is('deleted_at', null)
    .order('name', { ascending: true })
    .limit(LIMIT);

  if (error) throw new Error(error.message);
  return (data ?? []).map((r: any) => ({ id: r.id, label: r.name ?? '—' }));
}

/**
 * Les employés demandent une permission de plus.
 *
 * Un contrat de travail est un document RH (§41) : celui qui n'a pas le droit
 * de lire les documents RH n'a pas besoin de la liste du personnel pour en
 * écrire un. La règle est la même que celle de `can_read_document()` sur la
 * sensibilité `hr` — les deux doivent rester d'accord.
 */
export async function listEmployeesLight(): Promise<SourceOption[]> {
  await assertAccess('documents', 'documents:read_hr');
  const { supabase, businessId } = await getBusinessContext();

  const { data, error } = await supabase
    .from('employees')
    .select('id, first_name, last_name')
    .eq('company_id', businessId)
    .is('deleted_at', null)
    .order('last_name', { ascending: true })
    .limit(LIMIT);

  if (error) throw new Error(error.message);
  return (data ?? []).map((r: any) => ({
    id: r.id,
    label: `${r.first_name ?? ''} ${r.last_name ?? ''}`.trim() || '—',
  }));
}
