import { NextRequest, NextResponse } from 'next/server';
import { zipSync, strToU8 } from 'fflate';
import { getSupabaseServer } from '../../../../../lib/supabaseServerClient';
import { getSupabaseService } from '../../../../../lib/supabaseServiceClient';
import { screenMessage } from '../../../../../lib/actionResult';

const BUCKET = 'backups';

function jsonToCsv(rows: any[]): string {
  if (!rows || rows.length === 0) return '';
  const keys = Object.keys(rows[0]);
  const escape = (v: any) => {
    const s = v == null ? '' : String(v);
    return s.includes(',') || s.includes('"') || s.includes('\n')
      ? `"${s.replace(/"/g, '""')}"`
      : s;
  };
  const header = keys.join(',');
  const lines  = rows.map(row => keys.map(k => escape(row[k])).join(','));
  return [header, ...lines].join('\r\n');
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const supabase = await getSupabaseServer();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

    // Verify ownership
    const { data: rec } = await supabase
      .from('backups')
      .select('storage_path, status, created_at, label, entity_counts, company_id')
      .eq('id', id)
      .is('deleted_at', null)
      .single();

    if (!rec || rec.status !== 'ready') {
      return NextResponse.json({ error: 'Sauvegarde non disponible' }, { status: 404 });
    }

    // Verify the business belongs to this user
    const { data: biz } = await supabase
      .from('businesses')
      .select('id, name')
      .eq('id', rec.company_id)
      .eq('owner_id', user.id)
      .single();

    if (!biz) return NextResponse.json({ error: 'Accès refusé' }, { status: 403 });

    // Download backup JSON from Storage
    const svc = getSupabaseService();
    const { data: fileData, error: dlErr } = await svc.storage
      .from(BUCKET)
      .download(rec.storage_path);

    if (dlErr || !fileData) {
      return NextResponse.json({ error: 'Fichier introuvable' }, { status: 404 });
    }

    const text   = await fileData.text();
    const parsed = JSON.parse(text) as { manifest: any; data: Record<string, any[]> };
    const { manifest, data } = parsed;

    const dateStr = new Date(rec.created_at).toISOString().split('T')[0];
    const dirName = `backup_${biz.name.replace(/[^a-z0-9]/gi, '_')}_${dateStr}`;

    // Build ZIP entries
    const entries: Record<string, Uint8Array> = {};

    // manifest.json
    entries[`${dirName}/manifest.json`] = strToU8(JSON.stringify(manifest, null, 2));

    // One JSON + one CSV per entity
    for (const [key, rows] of Object.entries(data)) {
      if (!Array.isArray(rows) || rows.length === 0) continue;
      entries[`${dirName}/${key}.json`] = strToU8(JSON.stringify(rows, null, 2));
      const csv = jsonToCsv(rows);
      if (csv) entries[`${dirName}/csv/${key}.csv`] = strToU8(csv);
    }

    // README
    const readme = [
      `# Sauvegarde ProfitPilot`,
      `Entreprise : ${biz.name}`,
      `Date       : ${new Date(rec.created_at).toLocaleString('fr-FR')}`,
      ``,
      `## Contenu`,
      ...Object.entries(manifest.entityCounts ?? {}).map(([k, v]) => `- ${k}: ${v} entrées`),
      ``,
      `## Structure`,
      `- manifest.json     : métadonnées de la sauvegarde`,
      `- *.json            : données brutes par entité`,
      `- csv/*.csv         : même données au format CSV (pour Excel)`,
      ``,
      `## Restauration`,
      `Importez ce fichier ZIP dans ProfitPilot via Sauvegarde → Restaurer.`,
    ].join('\n');
    entries[`${dirName}/README.txt`] = strToU8(readme);

    // Generate ZIP (synchronous, no compression for speed)
    const zipBytes = zipSync(entries, { level: 1 });

    return new NextResponse(zipBytes, {
      status: 200,
      headers: {
        'Content-Type':        'application/zip',
        'Content-Disposition': `attachment; filename="${dirName}.zip"`,
        'Content-Length':      String(zipBytes.byteLength),
      },
    });
  } catch (e: any) {
    return NextResponse.json({ error: screenMessage(e, 'Erreur') }, { status: 500 });
  }
}
