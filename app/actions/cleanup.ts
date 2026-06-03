'use server';

import { getSupabaseService } from '../../lib/supabaseServiceClient';

type CleanupResult = {
  success: boolean;
  deleted: Record<string, number>;
  errors: string[];
};

const OWNER_TABLES = [
  'businesses',
  'clients',
  'sales',
  'expenses',
  'purchases',
] as const;

const USER_TABLES = [
  'user_preferences',
  'ai_conversations',
] as const;

export async function cleanupOrphans(): Promise<CleanupResult> {
  const result: CleanupResult = { success: true, deleted: {}, errors: [] };

  let validUserIds: Set<string>;

  try {
    validUserIds = await fetchAllAuthUserIds();
  } catch (e: any) {
    return { success: false, deleted: {}, errors: [`Impossible de récupérer les utilisateurs Auth: ${e.message}`] };
  }

  const supabase = getSupabaseService();

  for (const table of OWNER_TABLES) {
    try {
      const { data: rows, error } = await supabase
        .from(table)
        .select('id, owner_id');

      if (error) { result.errors.push(`${table}: ${error.message}`); continue; }

      const orphanIds = (rows ?? [])
        .filter((r: any) => r.owner_id && !validUserIds.has(r.owner_id))
        .map((r: any) => r.id);

      if (orphanIds.length === 0) {
        result.deleted[table] = 0;
        continue;
      }

      const { error: delErr } = await supabase
        .from(table)
        .delete()
        .in('id', orphanIds);

      if (delErr) {
        result.errors.push(`${table}: ${delErr.message}`);
      } else {
        result.deleted[table] = orphanIds.length;
      }
    } catch (e: any) {
      result.errors.push(`${table}: ${e.message}`);
    }
  }

  for (const table of USER_TABLES) {
    try {
      const { data: rows, error } = await supabase
        .from(table)
        .select('id, user_id');

      if (error) { result.errors.push(`${table}: ${error.message}`); continue; }

      const orphanIds = (rows ?? [])
        .filter((r: any) => r.user_id && !validUserIds.has(r.user_id))
        .map((r: any) => r.id);

      if (orphanIds.length === 0) {
        result.deleted[table] = 0;
        continue;
      }

      const { error: delErr } = await supabase
        .from(table)
        .delete()
        .in('id', orphanIds);

      if (delErr) {
        result.errors.push(`${table}: ${delErr.message}`);
      } else {
        result.deleted[table] = orphanIds.length;
      }
    } catch (e: any) {
      result.errors.push(`${table}: ${e.message}`);
    }
  }

  result.success = result.errors.length === 0;
  return result;
}

async function fetchAllAuthUserIds(): Promise<Set<string>> {
  const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/admin/users`;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;

  const ids = new Set<string>();

  let page = 1;
  let hasMore = true;

  while (hasMore) {
    const res = await fetch(`${url}?page=${page}&per_page=100`, {
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
      },
    });

    if (!res.ok) {
      throw new Error(`Admin API ${res.status}: ${await res.text()}`);
    }

    const body = await res.json();
    const users = body.users ?? [];

    if (users.length === 0) {
      hasMore = false;
    } else {
      for (const u of users) {
        if (u.id) ids.add(u.id);
      }
      page++;
    }
  }

  return ids;
}
