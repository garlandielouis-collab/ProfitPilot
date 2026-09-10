// ─────────────────────────────────────────────────────────────────────────────
// Le langage du tableau de bord — §2, §29, §32, §39, §40, §51, §58, §59
//
// Le serveur renvoie des nombres ; ce fichier les transforme en phrases. Il est
// côté client pour une raison qui n'est pas négociable : chaque phrase existe
// en français ET en créole, et la traduction passe par `t({ fr, ht })`. Une
// phrase française figée dans une réponse serveur serait morte en créole.
//
// ── Ce que le §2 impose ────────────────────────────────────────────────────
//
//   Niveau 1  « Que se passe-t-il ? »   la valeur, la variation
//   Niveau 2  « Pourquoi ? »            la cause, en une phrase
//   Niveau 3  « Que dois-je faire ? »   une action, un lien
//
// Une recommandation sans les trois n'est pas une recommandation : c'est un
// constat, et le marchand le savait déjà.
//
// ── Ce que le §59 impose ───────────────────────────────────────────────────
//
// Pas « Warning! Error! » mais « Votre stock de X mérite votre attention ».
// Pas « No data » mais « Nous aurons besoin de plus de ventes pour calculer
// cette tendance ». Professionnel, direct, encourageant, jamais infantilisant.
// ─────────────────────────────────────────────────────────────────────────────

import type { AiDepth } from '../../lib/dashboardLevel';
import type {
  AlertsBlock, CustomerIntel, FinanceBlock, InventoryIntel,
  StoreIntel, TeamIntel, TopProductRow,
} from '../../app/actions/dashboard';
import { daysUntilStockout, type Forecast } from './forecast';

type Translate = (t: { fr: string; ht: string }) => string;

const fmt = (n: number): string =>
  new Intl.NumberFormat('fr-HT', { maximumFractionDigits: 0 }).format(Math.round(n));

const pct = (n: number): string => `${n > 0 ? '+' : ''}${n.toFixed(1)} %`;

// ─────────────────────────────────────────────────────────────────────────────
// §51 — chaque indicateur porte sa formule
//
// « Si un indicateur est calculé : documenter sa formule. » Elle est écrite ici
// une seule fois et voyage avec la carte, en `title` et en texte accessible.
// Un chiffre dont on ne peut pas retrouver l'origine n'est pas un chiffre de
// gestion, c'est une opinion.
// ─────────────────────────────────────────────────────────────────────────────

export type KpiKey =
  | 'revenue' | 'expenses' | 'grossMargin' | 'netProfit' | 'cashFlow'
  | 'averageOrderValue' | 'salesCount' | 'marginPct' | 'supplierDebt'
  | 'receivables' | 'stockValue' | 'turnover' | 'health';

