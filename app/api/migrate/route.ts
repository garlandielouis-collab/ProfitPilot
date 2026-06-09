import fs from 'fs';
import path from 'path';
import { createServerClient } from '@supabase/ssr';

const MIGRATION_FILES = [
  'supabase/migrations/20260601_clean_products_rebuild.sql',
  'supabase/migrations/20260601_fix_ai_conversations_rls.sql',
  'supabase/migrations/20260603_add_converted_amount_columns.sql',
  'supabase/migrations/20260605_add_expense_exchange_rate.sql',
  'supabase/migrations/20260606_add_products_currency.sql',
];

function isProduction(): boolean {
  return process.env.NODE_ENV === 'production';
}

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return { url, key };
}

async function requireAdminAuth(): Promise<Response | null> {
  const { cookies } = await import('next/headers');
  const cookieStore = await cookies();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll(); },
        setAll() {},
      },
    }
  );

  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) {
    return Response.json({ error: 'Non authentifié' }, { status: 401 });
  }

  const adminEmails = (process.env.ADMIN_EMAILS || '')
    .split(',').map(e => e.trim().toLowerCase()).filter(Boolean);

  if (adminEmails.length > 0 && !adminEmails.includes(user.email?.toLowerCase() ?? '')) {
    return Response.json({ error: 'Accès refusé' }, { status: 403 });
  }

  return null;
}

async function applySql(sql: string, file: string) {
  const admin = getSupabaseAdmin();
  if (!admin) {
    return { success: false, file, error: 'SUPABASE_SERVICE_ROLE_KEY non configurée' };
  }

  const res = await fetch(`${admin.url}/sql`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: admin.key,
      Authorization: `Bearer ${admin.key}`,
    },
    body: JSON.stringify({ query: sql }),
  });

  if (res.status === 401 || res.status === 403) {
    const body = await res.text();
    return {
      success: false,
      file,
      error: `Auth refusée (${res.status}). Clé service_role invalide.`,
      detail: body,
      hint: "Va sur https://supabase.com/dashboard/project/mmrqfrshuroiirhmwywy/settings/api → copie service_role key",
      sql,
    };
  }

  if (!res.ok) {
    const body = await res.text();
    return {
      success: false,
      file,
      error: `Erreur ${res.status}: ${body}`,
      hint: 'Exécute le SQL manuellement dans Supabase SQL Editor',
      sql,
    };
  }

  return { success: true, file, message: 'OK' };
}

export async function POST() {
  // Sécurité : bloqué en production
  if (isProduction()) {
    return Response.json({ error: 'Not found' }, { status: 404 });
  }

  // Vérifier que l'utilisateur est admin (si ADMIN_EMAILS configuré)
  const authError = await requireAdminAuth();
  if (authError) return authError;

  const results: any[] = [];

  for (const file of MIGRATION_FILES) {
    try {
      const sqlPath = path.join(process.cwd(), file);
      const sql = fs.readFileSync(sqlPath, 'utf8');
      const result = await applySql(sql, file);
      results.push(result);
      if (!result.success) break;
    } catch (err: any) {
      results.push({ success: false, file, error: err.message });
      break;
    }
  }

  const allOk = results.every(r => r.success);
  return Response.json(
    allOk
      ? { success: true, message: `Migrations exécutées (${results.length}/${MIGRATION_FILES.length})` }
      : { success: false, message: 'Échec', results },
    { status: allOk ? 200 : 500 }
  );
}

export async function GET() {
  // Sécurité : bloqué en production
  if (isProduction()) {
    return Response.json({ error: 'Not found' }, { status: 404 });
  }

  const files = MIGRATION_FILES.map(f => ({
    file: f,
    exists: fs.existsSync(path.join(process.cwd(), f)),
  }));
  return Response.json({ migrations: files });
}
