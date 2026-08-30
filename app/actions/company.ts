'use server';

import { cookies } from 'next/headers';
import { getSupabaseServer } from '../../lib/supabaseServerClient';
import { type Role, getPermissionsForRole } from '../../lib/rbac';
import { type Permission } from '../../lib/rbac';
import { type Feature, planHasFeature, planMaxStores } from '../../lib/planFeatures';
import { revalidatePath } from 'next/cache';
import { logActivity } from '../../lib/activityLog';
import { getPreviewPlanServer } from '../../lib/planPreviewServer';
import { FALLBACK_PLAN_KEY, normalizePlanKey } from '../../lib/plans';

const ACTIVE_STORE_COOKIE = 'pp_active_store';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const validUuid = (v: string | null | undefined): string | null =>
  v && UUID_RE.test(v) ? v : null;

export type CompanyInfo = {
  id:              string;
  name:            string;
  sector:          string | null;
  defaultCurrency: 'HTG' | 'USD';
  exchangeRate:    number;
  logoUrl:         string | null;
  country:         string;
  timezone:        string;
  email:           string | null;
  phone:           string | null;
  address:         string | null;
  taxId:           string | null;
};

export type CompanyRow = CompanyInfo & {
  createdAt:  string;
  archivedAt: string | null;
  isOwner:    boolean;
  memberRole: Role | null;
};

export type ClientTenantContext = {
  company:     CompanyInfo;
  role:        Role;
  permissions: Permission[];
  /** Offre à AFFICHER : l'aperçu s'il tourne, sinon l'offre réelle. */
  planKey:     string | null;
  /** Offre réelle du compte. Elle ne bouge jamais avec l'aperçu. */
  realPlanKey: string | null;
  /** Offre simulée, ou `null` quand on voit son offre réelle. */
  previewPlan: string | null;
  allCompanies: Array<{ id: string; name: string }>;
};

function mapBiz(b: any): CompanyInfo {
  return {
    id: b.id, name: b.name, sector: b.sector ?? null,
    defaultCurrency: b.default_currency ?? 'HTG',
    exchangeRate: Number(b.exchange_rate ?? 130),
    logoUrl:  b.logo_url  ?? null,
    country:  b.country   ?? 'Haiti',
    timezone: b.timezone  ?? 'America/Port-au-Prince',
    email:    b.email     ?? null,
    phone:    b.phone     ?? null,
    address:  b.address   ?? null,
    taxId:    b.tax_id    ?? null,
  };
}

// ── Read ─────────────────────────────────────────────────────────────────────

