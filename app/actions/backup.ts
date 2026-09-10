'use server';

import { getBusinessContext } from '../../lib/serverAuth';
import { getSupabaseService } from '../../lib/supabaseServiceClient';
import { revalidatePath } from 'next/cache';

export type BackupRecord = {
  id:           string;
  label:        string | null;
  storagePath:  string;
  sizeBytes:    number;
  status:       'pending' | 'ready' | 'error';
  entityCounts: Record<string, number> | null;
  createdAt:    string;
};

const BUCKET = 'backups';

// ── Ensure bucket exists ──────────────────────────────────────────────────────

async function ensureBucket() {
  const svc = getSupabaseService();
  const { data: buckets } = await svc.storage.listBuckets();
  if (!buckets?.find((b: any) => b.id === BUCKET)) {
    await svc.storage.createBucket(BUCKET, {
      public: false,
      fileSizeLimit: 104857600, // 100 MB
    });
  }
}

// ── Collect all company data ──────────────────────────────────────────────────

export async function collectCompanyData(businessId: string, supabase: any) {
  const tables = [
    { key: 'company',         q: supabase.from('businesses').select('*').eq('id', businessId).limit(1) },
    // Pas de `.is('deleted_at', null)` ici : la colonne n'existe pas sur
    // `customers`, et le filtre vidait la sauvegarde de tous ses clients.
    { key: 'customers',       q: supabase.from('customers').select('*').eq('business_id', businessId) },
    { key: 'products',        q: supabase.from('products').select('*').eq('business_id', businessId) },
    { key: 'suppliers',       q: supabase.from('suppliers').select('*').eq('business_id', businessId).is('deleted_at', null) },
    { key: 'sales',           q: supabase.from('sales').select('*').eq('business_id', businessId) },
    { key: 'sale_items',      q: supabase.from('sale_items').select('*').eq('business_id', businessId) },
    { key: 'purchases',       q: supabase.from('purchases').select('*').eq('business_id', businessId).is('deleted_at', null) },
    { key: 'purchase_items',  q: supabase.from('purchase_items').select('*').eq('business_id', businessId) },
    { key: 'expenses',        q: supabase.from('expenses').select('*').eq('business_id', businessId).is('deleted_at', null) },
    { key: 'employees',       q: supabase.from('business_members').select('*').eq('business_id', businessId).is('deleted_at', null) },
    { key: 'activity_logs',   q: supabase.from('activity_logs').select('*').eq('company_id', businessId).order('created_at', { ascending: false }).limit(5000) },
  ] as const;

  const results = await Promise.all(tables.map(async ({ key, q }) => {
    const { data } = await q;
    return { key, data: data ?? [] };
  }));

  const payload: Record<string, any[]> = {};
  const counts: Record<string, number> = {};
  for (const { key, data } of results) {
    payload[key] = data;
    counts[key]  = data.length;
  }
  return { payload, counts };
}

// ── Create backup ─────────────────────────────────────────────────────────────

export async function createBackup(label?: string): Promise<{ id: string } | { error: string }> {
  try {
    const { supabase, businessId, userId } = await getBusinessContext();
    const svc = getSupabaseService();

    await ensureBucket();

    // Insert pending record
    const { data: rec, error: recErr } = await supabase
      .from('backups')
      .insert({
        company_id:   businessId,
        created_by:   userId,
        label:        label ?? null,
        storage_path: '',     // will update after upload
        status:       'pending',
      })
      .select('id')
      .single();

    if (recErr || !rec) return { error: recErr?.message ?? 'Erreur création' };

    const backupId = rec.id;
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const storagePath = `${businessId}/${timestamp}_${backupId}.json`;

    // Collect data
    const { payload, counts } = await collectCompanyData(businessId, supabase);

    const manifest = {
      version: '1.0',
      backupId,
      companyId: businessId,
      createdAt: new Date().toISOString(),
      createdBy: userId,
      label: label ?? null,
      entityCounts: counts,
    };

    const fileContent = JSON.stringify({ manifest, data: payload }, null, 2);
    const fileBytes   = new TextEncoder().encode(fileContent);

    // Upload to Storage
    const { error: uploadErr } = await svc.storage
      .from(BUCKET)
      .upload(storagePath, fileBytes, {
        contentType: 'application/json',
        upsert: false,
      });

    if (uploadErr) {
      await supabase.from('backups').update({ status: 'error', error: uploadErr.message }).eq('id', backupId);
      return { error: uploadErr.message };
    }

    // Update record to ready
    await supabase.from('backups').update({
      storage_path:  storagePath,
      size_bytes:    fileBytes.byteLength,
      status:        'ready',
      entity_counts: counts,
    }).eq('id', backupId);

    revalidatePath('/backup');
    return { id: backupId };
  } catch (e: any) {
    return { error: e.message ?? 'Erreur inconnue' };
  }
}

