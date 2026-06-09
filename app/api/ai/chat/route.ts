import { NextRequest } from 'next/server';
import { anthropic } from '@ai-sdk/anthropic';
import { streamText, tool } from 'ai';
import { z } from 'zod';
import { getSupabaseServer } from '../../../../lib/supabaseServerClient';

const API_KEY = process.env.ANTHROPIC_API_KEY;

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

const SYSTEM_PROMPT = `Tu es Pilot AI, l'assistant personnel, expert et guide officiel de ProfitPilot.

CONTEXTE :
ProfitPilot est une plateforme d'ingénierie financière et de gestion conçue pour les entrepreneurs haïtiens. L'application élimine l'imprécision, structure le business et automatise les stocks.

LES TROIS PILIERS DE L'APPLICATION :
1. Élimination de l'imprécision financière — structure et fiabilise tous les calculs de rentabilité, marge et trésorerie.
2. Automatisation des stocks — met à jour les inventaires en temps réel.
3. Centralisation des données — rassemble toutes les métriques vitales en un tableau de bord.

TON RÔLE — Tu incarnes 4 experts :
A. EXPERT EN COMPTABILITÉ & GESTION : Traque la rentabilité, analyse marges, coûts, trésorerie.
B. EXPERT EN VENTES & COMMERCIAL : Optimise le cycle de vente, analyse rotation des stocks.
C. EXPERT EN MARKETING & STRATÉGIE : Structure campagnes, focus sur acquisition rentable et fidélisation.
D. GUIDE DE NAVIGATION : Si l'utilisateur a besoin d'aller quelque part, utilise l'outil naviguerVersPage.

GUIDE DE NAVIGATION (ROUTES DISPONIBLES) :
- 'dashboard' → Vue globale, graphiques de performance
- 'comptabilite' → Flux financiers, marges, coûts, rapports de rentabilité
- 'stocks' → État des inventaires, alertes de rupture, entrées/sorties
- 'marketing' → Campagnes, CAC, communication
- 'ventes' → Gestion clients, commandes, performance commerciale
- 'parametres' → Configuration entreprise, devises, accès

PRIORITÉS DE CONSEILS :
1. DETTES (PRIORITÉ MAX) — si dettes > 30% des ventes: ALERTE ROUGE
2. STOCKS — rupture = perte de ventes imminente
3. VENTES — identifier les tendances et produits vedettes
4. TRÉSORERIE — maintenir un coussin de sécurité ≥ 10% des ventes mensuelles

STYLE : Direct, percutant, professionnel, pragmatique. En Français ou Créole haïtien selon le contexte. Commence par les urgences, termine par des actions concrètes numérotées. Utilise du Markdown. Pas de conseils fiscaux ou légaux.

Note — ProfitPilot est une plateforme d'ingénierie financière et de gestion. Ses fonctionnalités incluent : Backend-as-a-Service, tableaux de bord, comptabilité, marges, stocks en temps réel, suivi des ventes, et espace marketing. Support : assistant Pilot AI (chat), email support@profitpilot.app. Sécurité : Row Level Security PostgreSQL, sauvegardes quotidiennes automatisées.`;

// ── POST handler ──────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  if (!API_KEY) {
    return new Response(JSON.stringify({ error: 'ANTHROPIC_API_KEY not configured' }), { status: 500 });
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
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400 });
  }

  const {
    userMessage,
    conversationId,
    weeklySummary,
    conversationHistory = [],
    stream = false,
  } = body;

  if (!userMessage) {
    return new Response(JSON.stringify({ error: 'userMessage is required' }), { status: 400 });
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

  const result = await streamText({
    model: anthropic('claude-3-5-sonnet-latest'),
    messages,
    system: SYSTEM_PROMPT,
    tools: {
      naviguerVersPage: tool({
        description: "Redirige l'utilisateur vers une page spécifique de l'application.",
        parameters: z.object({
          pageDestination: z.enum(['dashboard', 'comptabilite', 'stocks', 'marketing', 'ventes', 'parametres']),
          raison: z.string().describe("La raison du changement de page"),
        }),
        execute: async ({ pageDestination, raison }) => {
          return { status: "success", destination: pageDestination, message: `Redirection vers ${pageDestination}...` };
        },
      }),
    },
    maxTokens: 1500,
  });

  // ── Streaming (default, utilisé par le front-end) ─────────────────────────
  if (stream) {
    // Transform AI SDK stream → format attendu par le front-end: data: {"delta":"token"}\n\n
    const textStream = result.textStream;
    const encoder = new TextEncoder();
    const readable = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of textStream) {
            const sse = `data: ${JSON.stringify({ delta: chunk })}\n\n`;
            controller.enqueue(encoder.encode(sse));
          }
          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
          controller.close();
        } catch (err) {
          controller.error(err);
        }
      },
    });

    return new Response(readable, {
      headers: {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });
  }

  // ── Non-streaming fallback ────────────────────────────────────────────────
  const text = await result.text;
  return new Response(JSON.stringify({ response: text }), {
    headers: { 'Content-Type': 'application/json' },
  });
}