export async function getClientTenantContext(): Promise<ClientTenantContext | null> {
  try {
    const supabase = await getSupabaseServer();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;

    const jar = await cookies();
    const activeStoreId = validUuid(jar.get(ACTIVE_STORE_COOKIE)?.value);

    const [{ data: owned }, { data: memberOf }] = await Promise.all([
      supabase
        .from('businesses')
        .select('id, name, sector, default_currency, exchange_rate, logo_url, country, timezone, email, phone, address, tax_id')
        .eq('owner_id', user.id)
        .is('deleted_at', null)
        .is('archived_at', null)
        .order('created_at', { ascending: true }),
      supabase
        .from('business_members')
        .select('business_id, role, businesses(id, name, sector, default_currency, exchange_rate, logo_url, country, timezone, email, phone, address, tax_id)')
        .eq('user_id', user.id)
        .eq('is_active', true)
        .is('deleted_at', null),
    ]);

    const allMap = new Map<string, CompanyInfo>();

    for (const b of (owned ?? [])) {
      allMap.set(b.id, mapBiz(b));
    }
    for (const m of (memberOf ?? [])) {
      const b = (m as any).businesses as any;
      if (b && !allMap.has(b.id)) {
        allMap.set(b.id, mapBiz(b));
      }
    }

    const allCompanies = [...allMap.values()];
    if (allCompanies.length === 0) return null;

    const company: CompanyInfo =
      (activeStoreId ? allMap.get(activeStoreId) : undefined) ??
      allCompanies[0];

    const isOwner = (owned ?? []).some((b: any) => b.id === company.id);
    let role: Role = 'owner';
    if (!isOwner) {
      const memberEntry = (memberOf ?? []).find(
        (m: any) => (m.businesses as any)?.id === company.id,
      );
      role = (memberEntry?.role as Role) ?? 'viewer';
    }

    const now = new Date().toISOString();
    const { data: sub } = await supabase
      .from('subscriptions')
      .select('plan_key')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .gte('expires_at', now)
      .order('expires_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    // Sans abonnement actif en base, l'offre est le SOCLE — pas la plus haute.
    // Le repli « Expert » posé pour un test donnait toutes les fonctionnalités à
    // tout le monde : c'est ce qui empêchait l'interface de changer d'une offre
    // à l'autre. Le repli est désormais unique, et il vit dans `plans.ts`.
    const realPlanKey = normalizePlanKey(sub?.plan_key as string | undefined) ?? FALLBACK_PLAN_KEY;

    // L'aperçu des offres remplace ce que les écrans AFFICHENT, jamais ce que
    // le compte possède : `realPlanKey` part à côté, intact, et c'est lui que
    // le bandeau d'aperçu annonce. Le cookie n'est honoré que si l'exploitant a
    // posé `PLAN_PREVIEW=1` — sinon `getPreviewPlanServer()` rend `null`.
    const preview = await getPreviewPlanServer();

    return {
      company,
      role,
      permissions: getPermissionsForRole(role),
      planKey: preview ?? realPlanKey,
      realPlanKey,
      previewPlan: preview,
      allCompanies: allCompanies.map((c) => ({ id: c.id, name: c.name })),
    };
  } catch {
    return null;
  }
}

export async function listCompanies(): Promise<CompanyRow[]> {
  const supabase = await getSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  // Get plan to enforce max-store limit
  const now = new Date().toISOString();
  const { data: sub } = await supabase
    .from('subscriptions')
    .select('plan_key')
    .eq('user_id', user.id)
    .eq('status', 'active')
    .gte('expires_at', now)
    .order('expires_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  const planKey = normalizePlanKey(sub?.plan_key as string | undefined) ?? FALLBACK_PLAN_KEY;
  // Le plafond vient du registre (`PLAN_MAX_STORES`), jamais d'une copie
  // locale : deux tables de quotas finissent toujours par diverger, et celle
  // qui diverge ici couperait des boutiques bien réelles.
  const maxStores = planMaxStores(planKey);

  const [{ data: owned }, { data: memberOf }] = await Promise.all([
    supabase
      .from('businesses')
      .select('id, name, sector, default_currency, exchange_rate, logo_url, country, timezone, email, phone, address, tax_id, created_at, archived_at')
      .eq('owner_id', user.id)
      .is('deleted_at', null)
      .order('created_at', { ascending: true })
      .limit(maxStores),
    supabase
      .from('business_members')
      .select('role, businesses(id, name, sector, default_currency, exchange_rate, logo_url, country, timezone, email, phone, address, tax_id, created_at, archived_at)')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .is('deleted_at', null),
  ]);

  const rows: CompanyRow[] = [];
  const seen = new Set<string>();

  for (const b of (owned ?? [])) {
    seen.add(b.id);
    rows.push({
      ...mapBiz(b),
      createdAt:  b.created_at,
      archivedAt: (b as any).archived_at ?? null,
      isOwner:    true,
      memberRole: null,
    });
  }

  for (const m of (memberOf ?? [])) {
    const b = (m as any).businesses as any;
    if (!b || seen.has(b.id)) continue;
    if (rows.length >= maxStores) break;
    seen.add(b.id);
    rows.push({
      ...mapBiz(b),
      createdAt:  b.created_at,
      archivedAt: (b as any).archived_at ?? null,
      isOwner:    false,
      memberRole: (m.role as Role) ?? 'viewer',
    });
  }

  return rows;
}

// ── Switch active company ────────────────────────────────────────────────────

export async function switchActiveCompany(businessId: string): Promise<void> {
  const jar = await cookies();
  jar.set(ACTIVE_STORE_COOKIE, businessId, {
    path:     '/',
    httpOnly: true,
    sameSite: 'lax',
    maxAge:   60 * 60 * 24 * 30,
  });
  revalidatePath('/', 'layout');
}

// ── Create ───────────────────────────────────────────────────────────────────

export type CreateCompanyInput = {
  name:            string;
  sector?:         string;
  defaultCurrency?: 'HTG' | 'USD';
  exchangeRate?:   number;
  country?:        string;
  timezone?:       string;
  email?:          string;
  phone?:          string;
  address?:        string;
  taxId?:          string;
};

export async function createCompany(input: CreateCompanyInput): Promise<{ id: string } | { error: string }> {
  try {
    const supabase = await getSupabaseServer();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: 'Non authentifié' };

    const { data, error } = await supabase
      .from('businesses')
      .insert({
        owner_id:         user.id,
        name:             input.name.trim(),
        sector:           input.sector ?? null,
        default_currency: input.defaultCurrency ?? 'HTG',
        exchange_rate:    input.exchangeRate ?? 130,
        country:          input.country ?? 'Haiti',
        timezone:         input.timezone ?? 'America/Port-au-Prince',
        email:            input.email ?? null,
        phone:            input.phone ?? null,
        address:          input.address ?? null,
        tax_id:           input.taxId ?? null,
      })
      .select('id')
      .single();

    if (error) return { error: error.message };
    void logActivity({ action: 'create', entity: 'company', entityId: data.id, newValues: { name: input.name }, businessId: data.id, userId: user.id });
    revalidatePath('/entreprises');
    return { id: data.id };
  } catch (e: any) {
    return { error: e.message ?? 'Erreur inconnue' };
  }
}

// ── Update ───────────────────────────────────────────────────────────────────

export type UpdateCompanyInput = Partial<CreateCompanyInput> & { id: string };

export async function updateCompany(input: UpdateCompanyInput): Promise<{ error?: string }> {
  try {
    const supabase = await getSupabaseServer();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: 'Non authentifié' };

    const patch: Record<string, any> = {};
    if (input.name             !== undefined) patch.name             = input.name.trim();
    if (input.sector           !== undefined) patch.sector           = input.sector;
    if (input.defaultCurrency  !== undefined) patch.default_currency = input.defaultCurrency;
    if (input.exchangeRate     !== undefined) patch.exchange_rate    = input.exchangeRate;
    if (input.country          !== undefined) patch.country          = input.country;
    if (input.timezone         !== undefined) patch.timezone         = input.timezone;
    if (input.email            !== undefined) patch.email            = input.email;
    if (input.phone            !== undefined) patch.phone            = input.phone;
    if (input.address          !== undefined) patch.address          = input.address;
    if (input.taxId            !== undefined) patch.tax_id           = input.taxId;

    const { error } = await supabase
      .from('businesses')
      .update(patch)
      .eq('id', input.id)
      .eq('owner_id', user.id);

    if (error) return { error: error.message };
    void logActivity({ action: 'update', entity: 'company', entityId: input.id, newValues: patch });
    revalidatePath('/entreprises');
    return {};
  } catch (e: any) {
    return { error: e.message ?? 'Erreur inconnue' };
  }
}

