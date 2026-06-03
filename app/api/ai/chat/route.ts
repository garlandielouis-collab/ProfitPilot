import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServer }          from '../../../../lib/supabaseServerClient';

const API_KEY = process.env.ANTHROPIC_API_KEY;
const API_URL = 'https://api.anthropic.com/v1/messages';
const MODEL   = 'claude-3-5-sonnet-20241022';

// ── System prompt ─────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `Tu es PilotAI, l'assistant intelligent de ProfitPilot — la solution de gestion financière pour les entrepreneurs haïtiens.

**RÔLE PRINCIPAL:**
Tu aides les propriétaires d'entreprises haïtiennes à prendre des décisions financières intelligentes basées sur leurs données réelles.

**CONTEXTE:**
- Petite et moyenne entreprise haïtienne
- Devise principale: HTG (Gourdes haïtiennes), secondaire USD
- Gestion: ventes, stocks, achats, dettes fournisseurs, dépenses
- Objectif: maximiser les profits et maintenir une trésorerie saine

**PRIORITÉS DE CONSEILS:**
1. DETTES (PRIORITÉ MAX) — si dettes > 30% des ventes: ALERTE ROUGE
2. STOCKS — rupture = perte de ventes imminente
3. VENTES — identifier les tendances et produits vedettes
4. TRÉSORERIE — maintenir un coussin de sécurité ≥ 10% des ventes mensuelles

**STYLE:**
- Réponds en Français ou Créole haïtien selon le contexte
- Direct, chaleureux, comme un ami-conseiller de confiance
- Chiffres concrets tirés des données fournies
- Commence par les urgences, termine par des actions concrètes numérotées
- Utilise du Markdown: **gras**, listes à puces, ## titres si nécessaire

**LIMITES:**
- Pas de conseils fiscaux ou légaux
- Reste dans le domaine de la gestion d'entreprise / finances
- Si données insuffisantes: demande des précisions`;

// ── Types ─────────────────────────────────────────────────────────────────────

type WeeklySummary = {
  totalSales:         number;
  totalExpenses:      number;
  profit:             number;
  salesCount:         number;
  productsSold:       number;
  criticalStockItems: number;
  topProducts:        Array<{ name: string; quantity: number; revenue: number }>;
  lowStockProducts:   Array<{ name: string; quantity: number; category: string }>;
  totalDebts:         number;
  overdueDebts:       number;
  cashAvailable:      number;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildContextBlock(ws: WeeklySummary): string {
  const debtRatio  = ws.totalSales > 0 ? ws.totalDebts / ws.totalSales : 0;
  const debtWarn   = debtRatio > 0.3 ? ' ⚠️ ALERTE: Dettes élevées!' : '';
  return `