// ── List backups ──────────────────────────────────────────────────────────────

export async function listBackups(): Promise<BackupRecord[]> {
  const { supabase, businessId } = await getBusinessContext();

  const { data } = await supabase
    .from('backups')
    .select('id, label, storage_path, size_bytes, status, entity_counts, created_at')
    .eq('company_id', businessId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(50);

  return (data ?? []).map((r: any): BackupRecord => ({
    id:           r.id,
    label:        r.label ?? null,
    storagePath:  r.storage_path,
    sizeBytes:    r.size_bytes ?? 0,
    status:       r.status,
    entityCounts: r.entity_counts ?? null,
    createdAt:    r.created_at,
  }));
}

// ── Delete backup ─────────────────────────────────────────────────────────────

export async function deleteBackup(id: string): Promise<{ error?: string }> {
  try {
    const { supabase, businessId } = await getBusinessContext();
    const svc = getSupabaseService();

    // Get storage path before soft-deleting
    const { data: rec } = await supabase
      .from('backups')
      .select('storage_path')
      .eq('id', id)
      .eq('company_id', businessId)
      .single();

    if (rec?.storage_path) {
      await svc.storage.from(BUCKET).remove([rec.storage_path]);
    }

    const { error } = await supabase
      .from('backups')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id)
      .eq('company_id', businessId);

    if (error) return { error: error.message };
    revalidatePath('/backup');
    return {};
  } catch (e: any) {
    return { error: e.message ?? 'Erreur inconnue' };
  }
}

// ── Get signed download URL (for raw JSON) ────────────────────────────────────

export async function getBackupSignedUrl(id: string): Promise<{ url: string } | { error: string }> {
  try {
    const { supabase, businessId } = await getBusinessContext();
    const svc = getSupabaseService();

    const { data: rec } = await supabase
      .from('backups')
      .select('storage_path, status')
      .eq('id', id)
      .eq('company_id', businessId)
      .single();

    if (!rec || rec.status !== 'ready') return { error: 'Sauvegarde non disponible' };

    const { data, error } = await svc.storage
      .from(BUCKET)
      .createSignedUrl(rec.storage_path, 300); // 5 min

    if (error || !data?.signedUrl) return { error: error?.message ?? 'Erreur URL' };
    return { url: data.signedUrl };
  } catch (e: any) {
    return { error: e.message ?? 'Erreur inconnue' };
  }
}

// ── Get backup data (for restore preview + ZIP generation) ────────────────────

export async function getBackupData(id: string): Promise<{ manifest: any; data: Record<string, any[]> } | { error: string }> {
  try {
    const { supabase, businessId } = await getBusinessContext();
    const svc = getSupabaseService();

    const { data: rec } = await supabase
      .from('backups')
      .select('storage_path, status')
      .eq('id', id)
      .eq('company_id', businessId)
      .single();

    if (!rec || rec.status !== 'ready') return { error: 'Sauvegarde non disponible' };

    const { data: fileData, error: dlErr } = await svc.storage
      .from(BUCKET)
      .download(rec.storage_path);

    if (dlErr || !fileData) return { error: dlErr?.message ?? 'Téléchargement échoué' };

    const text    = await fileData.text();
    const parsed  = JSON.parse(text);
    return { manifest: parsed.manifest, data: parsed.data };
  } catch (e: any) {
    return { error: e.message ?? 'Erreur inconnue' };
  }
}