// ── Archive / Restore ────────────────────────────────────────────────────────

export async function archiveCompany(id: string): Promise<{ error?: string }> {
  return _setArchivedAt(id, new Date().toISOString());
}

export async function restoreCompany(id: string): Promise<{ error?: string }> {
  return _setArchivedAt(id, null);
}

async function _setArchivedAt(id: string, value: string | null): Promise<{ error?: string }> {
  try {
    const supabase = await getSupabaseServer();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: 'Non authentifié' };

    const { error } = await supabase
      .from('businesses')
      .update({ archived_at: value })
      .eq('id', id)
      .eq('owner_id', user.id);

    if (error) return { error: error.message };
    void logActivity({ action: value ? 'archive' : 'restore', entity: 'company', entityId: id });
    revalidatePath('/entreprises');
    return {};
  } catch (e: any) {
    return { error: e.message ?? 'Erreur inconnue' };
  }
}

// ── Delete ───────────────────────────────────────────────────────────────────

export async function deleteCompany(id: string): Promise<{ error?: string }> {
  try {
    const supabase = await getSupabaseServer();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: 'Non authentifié' };

    // Soft delete only — never permanently destroy data
    const { error } = await supabase
      .from('businesses')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id)
      .eq('owner_id', user.id);

    if (error) return { error: error.message };
    void logActivity({ action: 'delete', entity: 'company', entityId: id });

    // If this was the active company, clear the cookie
    const jar = await cookies();
    if (jar.get(ACTIVE_STORE_COOKIE)?.value === id) {
      jar.delete(ACTIVE_STORE_COOKIE);
    }

    revalidatePath('/entreprises');
    return {};
  } catch (e: any) {
    return { error: e.message ?? 'Erreur inconnue' };
  }
}

// ── Duplicate ────────────────────────────────────────────────────────────────

export async function duplicateCompany(id: string): Promise<{ id: string } | { error: string }> {
  try {
    const supabase = await getSupabaseServer();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: 'Non authentifié' };

    const { data: src, error: fetchErr } = await supabase
      .from('businesses')
      .select('name, sector, default_currency, exchange_rate, logo_url, country, timezone, email, phone, address, tax_id')
      .eq('id', id)
      .eq('owner_id', user.id)
      .single();

    if (fetchErr || !src) return { error: fetchErr?.message ?? 'Introuvable' };

    const { data: copy, error: insertErr } = await supabase
      .from('businesses')
      .insert({
        owner_id:         user.id,
        name:             `${src.name} (copie)`,
        sector:           src.sector,
        default_currency: src.default_currency,
        exchange_rate:    src.exchange_rate,
        country:          src.country,
        timezone:         src.timezone,
        email:            src.email,
        phone:            src.phone,
        address:          src.address,
        tax_id:           src.tax_id,
      })
      .select('id')
      .single();

    if (insertErr || !copy) return { error: insertErr?.message ?? 'Échec duplication' };

    revalidatePath('/entreprises');
    return { id: copy.id };
  } catch (e: any) {
    return { error: e.message ?? 'Erreur inconnue' };
  }
}