**Données actuelles:**
- Ventes: ${ws.totalSales.toFixed(0)} HTG | Dépenses: ${ws.totalExpenses.toFixed(0)} HTG | Profit: ${ws.profit.toFixed(0)} HTG
- Dettes totales: ${ws.totalDebts.toFixed(0)} HTG${debtWarn} | En retard: ${ws.overdueDebts.toFixed(0)} HTG
- Cash disponible: ${ws.cashAvailable.toFixed(0)} HTG | Ratio dettes/ventes: ${(debtRatio * 100).toFixed(1)}%
- Ventes: ${ws.salesCount} transactions | ${ws.productsSold} articles vendus | ${ws.criticalStockItems} produits en stock critique
- Top produits: ${ws.topProducts.map((p) => `${p.name} (${p.quantity} vendus, ${p.revenue.toFixed(0)} HTG)`).join(', ') || 'aucun'}
- Stock bas: ${ws.lowStockProducts.map((p) => `${p.name} (${p.quantity}u, ${p.category})`).join(', ') || 'aucun'}
`.trim();
}

// ── Fetch recent DB messages for context ─────────────────────────────────────

async function getRecentMessages(conversationId: string) {
  try {
    const supabase = await getSupabaseServer();
    const { data } = await supabase
      .from('ai_messages')
      .select('role, content')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: false })
      .limit(20);

    return ((data ?? []) as Array<{ role: string; content: string }>)
      .filter((m) => m.role === 'user' || m.role === 'assistant')
      .reverse()
      .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }));
  } catch {
    return [];
  }
}

// ── POST handler ──────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const sup = await getSupabaseServer();
    const userCheck = await sup.auth.getUser();
    console.log('API /ai/chat auth.getUser', { user: userCheck.data?.user ?? null, error: userCheck.error?.message ?? null });
  } catch (e) {
    console.error('API /ai/chat auth check failed', e);
  }
  if (!API_KEY) {
    return NextResponse.json({ error: 'ANTHROPIC_API_KEY not configured' }, { status: 500 });
  }

  let body: {
    userMessage:         string;
    conversationId?:     string;
    weeklySummary?:      WeeklySummary | null;
    conversationHistory?: Array<{ role: 'user' | 'assistant'; content: string }>;
    stream?:             boolean;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const {
    userMessage,
    conversationId,
    weeklySummary,
    conversationHistory = [],
    stream = false,
  } = body;

  if (!userMessage) {
    return NextResponse.json({ error: 'userMessage is required' }, { status: 400 });
  }

  // Build message history
  let history = conversationHistory;
  if (conversationId && history.length === 0) {
    history = await getRecentMessages(conversationId);
  }

  // Inject context block into the last user message
  const contextBlock = weeklySummary ? buildContextBlock(weeklySummary) + '\n\n' : '';
  const messages = [
    ...history,
    {
      role: 'user' as const,
      content: contextBlock + userMessage,
    },
  ];

  // ── Streaming response ─────────────────────────────────────────────────────
  if (stream) {
    const upstream = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'x-api-key':         API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type':      'application/json',
      },
      body: JSON.stringify({
        model:      MODEL,
        max_tokens: 1500,
        stream:     true,
        system:     SYSTEM_PROMPT,
        messages,
      }),
    });

    if (!upstream.ok) {
      const err = await upstream.text();
      console.error('[Claude API stream]', err);
      return NextResponse.json({ error: 'API upstream error' }, { status: upstream.status });
    }

    // Transform Anthropic SSE → simplified SSE
    const readable = new ReadableStream({
      async start(controller) {
        const reader  = upstream.body!.getReader();
        const decoder = new TextDecoder();

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) {
              controller.enqueue(new TextEncoder().encode('data: [DONE]\n\n'));
              controller.close();
              break;
            }

            const chunk = decoder.decode(value, { stream: true });
            for (const line of chunk.split('\n')) {
              if (!line.startsWith('data:')) continue;
              const raw = line.slice(5).trim();
              if (!raw || raw === '[DONE]') continue;

              try {
                const evt = JSON.parse(raw) as Record<string, unknown>;

                // Anthropic event type: content_block_delta
                if (
                  evt.type === 'content_block_delta' &&
                  typeof evt.delta === 'object' &&
                  evt.delta !== null &&
                  (evt.delta as Record<string, unknown>).type === 'text_delta'
                ) {
                  const token = (evt.delta as Record<string, unknown>).text as string;
                  const sse   = `data: ${JSON.stringify({ delta: token })}\n\n`;
                  controller.enqueue(new TextEncoder().encode(sse));
                }
              } catch {
                // skip malformed lines
              }
            }
          }
        } catch (err) {
          controller.error(err);
        }
      },
    });

    return new Response(readable, {
      headers: {
        'Content-Type':  'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache',
        'Connection':    'keep-alive',
      },
    });
  }

  // ── Non-streaming fallback (backwards-compat) ─────────────────────────────
  const response = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'x-api-key':         API_KEY,
      'anthropic-version': '2023-06-01',
      'content-type':      'application/json',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 1024,
      system:     SYSTEM_PROMPT,
      messages,
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    console.error('[Claude API]', err);
    return NextResponse.json({ error: 'Failed to get AI response' }, { status: response.status });
  }

  const data = (await response.json()) as { content: Array<{ text: string }> };
  return NextResponse.json({ response: data.content[0]?.text ?? '' });
}

