'use server';

// ─────────────────────────────────────────────────────────────────────────────
// « Pran foto kaye ou » — le cahier de crédit devient une liste (F10)
//
// « L'étape 4 est le moment de vérité : le marchand voit en 2 minutes son
// cahier transformé en liste claire de " qui me doit combien ". C'est la
// démonstration qui vend le produit » (§11.3).
//
// Deux temps, jamais un seul :
//   1. `readNotebookPage` lit une photo et PROPOSE des lignes ;
//   2. le marchand corrige, supprime, ajoute — puis `importNotebookCredits`
//      écrit ce qu'il a validé, et seulement cela.
//
// L'étude demande de le mesurer avant de le promettre (§14 : « au moins 80 %
// des lignes justes »). D'où le second temps : rien de ce que lit l'IA n'entre
// dans le cahier de crédit sans être passé sous les yeux du marchand.
//
// Un crédit recopié est une vente à crédit marquée `notebook_import` : il entre
// dans « qui doit », pas dans les ventes du jour.
//
// Offre : une fois à l'installation en Esansyel, autant qu'il faut en Kwasans
// (`notebook_import` / `notebook_import_unlimited`, lib/planFeatures.ts).
// ─────────────────────────────────────────────────────────────────────────────

import { revalidatePath } from 'next/cache';
import { requirePermission } from '../../lib/serverAuth';
import { attempt, UserFacingError, type ActionResult } from '../../lib/actionResult';
import { FeatureLockedError, hasFeature } from '../../lib/entitlements';
import { requiredPlanFor } from '../../lib/planFeatures';
import { extractJson, claudeAvailable } from '../../lib/ai/claude';
import { mergeKaye, readKaye } from '../../lib/kaye';
import { localDay } from '../../lib/eveningReport';
import { createSaleAction } from './sales';
import { ensureQuickAmountProductAction } from './products';

export type NotebookRow = {
  name: string;
  /** Ce qu'il doit encore, en gourdes (le dola ayisyen est déjà converti). */
  amount: number;
  currency: 'HTG' | 'USD';
  /** AAAA-MM-JJ si une date est écrite sur la ligne, sinon vide. */
  date: string;
  note: string;
};

/** Une photo compressée côté téléphone tient sous 1 Mo ; 6 Mo de base64 est un garde-fou. */
const MAX_BASE64 = 6 * 1024 * 1024;

const SCHEMA: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  required: ['legible', 'rows'],
  properties: {
    legible: { type: 'boolean', description: 'Faux si la photo n’est pas une page de cahier lisible.' },
    rows: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['name', 'amount', 'unit', 'date', 'note'],
        properties: {
          name:   { type: 'string' },
          amount: { type: 'number', description: 'Ce que la personne doit encore.' },
          unit:   { type: 'string', enum: ['HTG', 'DOLA', 'USD'] },
          date:   { type: 'string', description: 'AAAA-MM-JJ si une date est écrite, sinon vide.' },
          note:   { type: 'string', description: 'Ce qui a été acheté, si c’est écrit. Vide sinon.' },
        },
      },
    },
  },
};

const SYSTEM = `Tu lis la photo d'une page de cahier de crédit tenu à la main par un petit commerçant ou un prestataire haïtien. L'écriture est manuscrite, en kreyòl ou en français, souvent abrégée.

Pour chaque personne qui doit de l'argent, rends une ligne : son nom tel qu'il est écrit, et ce qu'elle doit ENCORE.
- Si une ligne est barrée, rayée ou marquée « peye », « payé », « ok », la dette est réglée : ne la rends pas.
- Si des paiements partiels sont notés (« bay 200 », « -200 »), rends le reste dû, pas le montant de départ.
- Si la même personne apparaît plusieurs fois, rends une ligne par dette écrite ; ne les additionne pas.
- Unités : « G », « goud », « gdes » ou rien = HTG ; « dola » ou « $ » seul, en Haïti, veut dire dola ayisyen = DOLA ; « US », « USD », « dola ameriken » = USD. Ne convertis pas.
- Une date écrite à côté d'une ligne se rend au format AAAA-MM-JJ ; sans année, prends l'année en cours. Sans date, laisse vide.

N'invente rien. Un montant illisible : ne rends pas la ligne. Si la photo n'est pas une page de cahier, legible = false et aucune ligne.`;

type RawRow = { name: string; amount: number; unit: 'HTG' | 'DOLA' | 'USD'; date: string; note: string };

async function assertImportAllowed(settings: unknown) {
  if (!(await hasFeature('notebook_import'))) {
    throw new FeatureLockedError('notebook_import', requiredPlanFor('notebook_import'));
  }
  if (readKaye(settings).notebookImportsUsed >= 1 && !(await hasFeature('notebook_import_unlimited'))) {
    throw new FeatureLockedError('notebook_import_unlimited', requiredPlanFor('notebook_import_unlimited'));
  }
}

