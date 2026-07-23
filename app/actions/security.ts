'use server';

import { headers } from 'next/headers';
import { getSupabaseServer } from '../../lib/supabaseServerClient';
import { getBusinessContext } from '../../lib/serverAuth';
import { revalidatePath } from 'next/cache';

// ── UA parsing helpers ────────────────────────────────────────────────────────

function parseBrowser(ua: string): string {
  if (!ua) return 'Inconnu';
  if (ua.includes('Edg/'))    return 'Edge';
  if (ua.includes('Chrome/')) return 'Chrome';
  if (ua.includes('Firefox/')) return 'Firefox';
  if (ua.includes('Safari/') && ua.includes('Version/')) return 'Safari';
  if (ua.includes('OPR/') || ua.includes('Opera/')) return 'Opera';
  return 'Autre';
}

function parseDevice(ua: string): 'mobile' | 'tablet' | 'desktop' {
  if (!ua) return 'desktop';
  const lower = ua.toLowerCase();
  if (lower.includes('tablet') || lower.includes('ipad')) return 'tablet';
  if (lower.includes('mobile') || lower.includes('android') || lower.includes('iphone')) return 'mobile';
  return 'desktop';
}

function parseOS(ua: string): string {
  if (!ua) return 'Inconnu';
  if (ua.includes('Windows NT 10')) return 'Windows 10/11';
  if (ua.includes('Windows NT'))    return 'Windows';
  if (ua.includes('Mac OS X'))      return 'macOS';
  if (ua.includes('iPhone'))        return 'iOS';
  if (ua.includes('iPad'))          return 'iPadOS';
  if (ua.includes('Android'))       return 'Android';
  if (ua.includes('Linux'))         return 'Linux';
  return 'Autre';
}

// ── Types ─────────────────────────────────────────────────────────────────────

export type LoginSession = {
  id:          string;
  userId:      string;
  businessId:  string | null;
  ip:          string | null;
  browser:     string | null;
  deviceType:  string | null;
  os:          string | null;
  country:     string | null;
  createdAt:   string;
  revokedAt:   string | null;
};

export type SecuritySettings = {
  mfaEnabled:  boolean;
  factorId:    string | null;
};

// ── Record login session (called from client after successful login) ──────────

export async function recordLoginSession(): Promise<void> {
  try {
    const supabase = await getSupabaseServer();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const hdrs = await headers();
    const ip = hdrs.get('x-forwarded-for')?.split(',')[0]?.trim()
      ?? hdrs.get('x-real-ip')
      ?? null;
    const ua = hdrs.get('user-agent') ?? '';

    // Get active business if any (cookie may not be set yet on first login)
    let businessId: string | null = null;
    try {
      const ctx = await getBusinessContext();
      businessId = ctx.businessId;
    } catch { /* no active business yet */ }

    await supabase.from('login_sessions').insert({
      user_id:     user.id,
      business_id: businessId,
      ip,
      user_agent:  ua || null,
      browser:     parseBrowser(ua),
      device_type: parseDevice(ua),
      os:          parseOS(ua),
      country:     null, // geo-IP not available without external service
    });
  } catch {
    // Swallow — never break login flow
  }
}

// ── List login sessions ───────────────────────────────────────────────────────

export async function listLoginSessions(opts?: {
  limit?: number;
  offset?: number;
}): Promise<LoginSession[]> {
  const supabase = await getSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const limit  = opts?.limit  ?? 30;
  const offset = opts?.offset ?? 0;

  const { data, error } = await supabase
    .from('login_sessions')
    .select('id, user_id, business_id, ip, browser, device_type, os, country, created_at, revoked_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) return [];

  return (data ?? []).map((r: any): LoginSession => ({
    id:         r.id,
    userId:     r.user_id,
    businessId: r.business_id ?? null,
    ip:         r.ip ?? null,
    browser:    r.browser ?? null,
    deviceType: r.device_type ?? null,
    os:         r.os ?? null,
    country:    r.country ?? null,
    createdAt:  r.created_at,
    revokedAt:  r.revoked_at ?? null,
  }));
}

// ── Revoke a session ──────────────────────────────────────────────────────────

export async function revokeSession(sessionId: string): Promise<{ error?: string }> {
  try {
    const supabase = await getSupabaseServer();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: 'Non authentifié' };

    const { error } = await supabase
      .from('login_sessions')
      .update({ revoked_at: new Date().toISOString(), revoked_by: user.id })
      .eq('id', sessionId)
      .eq('user_id', user.id)
      .is('revoked_at', null);

    if (error) return { error: error.message };
    revalidatePath('/security');
    return {};
  } catch (e: any) {
    return { error: e.message ?? 'Erreur inconnue' };
  }
}

// ── MFA: list enrolled factors ────────────────────────────────────────────────

export async function getSecuritySettings(): Promise<SecuritySettings> {
  try {
    const supabase = await getSupabaseServer();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { mfaEnabled: false, factorId: null };

    const { data, error } = await supabase.auth.mfa.listFactors();
    if (error) return { mfaEnabled: false, factorId: null };

    const totpFactor = (data?.totp ?? []).find((f: any) => f.status === 'verified');
    return {
      mfaEnabled: !!totpFactor,
      factorId:   totpFactor?.id ?? null,
    };
  } catch {
    return { mfaEnabled: false, factorId: null };
  }
}
