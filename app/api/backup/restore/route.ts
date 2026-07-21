import { NextRequest, NextResponse } from 'next/server';
import { unzipSync, strFromU8 } from 'fflate';
import { getSupabaseServer } from '../../../../lib/supabaseServerClient';
import { getSupabaseService } from '../../../../lib/supabaseServiceClient';

// Tables restored in dependency order (parents before children)
const RESTORE_ORDER = [
  'customers',
  'suppliers',
  'products',
  'sales',
  'sale_items',
  'purchases',
  'purchase_items',
  'expenses',
] as const;

// DB table name mapping (backup key → actual table name)
const TABLE_MAP: Record<string, string> = {
  customers:      'customers',
  suppliers:      'suppliers',
  products:       'products',
  sales:          'sales',
  sale_items:     'sale_items',
  purchases:      'purchases',
  purchase_items: 'purchase_items',
  expenses:       'expenses',
};

// Fields to strip before re-inserting (auto-managed)
const STRIP_FIELDS = ['created_at', 'updated_at'];

function stripFields(rows: any[]): any[] {
  return rows.map(row => {
    const r = { ...row };
    for (const f of STRIP_FIELDS) delete r[f];
    return r;
  });
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await getSupabaseServer();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

    const formData = await req.formData();

    // Accept either a ZIP file upload or a backup ID
    const file     = formData.get('file') as File | null;
    const backupId = formData.get('backupId') as string | null;

    let parsed: { manifest: any; data: Record<string, any[]> };

    if (backupId) {
      // Restore from existing stored backup
      const { data: rec } = await supabase
        .from('backups')
        .select('storage_path, status, company_id')
        .eq('id', backupId)
        .is('deleted_at', null)
        .single();

      if (!rec || rec.status !== 'ready') {
        return NextResponse.json({ error: 'Sauvegarde non disponible' }, { status: 404 });
      }

      // Verify ownership
      const { data: biz } = await supabase
        .from('businesses')
        .select('id')
        .eq('id', rec.company_id)
        .eq('owner_id', user.id)
        .single();
      if (!biz) return NextResponse.json({ error: 'Accès refusé' }, { status: 403 });

      const svc = getSupabaseService();
      const { data: fileData, error: dlErr } = await svc.storage
        .from('backups')
        .download(rec.storage_path);

      if (dlErr || !fileData) return NextResponse.json({ error: 'Fichier introuvable' }, { status: 404 });

      parsed = JSON.parse(await fileData.text());
    } else if (file) {
      // Restore from uploaded ZIP
      const arrayBuffer = await file.arrayBuffer();
      const zipBytes    = new Uint8Array(arrayBuffer);
      const unzipped    = unzipSync(zipBytes);

      // Find the manifest.json inside the ZIP
      const manifestEntry = Object.keys(unzipped).find(k => k.endsWith('manifest.json'));
      if (!manifestEntry) return NextResponse.json({ error: 'ZIP invalide : manifest.json introuvable' }, { status: 400 });

      const manifest = JSON.parse(strFromU8(unzipped[manifestEntry]));
      const data: Record<string, any[]> = {};

      // Load each entity JSON
      for (const key of RESTORE_ORDER) {
        const entry = Object.keys(unzipped).find(k => k.endsWith(`/${key}.json`));
        if (entry) {
          data[key] = JSON.parse(strFromU8(unzipped[entry]));
        }
      }

      parsed = { manifest, data };
    } else {
      return NextResponse.json({ error: 'Fichier ou ID de sauvegarde requis' }, { status: 400 });
    }

    const { manifest, data } = parsed;

    // Verify the manifest targets the user's company
    const { data: biz } = await supabase
      .from('businesses')
      .select('id')
      .eq('id', manifest.companyId)
      .eq('owner_id', user.id)
      .single();

    if (!biz) return NextResponse.json({ error: 'Cette sauvegarde ne correspond pas à votre entreprise' }, { status: 403 });

    const svc       = getSupabaseService();
    const restored: Record<string, number> = {};
    const errors: string[] = [];

    // Restore each table in order
    for (const key of RESTORE_ORDER) {
      const rows = data[key];
      if (!rows || rows.length === 0) { restored[key] = 0; continue; }

      const tableName = TABLE_MAP[key];
      if (!tableName) continue;

      const cleaned = stripFields(rows);

      // Upsert in batches of 200
      let count = 0;
      for (let i = 0; i < cleaned.length; i += 200) {
        const batch = cleaned.slice(i, i + 200);
        const { error } = await svc
          .from(tableName)
          .upsert(batch, { onConflict: 'id', ignoreDuplicates: false });
        if (error) {
          errors.push(`${key}: ${error.message}`);
          break;
        }
        count += batch.length;
      }
      restored[key] = count;
    }

    return NextResponse.json({
      success: true,
      restored,
      errors: errors.length > 0 ? errors : undefined,
      message: `Restauration terminée. ${Object.values(restored).reduce((a, b) => a + b, 0)} enregistrements importés.`,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? 'Erreur' }, { status: 500 });
  }
}