export function kpiFormula(t: Translate, key: KpiKey): string {
  switch (key) {
    case 'revenue':
      return t({
        fr: 'Somme des ventes de la période, converties au taux du jour.',
        ht: 'Total vant peryòd la, konvèti nan to jounen an.',
      });
    case 'expenses':
      return t({
        fr: 'Somme des dépenses enregistrées sur la période.',
        ht: 'Total depans anrejistre sou peryòd la.',
      });
    case 'grossMargin':
      return t({
        fr: 'Marge brute = Ventes − Coût des marchandises vendues.',
        ht: 'Maj brit = Vant − Kòb machandiz yo koute.',
      });
    case 'netProfit':
      return t({
        fr: 'Profit net = Marge brute − Dépenses.',
        ht: 'Pwofi nèt = Maj brit − Depans.',
      });
    case 'cashFlow':
      return t({
        fr: 'Trésorerie = Encaissé − Décaissé sur la période.',
        ht: 'Lajan kach = Sa ki antre − Sa ki soti sou peryòd la.',
      });
    case 'averageOrderValue':
      return t({
        fr: 'Panier moyen = Ventes ÷ Nombre de ventes.',
        ht: 'Mwayèn pa vant = Vant ÷ Kantite vant.',
      });
    case 'salesCount':
      return t({
        fr: 'Nombre de ventes enregistrées sur la période.',
        ht: 'Kantite vant anrejistre sou peryòd la.',
      });
    case 'marginPct':
      return t({
        fr: 'Marge brute ÷ Ventes × 100.',
        ht: 'Maj brit ÷ Vant × 100.',
      });
    case 'supplierDebt':
      return t({
        fr: 'Reste à payer sur les achats de la période.',
        ht: 'Sa ki rete pou peye sou acha peryòd la.',
      });
    case 'receivables':
      return t({
        fr: 'Somme des crédits clients non encore réglés.',
        ht: 'Total kredi kliyan ki poko peye.',
      });
    case 'stockValue':
      return t({
        fr: 'Somme de (quantité × prix d’achat) sur tous vos produits.',
        ht: 'Total (kantite × pri acha) sou tout pwodwi ou yo.',
      });
    case 'turnover':
      return t({
        fr: 'Rotation = Unités vendues sur 30 jours ÷ Stock actuel.',
        ht: 'Wotasyon = Inite vandi sou 30 jou ÷ Stòk aktyèl la.',
      });
    case 'health':
      return t({
        fr: 'Score sur 100 : marge (30), régularité (20), trésorerie (25), recouvrement (25).',
        ht: 'Nòt sou 100 : maj (30), regilarite (20), lajan kach (25), rekouvreman (25).',
      });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// §29 / §32 — les priorités et les opportunités
// ─────────────────────────────────────────────────────────────────────────────

export type PriorityKind = 'risk' | 'opportunity' | 'margin' | 'cash' | 'customer' | 'team';

export type Priority = {
  id: string;
  kind: PriorityKind;
  tone: 'danger' | 'warning' | 'success' | 'info';
  /** Niveau 1 du §2 : que se passe-t-il. */
  title: string;
  /** Niveau 2 : pourquoi. */
  detail: string;
  /** Ce que ça peut coûter ou rapporter — le §32 l'exige sur les opportunités. */
  impact?: string;
  /** Niveau 3 : quoi faire, et où. */
  action: string;
  href: string;
  /** Sert au tri : plus c'est haut, plus ça passe devant. */
  weight: number;
};

export type NarrativeInput = {
  currency: string;
  finance: FinanceBlock | null;
  baseline: FinanceBlock | null;
  alerts: AlertsBlock;
  topProducts: TopProductRow[];
  inventory?: InventoryIntel | null;
  customers?: CustomerIntel | null;
  team?: TeamIntel | null;
  store?: StoreIntel | null;
  forecast?: Forecast | null;
  healthScore?: number | null;
};

const deltaOf = (now: number, before: number): number | null =>
  before > 0 ? Math.round(((now - before) / before) * 1000) / 10 : null;

/**
 * Ce qui réclame l'attention, trié par urgence.
 *
 * Le §29 est catégorique : « Ne jamais afficher 10 alertes. Maximum 3
 * priorités. » Le tri est donc la fonction, pas la liste : on produit tout ce
 * qu'on sait, on ordonne, et on coupe. Ce qui tombe sous la barre n'est pas
 * perdu — il vit dans l'écran qui le concerne.
 */
export function buildPriorities(
  t: Translate,
  input: NarrativeInput,
  max = 3,
): Priority[] {
  const out: Priority[] = [];
  const cur = input.currency;
  const { finance, baseline, alerts, inventory, customers } = input;

  // ── Rupture imminente (§29 — l'exemple même du document) ─────────────────
  if (inventory) {
    const soon = inventory.fastMovers
      .map((p) => ({ ...p, days: daysUntilStockout(p.stock, p.units, inventory.windowDays) }))
      .filter((p) => p.days !== null && p.days <= 10)
      .sort((a, b) => (a.days ?? 99) - (b.days ?? 99))[0];

    if (soon && soon.days !== null) {
      out.push({
        id: 'stockout-soon',
        kind: 'risk',
        tone: 'warning',
        title: t({ fr: 'Risque de rupture', ht: 'Risk stòk fini' }),
        detail: t({
          fr: `${soon.name} pourrait être épuisé dans environ ${soon.days} jour${soon.days > 1 ? 's' : ''} au rythme actuel.`,
          ht: `${soon.name} ka fini nan anviwon ${soon.days} jou nan ritm sa a.`,
        }),
        action: t({ fr: 'Voir le stock', ht: 'Gade stòk la' }),
        href: '/inventory',
        weight: 80 - Math.min(soon.days, 10),
      });
    }
  }

  // ── Rupture déjà là ──────────────────────────────────────────────────────
  if (alerts.outOfStock > 0) {
    out.push({
      id: 'out-of-stock',
      kind: 'risk',
      tone: 'danger',
      title: t({
        fr: `${alerts.outOfStock} produit${alerts.outOfStock > 1 ? 's' : ''} épuisé${alerts.outOfStock > 1 ? 's' : ''}`,
        ht: `${alerts.outOfStock} pwodwi fini`,
      }),
      detail: t({
        fr: 'Chaque jour sans réapprovisionnement est une vente qui part ailleurs.',
        ht: 'Chak jou san rekòmande se yon vant ki ale lòt kote.',
      }),
      action: t({ fr: 'Réapprovisionner', ht: 'Rekòmande' }),
      href: '/inventory',
      weight: 85,
    });
  }

  // ── Créances en retard ───────────────────────────────────────────────────
  if (alerts.overdueInvoices > 0) {
    out.push({
      id: 'overdue',
      kind: 'cash',
      tone: 'danger',
      title: t({
        fr: `${fmt(alerts.overdueAmount)} ${cur} en retard de paiement`,
        ht: `${fmt(alerts.overdueAmount)} ${cur} ki an reta`,
      }),
      detail: t({
        fr: `${alerts.overdueInvoices} client${alerts.overdueInvoices > 1 ? 's ont' : ' a'} dépassé la date convenue. Cet argent est déjà le vôtre.`,
        ht: `${alerts.overdueInvoices} kliyan depase dat yo te dakò a. Lajan sa a se pa ou deja.`,
      }),
      action: t({ fr: 'Relancer', ht: 'Fè rapèl' }),
      href: '/creances',
      weight: 90,
    });
  }

  // ── Marge en recul ───────────────────────────────────────────────────────
  if (finance && baseline && finance.revenue > 0 && baseline.revenue > 0) {
    const now  = (finance.grossMargin / finance.revenue) * 100;
    const then = (baseline.grossMargin / baseline.revenue) * 100;
    if (then - now >= 3) {
      out.push({
        id: 'margin-drop',
        kind: 'margin',
        tone: 'warning',
        title: t({ fr: 'Votre marge recule', ht: 'Maj ou ap bese' }),
        detail: t({
          fr: `Elle passe de ${then.toFixed(1)} % à ${now.toFixed(1)} %. Vos prix d’achat ou vos frais ont bougé.`,
          ht: `Li soti ${then.toFixed(1)} % pou rive ${now.toFixed(1)} %. Pri acha ou oswa frè ou yo chanje.`,
        }),
        impact: t({
          fr: `Au volume actuel, ${then - now >= 0 ? fmt(((then - now) / 100) * finance.revenue) : '0'} ${cur} de marge en moins sur la période.`,
          ht: `Nan volim sa a, ${fmt(((then - now) / 100) * finance.revenue)} ${cur} maj an mwens sou peryòd la.`,
        }),
        action: t({ fr: 'Analyser les prix', ht: 'Analize pri yo' }),
        href: '/rentabilite',
        weight: 75,
      });
    }
  }

  // ── Vente à perte ────────────────────────────────────────────────────────
  if (finance && finance.revenue > 0 && finance.grossMargin < 0) {
    out.push({
      id: 'selling-at-loss',
      kind: 'margin',
      tone: 'danger',
      title: t({ fr: 'Vous vendez à perte', ht: 'W ap vann anba pri' }),
      detail: t({
        fr: 'Le coût de vos marchandises dépasse ce que vous encaissez.',
        ht: 'Sa machandiz yo koute depase sa w ap ranmase.',
      }),
      action: t({ fr: 'Revoir les prix', ht: 'Revize pri yo' }),
      href: '/rentabilite',
      weight: 100,
    });
  }

  // ── Opportunité de croissance ────────────────────────────────────────────
  if (finance && baseline) {
    const delta = deltaOf(finance.revenue, baseline.revenue);
    if (delta !== null && delta >= 10) {
      const leader = input.topProducts[0];
      out.push({
        id: 'growth',
        kind: 'opportunity',
        tone: 'success',
        title: t({ fr: 'Croissance en cours', ht: 'Kwasans an mach' }),
        detail: leader
          ? t({
              fr: `Vos ventes progressent de ${pct(delta)}, portées surtout par ${leader.name}.`,
              ht: `Vant ou yo monte ${pct(delta)}, sitou gras ak ${leader.name}.`,
            })
          : t({
              fr: `Vos ventes progressent de ${pct(delta)} par rapport à la période précédente.`,
              ht: `Vant ou yo monte ${pct(delta)} parapò ak peryòd anvan an.`,
            }),
        impact: t({
          fr: 'Renforcer le stock de ce qui porte la hausse évite de la casser.',
          ht: 'Ranfòse stòk sa k ap fè monte a anpeche l kase.',
        }),
        action: t({ fr: 'Voir les produits', ht: 'Gade pwodwi yo' }),
        href: '/products',
        weight: 60,
      });
    }
  }

  // ── Clients endormis (§33) ───────────────────────────────────────────────
  if (customers && customers.dormant >= 5) {
    out.push({
      id: 'dormant-customers',
      kind: 'customer',
      tone: 'info',
      title: t({
        fr: `${customers.dormant} clients n’ont rien acheté depuis 60 jours`,
        ht: `${customers.dormant} kliyan pa achte anyen depi 60 jou`,
      }),
      detail: t({
        fr: 'Ils vous connaissent déjà : les faire revenir coûte moins cher qu’en trouver de nouveaux.',
        ht: 'Yo konnen ou deja : fè yo tounen koute mwens pase chèche nouvo.',
      }),
      action: t({ fr: 'Voir les clients', ht: 'Gade kliyan yo' }),
      href: '/customers',
      weight: 45,
    });
  }

  // ── Produit à forte demande, marge faible (§32) ──────────────────────────
  const weakStar = input.topProducts.find(
    (p) => p.marginPct !== null && p.marginPct < 10 && p.revenue > 0,
  );
  if (weakStar && weakStar.marginPct !== null) {
    out.push({
      id: 'weak-margin-star',
      kind: 'margin',
      tone: 'warning',
      title: t({ fr: 'Un best-seller peu rentable', ht: 'Yon pwodwi ki vann men ki pa rapòte' }),
      detail: t({
        fr: `${weakStar.name} se vend bien mais ne laisse que ${weakStar.marginPct.toFixed(1)} % de marge.`,
        ht: `${weakStar.name} vann byen men li kite sèlman ${weakStar.marginPct.toFixed(1)} % maj.`,
      }),
      impact: t({
        fr: 'Quelques gourdes de plus par unité changeraient beaucoup sur ce volume.',
        ht: 'Kèk goud anplis pa inite ta chanje anpil sou volim sa a.',
      }),
      action: t({ fr: 'Simuler un prix', ht: 'Simile yon pri' }),
      href: '/rentabilite',
      weight: 55,
    });
  }

  // ── Stock dormant (§18) ──────────────────────────────────────────────────
  if (inventory && inventory.slowMovers.length >= 3) {
    out.push({
      id: 'dead-stock',
      kind: 'risk',
      tone: 'info',
      title: t({
        fr: `${inventory.slowMovers.length} produits sans vente depuis ${inventory.windowDays} jours`,
        ht: `${inventory.slowMovers.length} pwodwi san vant depi ${inventory.windowDays} jou`,
      }),
      detail: t({
        fr: 'C’est de l’argent immobilisé sur une étagère.',
        ht: 'Se lajan ki kanpe sou yon etajè.',
      }),
      action: t({ fr: 'Voir l’inventaire', ht: 'Gade envantè a' }),
      href: '/inventory',
      weight: 40,
    });
  }

  return out.sort((a, b) => b.weight - a.weight).slice(0, max);
}

/**
 * Les opportunités de croissance (§32) — chacune avec insight, raison, impact
 * et action. Ce sont des priorités d'un autre registre : elles ne réclament
 * rien, elles proposent. D'où une liste séparée, jamais mélangée aux risques.
 */
export function buildOpportunities(t: Translate, input: NarrativeInput): Priority[] {
  const out: Priority[] = [];
  const cur = input.currency;

  if (input.inventory) {
    for (const p of input.inventory.fastMovers.slice(0, 2)) {
      const days = daysUntilStockout(p.stock, p.units, input.inventory.windowDays);
      if (days !== null && days <= 21 && days > 10) {
        out.push({
          id: `restock-${p.id}`,
          kind: 'opportunity',
          tone: 'info',
          title: t({ fr: `Renforcer ${p.name}`, ht: `Ranfòse ${p.name}` }),
          detail: t({
            fr: `${p.units} unités vendues en ${input.inventory.windowDays} jours, il en reste ${p.stock}.`,
            ht: `${p.units} inite vandi nan ${input.inventory.windowDays} jou, gen ${p.stock} ki rete.`,
          }),
          impact: t({
            fr: `Au rythme actuel, le stock tient encore ${days} jours.`,
            ht: `Nan ritm sa a, stòk la ap dire ${days} jou ankò.`,
          }),
          action: t({ fr: 'Commander', ht: 'Kòmande' }),
          href: '/purchases',
          weight: 50,
        });
      }
    }
  }

  if (input.customers && input.customers.averageValue > 0 && input.customers.dormant > 0) {
    out.push({
      id: 'reactivate',
      kind: 'opportunity',
      tone: 'info',
      title: t({ fr: 'Réveiller vos clients fidèles', ht: 'Reveye kliyan fidèl ou yo' }),
      detail: t({
        fr: `${input.customers.dormant} clients dormants, pour une valeur moyenne de ${fmt(input.customers.averageValue)} ${cur} chacun.`,
        ht: `${input.customers.dormant} kliyan k ap dòmi, ak yon valè mwayèn ${fmt(input.customers.averageValue)} ${cur} chak.`,
      }),
      impact: t({
        fr: `Si un sur cinq revient, cela ferait environ ${fmt((input.customers.dormant / 5) * input.customers.averageValue)} ${cur}.`,
        ht: `Si youn sou senk tounen, sa ta fè anviwon ${fmt((input.customers.dormant / 5) * input.customers.averageValue)} ${cur}.`,
      }),
      action: t({ fr: 'Voir les clients', ht: 'Gade kliyan yo' }),
      href: '/customers',
      weight: 45,
    });
  }

  if (input.store && input.store.pendingOrders > 0) {
    out.push({
      id: 'pending-orders',
      kind: 'opportunity',
      tone: 'warning',
      title: t({ fr: 'Commandes en ligne à finaliser', ht: 'Kòmand anliy pou fini' }),
      detail: t({
        fr: `${input.store.pendingOrders} commande${input.store.pendingOrders > 1 ? 's' : ''} non payée${input.store.pendingOrders > 1 ? 's' : ''}, soit ${fmt(input.store.pendingValue)} ${cur}.`,
        ht: `${input.store.pendingOrders} kòmand ki poko peye, sa fè ${fmt(input.store.pendingValue)} ${cur}.`,
      }),
      impact: t({
        fr: 'Un message suffit souvent à débloquer une commande hésitante.',
        ht: 'Yon mesaj souvan ase pou debloke yon kòmand ki ap ezite.',
      }),
      action: t({ fr: 'Voir les commandes', ht: 'Gade kòmand yo' }),
      href: '/boutique/commandes',
      weight: 55,
    });
  }

  return out.sort((a, b) => b.weight - a.weight).slice(0, 3);
}

// ─────────────────────────────────────────────────────────────────────────────
// §58 — PilotAI change de PROFONDEUR, pas de longueur
// ─────────────────────────────────────────────────────────────────────────────

export type PilotSaying = {
  /** Le constat, toujours présent. */
  headline: string;
  /** La cause — à partir de Kwasans. */
  because?: string;
  /** L'action recommandée — à partir de Kwasans. */
  recommend?: string;
  action?: { label: string; href: string };
};

/**
 * Ce que PilotAI dit du commerce, au bon niveau.
 *
 *   observation  Esansyel · un constat, rien de plus
 *   advice       Kwasans  · constat + recommandation concrète
 *   strategy     Elit     · constat + écart expliqué + action prioritaire
 *
 * Toujours à partir des chiffres réels de la période. Quand ils manquent, la
 * phrase le dit — c'est le §59 : « Nous aurons besoin de plus de ventes pour
 * calculer cette tendance », jamais « No data ».
 */
export function pilotSay(
  t: Translate,
  depth: AiDepth,
  input: NarrativeInput,
): PilotSaying | null {
  const { finance, baseline, topProducts, currency } = input;
  if (!finance) return null;

  if (finance.revenue === 0) {
    return {
      headline: t({
        fr: 'Nous aurons besoin de quelques ventes de plus pour calculer une tendance.',
        ht: 'N ap bezwen kèk vant anplis pou n kalkile yon tandans.',
      }),
    };
  }

  const revenueDelta = baseline ? deltaOf(finance.revenue, baseline.revenue) : null;
  const marginNow  = (finance.grossMargin / finance.revenue) * 100;
  const marginThen = baseline && baseline.revenue > 0
    ? (baseline.grossMargin / baseline.revenue) * 100
    : null;
  const leader = topProducts[0];

  // ── Esansyel : un constat ────────────────────────────────────────────────
  if (depth === 'observation') {
    if (revenueDelta === null) {
      return {
        headline: t({
          fr: `Vous avez vendu pour ${fmt(finance.revenue)} ${currency} sur cette période.`,
          ht: `Ou vann pou ${fmt(finance.revenue)} ${currency} sou peryòd sa a.`,
        }),
      };
    }
    return {
      headline: revenueDelta >= 0
        ? t({
            fr: `Vos ventes progressent de ${pct(revenueDelta)}${leader ? `, portées surtout par ${leader.name}` : ''}.`,
            ht: `Vant ou yo monte ${pct(revenueDelta)}${leader ? `, sitou gras ak ${leader.name}` : ''}.`,
          })
        : t({
            fr: `Vos ventes reculent de ${pct(revenueDelta)} par rapport à la période précédente.`,
            ht: `Vant ou yo bese ${pct(revenueDelta)} parapò ak peryòd anvan an.`,
          }),
    };
  }

  // ── Kwasans : constat + recommandation ───────────────────────────────────
  if (depth === 'advice') {
    const headline = revenueDelta !== null
      ? t({
          fr: `Ventes ${pct(revenueDelta)}, marge à ${marginNow.toFixed(1)} %.`,
          ht: `Vant ${pct(revenueDelta)}, maj a ${marginNow.toFixed(1)} %.`,
        })
      : t({
          fr: `${fmt(finance.revenue)} ${currency} de ventes, marge à ${marginNow.toFixed(1)} %.`,
          ht: `${fmt(finance.revenue)} ${currency} vant, maj a ${marginNow.toFixed(1)} %.`,
        });

    if (input.inventory && input.inventory.restock.length > 0) {
      const first = input.inventory.restock[0];
      return {
        headline,
        recommend: t({
          fr: `${input.inventory.restock.length} produit${input.inventory.restock.length > 1 ? 's doivent' : ' doit'} être réapprovisionné${input.inventory.restock.length > 1 ? 's' : ''}, à commencer par ${first.name}.`,
          ht: `${input.inventory.restock.length} pwodwi bezwen rekòmande, kòmanse ak ${first.name}.`,
        }),
        action: { label: t({ fr: 'Voir le stock', ht: 'Gade stòk la' }), href: '/inventory' },
      };
    }

    if (marginThen !== null && marginNow < marginThen - 2) {
      return {
        headline,
        recommend: t({
          fr: `Votre marge perd ${(marginThen - marginNow).toFixed(1)} points : vérifiez vos prix d’achat avant qu’elle ne s’installe.`,
          ht: `Maj ou pèdi ${(marginThen - marginNow).toFixed(1)} pwen : tcheke pri acha ou anvan sa vin abitid.`,
        }),
        action: { label: t({ fr: 'Analyser', ht: 'Analize' }), href: '/rentabilite' },
      };
    }

    return {
      headline,
      recommend: leader
        ? t({
            fr: `${leader.name} porte votre chiffre d’affaires : gardez-en toujours en stock.`,
            ht: `${leader.name} se li ki pote chif afè ou : toujou kenbe l an stòk.`,
          })
        : t({
            fr: 'Enregistrez vos ventes chaque jour : c’est ce qui rend la tendance lisible.',
            ht: 'Anrejistre vant ou chak jou : se sa ki fè tandans lan klè.',
          }),
      action: { label: t({ fr: 'Voir les produits', ht: 'Gade pwodwi yo' }), href: '/products' },
    };
  }

  // ── Elit : le raisonnement ───────────────────────────────────────────────
  // « Votre chiffre d'affaires augmente de 18 %, mais votre marge nette
  //   n'augmente que de 5 %. L'augmentation des dépenses opérationnelles
  //   explique principalement cet écart. » (§39)
  const profitDelta = baseline ? deltaOf(finance.netProfit, baseline.netProfit) : null;
  const expenseDelta = baseline ? deltaOf(finance.expenses, baseline.expenses) : null;

  if (revenueDelta !== null && profitDelta !== null && revenueDelta - profitDelta >= 5) {
    return {
      headline: t({
        fr: `Votre chiffre d’affaires augmente de ${pct(revenueDelta)}, mais votre profit net ne suit qu’à ${pct(profitDelta)}.`,
        ht: `Chif afè ou monte ${pct(revenueDelta)}, men pwofi nèt ou suiv sèlman ${pct(profitDelta)}.`,
      }),
      because: expenseDelta !== null && expenseDelta > 0
        ? t({
            fr: `Vos dépenses progressent de ${pct(expenseDelta)} sur la même période : c’est là que passe l’écart.`,
            ht: `Depans ou yo monte ${pct(expenseDelta)} sou menm peryòd la : se la diferans lan pase.`,
          })
        : t({
            fr: `Votre marge brute est passée à ${marginNow.toFixed(1)} % : le coût de vos marchandises absorbe la hausse.`,
            ht: `Maj brit ou rive nan ${marginNow.toFixed(1)} % : sa machandiz yo koute a manje monte a.`,
          }),
      recommend: t({
        fr: 'Analyser les dépenses opérationnelles du mois, poste par poste.',
        ht: 'Analize depans operasyonèl mwa a, pòs pa pòs.',
      }),
      action: { label: t({ fr: 'Analyser les dépenses', ht: 'Analize depans yo' }), href: '/expenses' },
    };
  }

  if (input.forecast) {
    return {
      headline: t({
        fr: `Au rythme des ${input.forecast.monthsObserved} derniers mois, le mois prochain se situerait autour de ${fmt(input.forecast.next)} ${currency}.`,
        ht: `Nan ritm ${input.forecast.monthsObserved} dènye mwa yo, mwa pwochen ta anviwon ${fmt(input.forecast.next)} ${currency}.`,
      }),
      because: t({
        fr: `Confiance de ${input.forecast.confidence} % — c’est une projection, pas une promesse.`,
        ht: `Konfyans ${input.forecast.confidence} % — se yon pwojeksyon, se pa yon pwomès.`,
      }),
      recommend: leader
        ? t({
            fr: `Sécuriser le stock de ${leader.name} protège la part la plus solide de ce chiffre.`,
            ht: `Sekirize stòk ${leader.name} pwoteje pati ki pi solid nan chif sa a.`,
          })
        : t({
            fr: 'Fixer un objectif mensuel rend cette projection actionnable.',
            ht: 'Mete yon objektif chak mwa fè pwojeksyon sa a vin itil.',
          }),
      action: { label: t({ fr: 'Voir les objectifs', ht: 'Gade objektif yo' }), href: '/rapports' },
    };
  }

  return {
    headline: t({
      fr: `${fmt(finance.revenue)} ${currency} de ventes, ${marginNow.toFixed(1)} % de marge, ${fmt(finance.netProfit)} ${currency} de profit net.`,
      ht: `${fmt(finance.revenue)} ${currency} vant, ${marginNow.toFixed(1)} % maj, ${fmt(finance.netProfit)} ${currency} pwofi nèt.`,
    }),
    because: t({
      fr: 'La structure de vos coûts est stable sur la période.',
      ht: 'Estrikti depans ou yo estab sou peryòd la.',
    }),
    recommend: t({
      fr: 'Fixer un objectif de marge donnerait un cap à la période suivante.',
      ht: 'Mete yon objektif maj ta bay yon direksyon pou pwochen peryòd la.',
    }),
    action: { label: t({ fr: 'Ouvrir PilotAI', ht: 'Louvri PilotAI' }), href: '/ai-assistant' },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// §40 — le résumé du jour
//
// « Le propriétaire doit pouvoir comprendre l'état du business en 15 secondes. »
// Cinq lignes au maximum, chacune d'un mot-clé et d'une valeur. Pas de phrase :
// une phrase se lit, une ligne se voit.
// ─────────────────────────────────────────────────────────────────────────────

export type BriefLine = {
  id: string;
  label: string;
  value: string;
  tone: 'neutral' | 'success' | 'warning' | 'danger';
};

export function buildDailyBrief(t: Translate, input: NarrativeInput): BriefLine[] {
  const lines: BriefLine[] = [];
  const { finance, baseline, alerts, inventory, healthScore } = input;

  if (finance && baseline) {
    const d = deltaOf(finance.revenue, baseline.revenue);
    if (d !== null) {
      lines.push({
        id: 'revenue',
        label: t({ fr: 'Ventes', ht: 'Vant' }),
        value: pct(d),
        tone: d >= 0 ? 'success' : 'warning',
      });
    }
  }

  if (finance) {
    lines.push({
      id: 'cash',
      label: t({ fr: 'Trésorerie', ht: 'Lajan kach' }),
      value: finance.cashFlow >= 0
        ? t({ fr: 'positive', ht: 'pozitif' })
        : t({ fr: 'sous tension', ht: 'sou presyon' }),
      tone: finance.cashFlow >= 0 ? 'success' : 'danger',
    });
  }

  const stockRisks = alerts.outOfStock + alerts.lowStock;
  if (inventory || stockRisks > 0) {
    lines.push({
      id: 'stock',
      label: t({ fr: 'Stock', ht: 'Stòk' }),
      value: stockRisks === 0
        ? t({ fr: 'aucun risque', ht: 'pa gen risk' })
        : t({ fr: `${stockRisks} à surveiller`, ht: `${stockRisks} pou siveye` }),
      tone: stockRisks === 0 ? 'success' : stockRisks > 3 ? 'danger' : 'warning',
    });
  }

  if (alerts.overdueInvoices > 0) {
    lines.push({
      id: 'receivables',
      label: t({ fr: 'Créances', ht: 'Kredi' }),
      value: t({
        fr: `${alerts.overdueInvoices} en retard`,
        ht: `${alerts.overdueInvoices} an reta`,
      }),
      tone: 'danger',
    });
  }

  if (healthScore != null) {
    lines.push({
      id: 'health',
      label: t({ fr: 'Santé', ht: 'Sante' }),
      value: `${healthScore}/100`,
      tone: healthScore >= 70 ? 'success' : healthScore >= 40 ? 'warning' : 'danger',
    });
  }

  return lines.slice(0, 5);
}
