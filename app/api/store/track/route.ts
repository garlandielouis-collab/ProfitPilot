// ─────────────────────────────────────────────────────────────────────────────
// POST /api/store/track — la mesure de l'entonnoir (§30)
//
// Point d'entrée public : n'importe qui peut l'appeler. Trois garde-fous, et
// aucun ne suppose la bonne foi de l'appelant.
//
//   La boutique doit exister et être OUVERTE. Un identifiant d'entreprise
//   inventé n'écrit rien.
//   Le type d'événement doit être l'un des cinq. La base a la même contrainte,
//   ce qui n'est pas une redondance : celle-ci renvoie 400, celle-là protège
//   contre un appelant qui ne passerait pas par ici.
//   Une limite de débit par session : sans elle, un script gonfle le nombre de
//   visiteurs d'un marchand, et un chiffre gonflé est pire qu'une absence de
//   chiffre — le marchand prendrait des décisions dessus.
//
// L'événement `purchase` n'est PAS accepté ici. Il est écrit par
// `create_store_order`, à l'endroit où l'achat est certain. Le laisser entrer
// par une route publique permettrait de déclarer des ventes qui n'existent pas.
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSupabaseService } from '../../../../lib/supabaseServiceClient';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  businessId: z.string().uuid(),
  sessionId:  z.string().min(1).max(64),
  event:      z.enum(['page_view', 'product_view', 'add_to_cart', 'checkout_started', 'whatsapp_click']),
  productId:  z.string().uuid().nullable().optional(),
  value:      z.number().finite().nonnegative().max(1e9).nullable().optional(),
  path:       z.string().max(300).nullable().optional(),
  referrer:   z.string().max(150).nullable().optional(),
});

// ── Limite de débit, en mémoire ─────────────────────────────────────────────
//
// Par instance, donc approximative — et c'est assez. Il ne s'agit pas de
// repousser une attaque, mais d'empêcher qu'une boucle de code ou un robot
// mal réglé écrive dix mille lignes en une minute.
const RATE_WINDOW = 60_000;
const RATE_MAX    = 60;
const hits = new Map<string, { count: number; resetAt: number }>();

function overRate(sessionId: string): boolean {
  const now = Date.now();
  const entry = hits.get(sessionId);

  if (!entry || entry.resetAt < now) {
    hits.set(sessionId, { count: 1, resetAt: now + RATE_WINDOW });
    // Ménage opportuniste : la carte ne grandit pas indéfiniment sur une
    // instance qui vit longtemps.
    if (hits.size > 5_000) {
      for (const [key, value] of hits) if (value.resetAt < now) hits.delete(key);
    }
    return false;
  }

  entry.count += 1;
  return entry.count > RATE_MAX;
}

export async function POST(req: NextRequest) {
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  // Une mesure invalide ne mérite pas un message d'erreur détaillé : on rend
  // 204 dans tous les cas, pour ne rien apprendre à qui sonde la route.
  if (!parsed.success) return new NextResponse(null, { status: 204 });

  const body = parsed.data;
  if (overRate(body.sessionId)) return new NextResponse(null, { status: 204 });

  const svc = getSupabaseService();

  const { data: store } = await svc
    .from('store_settings')
    .select('business_id')
    .eq('business_id', body.businessId)
    .eq('is_active', true)
    .maybeSingle();

  if (!store) return new NextResponse(null, { status: 204 });

  await svc.from('store_analytics_events').insert({
    business_id: body.businessId,
    session_id:  body.sessionId,
    event_type:  body.event,
    product_id:  body.productId ?? null,
    value:       body.value ?? null,
    path:        body.path ?? null,
    referrer:    body.referrer ?? null,
  });

  return new NextResponse(null, { status: 204 });
}