export async function readNotebookPage(imageBase64: string): Promise<ActionResult<{ legible: boolean; rows: NotebookRow[] }>> {
  return attempt(async () => {
    const ctx = await requirePermission('debts:write');
    if (!claudeAvailable()) throw new UserFacingError('La lecture du cahier n’est pas encore activée sur ce compte.');
    if (!imageBase64 || imageBase64.length > MAX_BASE64) throw new UserFacingError('Photo trop lourde : reprenez-la, plus près de la page.');

    const { data: biz } = await ctx.supabase.from('businesses').select('settings, timezone').eq('id', ctx.businessId).maybeSingle();
    await assertImportAllowed(biz?.settings);

    const year = localDay(new Date(), biz?.timezone || 'America/Port-au-Prince').slice(0, 4);
    const result = await extractJson<{ legible: boolean; rows: RawRow[] }>({
      system: `${SYSTEM}\n\nL'année en cours est ${year}.`,
      content: [
        { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: imageBase64 } },
        { type: 'text', text: 'Voici la page. Rends les dettes encore dues.' },
      ],
      schema: SCHEMA,
      // Une écriture manuscrite mérite qu'on y regarde à deux fois.
      effort: 'high',
    });
    if (!result) throw new UserFacingError('La page n’a pas pu être lue. Réessayez avec plus de lumière.');

    const rows: NotebookRow[] = (result.rows ?? [])
      .map((r) => {
        const amount = Number(r.amount);
        const unit = r.unit === 'USD' ? 'USD' : r.unit === 'DOLA' ? 'DOLA' : 'HTG';
        return {
          name: String(r.name ?? '').trim().slice(0, 80),
          amount: unit === 'DOLA' ? amount * 5 : amount,
          currency: unit === 'USD' ? 'USD' as const : 'HTG' as const,
          date: /^\d{4}-\d{2}-\d{2}$/.test(String(r.date ?? '')) ? String(r.date) : '',
          note: String(r.note ?? '').trim().slice(0, 120),
        };
      })
      .filter((r) => r.name && Number.isFinite(r.amount) && r.amount > 0);

    return { legible: Boolean(result.legible), rows };
  });
}

/** Écrit les crédits validés par le marchand. Rend le nombre de lignes enregistrées. */
export async function importNotebookCredits(rows: NotebookRow[]): Promise<ActionResult<{ imported: number; failed: string[] }>> {
  return attempt(async () => {
    const ctx = await requirePermission('debts:write');
    const { data: biz } = await ctx.supabase.from('businesses').select('settings, timezone').eq('id', ctx.businessId).maybeSingle();
    await assertImportAllowed(biz?.settings);

    const clean = (rows ?? [])
      .map((r) => ({ ...r, name: String(r.name ?? '').trim(), amount: Math.round(Number(r.amount) * 100) / 100 }))
      .filter((r) => r.name && r.amount > 0)
      .slice(0, 200);
    if (clean.length === 0) throw new UserFacingError('Aucune ligne à enregistrer.');

    const product = await ensureQuickAmountProductAction();
    if (!product.ok) throw new UserFacingError(product.message);

    const today = localDay(new Date(), biz?.timezone || 'America/Port-au-Prince');
    let imported = 0;
    const failed: string[] = [];
    for (const row of clean) {
      const res = await createSaleAction({
        business_id:      ctx.businessId,
        currency:         row.currency === 'USD' ? 'USD' : 'HTG',
        payment_method:   'Cash',
        payment_status:   'credit',
        discount_percent: 0,
        tax_amount:       0,
        customer_name:    row.name,
        // Une date plus récente qu'aujourd'hui est une faute de lecture : la dette date d'aujourd'hui.
        sale_date:        row.date && row.date <= today ? row.date : today,
        notes:            row.note ? `Kaye papye · ${row.note}` : 'Kaye papye',
        origin:           'notebook_import',
        items: [{
          product_id: product.data, product_name: row.note || 'Kredi kaye', quantity: 1,
          unit_price: row.amount, discount_percent: 0, tax_rate: 0,
        }],
      });
      if (res.ok && res.data.success) imported += 1;
      else failed.push(row.name);
    }

    if (imported > 0) {
      const settings = mergeKaye(biz?.settings, { notebookImportsUsed: readKaye(biz?.settings).notebookImportsUsed + 1 });
      await ctx.supabase.from('businesses').update({ settings }).eq('id', ctx.businessId);
    }

    revalidatePath('/creances');
    return { imported, failed };
  });
}
