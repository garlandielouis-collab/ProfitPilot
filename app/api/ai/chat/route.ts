import { NextRequest } from 'next/server';
import { anthropic } from '@ai-sdk/anthropic';
import { streamText } from 'ai';
import { getSupabaseServer } from '../../../../lib/supabaseServerClient';
import { getSupabaseService } from '../../../../lib/supabaseServiceClient';
import { plansWithFeature } from '../../../../lib/planFeatures';
import { getPlanLabel } from '../../../../lib/plans';
import { aiMonthlyAllowance, quotaBonusFor } from '../../../../lib/quotas';
import { SIGNUP_AI_QUESTIONS } from '../../../../lib/referral';

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
- '/dashboard' → Vue globale, graphiques de performance
- '/rapports/comptabilite' → Flux financiers, marges, coûts, rapports de rentabilité
- '/inventory' → État des inventaires, alertes de rupture, entrées/sorties
- '/sales' → Gestion clients, commandes, performance commerciale
- '/expenses' → Dépenses et charges
- '/products' → Catalogue produits et prix
- '/suppliers' → Fournisseurs et approvisionnement
- '/purchases' → Achats et commandes fournisseurs
- '/dettes' → Suivi des dettes et créances
- '/rapports' → Tous les rapports financiers
- '/settings' → Configuration entreprise, devises, accès

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

  // Verify subscription plan
  const supabase = await getSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return new Response(JSON.stringify({ error: 'Non authentifié' }), { status: 401 });
  }
  // Les offres autorisées viennent du registre, pas d'une liste recopiée ici :
  // ajouter Pilot AI à une offre ne doit se faire qu'à un seul endroit.
  //
  // Contrairement aux lectures, on exige un abonnement réellement actif et non
  // le repli d'essai : chaque appel consomme des jetons facturés.
  const now = new Date().toISOString();
  const { data: sub } = await supabase
    .from('subscriptions')
    .select('plan_key')
    .eq('user_id', user.id)
    .eq('status', 'active')
    .gte('expires_at', now)
    .in('plan_key', plansWithFeature('ai_assistant'))
    .maybeSingle();
  // Le paquet de questions gagné par parrainage est la SECONDE porte. Un
  // marchand Esansyel qui a amené un ami a dix questions à lui ; les lui
  // refuser au motif qu'il n'a pas l'offre reviendrait à afficher une
  // récompense qu'on ne sert pas. Elles restent comptées à l'unité juste en
  // dessous : la porte est ouverte, le couloir est court, et c'est exactement
  // ce qu'un avant-goût doit être.
  const bonusQuestions = await quotaBonusFor(user.id, 'ai_questions');

  if (!sub && bonusQuestions <= 0) {
    const required = plansWithFeature('ai_assistant').map(getPlanLabel).join(' ou ');
    return new Response(JSON.stringify({ error: `Offre ${required} requise pour Pilot AI` }), { status: 403 });
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

  // ── Le quota mensuel de questions ─────────────────────────────────────────
  //
  // La page de prix promet « 30 questions par mois » sur Kwasans depuis le
  // premier jour, et rien ne les comptait : la route vérifiait l'offre, jamais
  // le nombre. Le parrainage a forcé la main — « +10 questions par filleul »
  // au-dessus d'un plafond inexistant n'aurait été qu'une phrase.
  //
  // Le décompte se fait ICI, juste avant l'appel au modèle : c'est là que la
  // question coûte de l'argent, qu'elle finisse enregistrée dans une
  // conversation ou non. Le test et l'incrément sont une seule instruction
  // côté base, sans quoi deux onglets ouverts passeraient la 30ᵉ question deux
  // fois.
  //
  // La clé de service, parce qu'un marchand qui pourrait appeler la fonction
  // lui-même choisirait son propre plafond.
  const allowance = aiMonthlyAllowance((sub?.plan_key as string | undefined) ?? null);
  const service   = getSupabaseService();

  const { data: quota, error: quotaError } = await service.rpc('consume_ai_question', {
    p_user:      user.id,
    // `Infinity` ne traverse pas le JSON : l'illimité se dit avec un négatif.
    p_allowance: Number.isFinite(allowance) ? allowance : -1,
  });

  // Table absente (migration non jouée) : on laisse passer. Un compteur qui
  // n'existe pas encore ne doit pas fermer l'assistant à ceux qui le paient.
  if (!quotaError) {
    const row = Array.isArray(quota) ? quota[0] : quota;
    if (row && row.allowed === false) {
      // Deux situations, deux phrases. Dire « vos 0 questions sont épuisées »
      // à un marchand Esansyel qui vient de finir son paquet de parrainage
      // serait à la fois faux et décourageant : ce qu'il doit lire, c'est
      // comment en obtenir d'autres.
      const error = allowance > 0
        ? `Vous avez utilisé vos ${allowance} questions de ce mois-ci. Elles se rechargent le 1er du mois — ou tout de suite avec ${getPlanLabel('Expert')}, sans compteur.`
        : `Vos questions offertes sont épuisées. Amenez un marchand avec votre code pour en recevoir ${SIGNUP_AI_QUESTIONS} de plus, ou passez à ${getPlanLabel('Business Pilot')}.`;

      return new Response(
        JSON.stringify({ error, quota: { used: row.used, allowance } }),
        { status: 429, headers: { 'Content-Type': 'application/json' } },
      );
    }
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
    model: anthropic('claude-sonnet-4-6'),
    messages,
    system: SYSTEM_PROMPT,
    maxOutputTokens: 4096,
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
