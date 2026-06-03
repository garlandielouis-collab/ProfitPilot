import fs from 'fs';
import path from 'path';

const MIGRATION_FILES = [
  'supabase/migrations/20260601_clean_products_rebuild.sql',
  'supabase/migrations/20260601_fix_ai_conversations_rls.sql',
  'supabase/migrations/20260603_add_converted_amount_columns.sql',
];

async function applySql(sql: string, file: string) {
  const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/sql`;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: key!,
      Authorization: `Bearer ${key!}`,
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
  const files = MIGRATION_FILES.map(f => ({
    file: f,
    exists: fs.existsSync(path.join(process.cwd(), f)),
  }));
  return Response.json({ migrations: files });
}
