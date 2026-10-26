'use client';

// ─────────────────────────────────────────────────────────────────────────────
// VANN / SÈVIS — une vente en trois secondes (étude de marché inversée, F01)
//
// « Un tap sur un favori, ou un montant, ou une phrase vocale » (§11.2). Deux
// façons de noter, et le marchand choisit d'un tap :
//
//   · « Pwodwi » — ses favoris d'abord (les 30 qu'il a choisis à
//     l'installation), puis le reste du catalogue. Le prix, la marge et le
//     stock sont déduits ;
//   · « Montan sèlman » — juste ce que le client a payé, dans l'unité où il
//     le pense : goud, dola ayisyen ou dollar (F07). « Le produit, le client ou
//     la catégorie sont facultatifs » (§11.1, règle 2).
//
// La vente à crédit (le bouton KREDI de l'accueil) est la même feuille, client
// obligatoire, avec l'avance éventuelle : « avance et solde simples sur une
// vente » est le service de base promis à Esansyel (§13.1).
//
// Hors ligne, la vente part en file et se rejoue au retour du réseau, avec sa
// clé d'idempotence : jamais comptée deux fois.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Minus, Plus, Search, Star } from 'lucide-react';
import { toast } from 'sonner';
import { createSaleAction, getTodaySalesTotal } from '../../app/actions/sales';
import { ensureQuickAmountProductAction, getProductsAction, type Product } from '../../app/actions/products';
import { recordReceivablePayment } from '../../app/actions/receivables';
import { useCompany } from '../../hooks/useCompany';
import { useLanguage } from '../LanguageWrapper';
import { computeMargin } from '../../lib/margin';
import { newClientRef, queueSale } from '../../lib/offlineQueue';
import { unconvertedNotice } from '../../lib/currency';
import { flagAttention } from '../../lib/pendingAttention';
import { saleWord } from '../../lib/kaye';
import { cn } from '../../lib/utils';
import { notifyEntrySaved, type SalePreset } from '../../lib/quickSheets';
import {
  Button, FirstRun, Money, NoResult, PaymentPicker, closestMatch, formatAmount,
  type PaymentKey,
} from '../ds';
import { unwrap } from '../../lib/actionResult';
import { AmountInput, toHtg, type AmountUnit } from './AmountInput';
import { VoiceButton } from '../voice/VoiceButton';

// La carte reste dans la feuille complète (NewSaleForm) : au comptoir, le
// marchand encaisse en espèces, MonCash ou NatCash, ou fait crédit (§4).
type QuickPay = 'cash' | 'moncash' | 'natcash' | 'credit';

const PAY_TO_DB: Record<QuickPay, 'Cash' | 'MonCash' | 'Natcash'> = {
  cash: 'Cash', moncash: 'MonCash', natcash: 'Natcash',
  // Une vente à crédit n'est encaissée par aucun moyen : `payment_status`
  // dit « crédit », et l'avance éventuelle est un versement en espèces.
  credit: 'Cash',
};

/** Les favoris montrés d'emblée — « 30 produits favoris » (§13.1). */
const FAVORITES_SHOWN = 30;

/** La fiche « Vant » se garde sur le téléphone : la vente au montant doit marcher hors ligne. */
const quickProductKey = (businessId: string) => `pp_quick_amount_product:${businessId}`;

type Mode = 'product' | 'amount';

export function QuickSaleForm({ preset, onSaved }: { preset?: SalePreset; onSaved?: () => void }) {
  const { company, role } = useCompany();
  const { t } = useLanguage();
  const trade = company?.kaye?.trade ?? null;

  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading]   = useState(true);
  const [mode, setMode]         = useState<Mode>(preset?.amountOnly || preset?.credit || preset?.amount ? 'amount' : 'product');
  const [search, setSearch]     = useState('');
  const [selected, setSelected] = useState<Product | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [amount, setAmount]     = useState(preset?.amount ? String(preset.amount) : '');
  const [unit, setUnit]         = useState<AmountUnit>('HTG');
  const [note, setNote]         = useState(preset?.note ?? '');
  const [customerName, setCustomerName] = useState(preset?.customerName ?? '');
  const [advance, setAdvance]   = useState('');
  const [pay, setPay]           = useState<QuickPay>(preset?.credit ? 'credit' : 'cash');
  const [submitting, setSubmitting] = useState(false);
  const [confirmed, setConfirmed]   = useState(false);
  const [quickProductId, setQuickProductId] = useState<string | null>(null);

  // Le total du jour, cible du montant qui « vole » (§7, moment 1).
  const [todayTotal, setTodayTotal]     = useState<number | null>(null);
  const [todayCurrency, setTodayCurrency]       = useState<string | null>(null);
  const [todayUnconverted, setTodayUnconverted] = useState(0);
  const [flying, setFlying]             = useState<{ amount: number; currency: string } | null>(null);

  const exchangeRate = company?.exchangeRateSet ? company.exchangeRate : null;
  const currency     = company?.defaultCurrency ?? 'HTG';
  const totalCurrency = todayCurrency ?? currency;
  const isCredit = pay === 'credit';
  // Un aide note la vente ; le prix d'achat et la marge sont au patron (F16).
  const seesMargin = role === 'owner' || role === 'admin' || role === 'manager';

  const payMethods = [
    { key: 'cash' as const,    label: t({ fr: 'Espèces', ht: 'Kach' }),  hint: t({ fr: 'Dans la caisse', ht: 'Nan kès la' }), icon: 'cash' as const },
    { key: 'moncash' as const, label: 'MonCash', hint: 'Digicel', icon: 'phone' as const },
    { key: 'natcash' as const, label: 'NatCash', hint: 'Natcom',  icon: 'phone' as const },
    { key: 'credit' as const,  label: t({ fr: 'Crédit', ht: 'Kredi' }), hint: t({ fr: 'Il paiera plus tard', ht: 'L ap peye pita' }), icon: 'clock' as const },
  ];

  function loadTodayTotal() {
    getTodaySalesTotal()
      .then((r) => {
        setTodayTotal(r.total);
        setTodayCurrency(r.currency);
        setTodayUnconverted(r.unconvertedCount ?? 0);
      })
      .catch(() => {});
  }

  useEffect(() => { loadTodayTotal(); }, []);

  useEffect(() => {
    getProductsAction()
      .then((r) => {
        if (!r.ok) { toast.error(r.message); return; }
        setProducts(r.data);
        // Sans catalogue, la vente au montant est la seule qui ait du sens.
        if (r.data.length === 0) setMode('amount');
      })
      .catch(() => { setMode('amount'); })
      .finally(() => setLoading(false));
  }, []);

  // La fiche système de la vente au montant : lue sur le téléphone d'abord
  // (hors ligne), confirmée au serveur ensuite.
  useEffect(() => {
    if (!company?.id) return;
    try {
      const cached = localStorage.getItem(quickProductKey(company.id));
      if (cached) setQuickProductId(cached);
    } catch { /* stockage indisponible */ }
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
    ensureQuickAmountProductAction()
      .then((r) => {
        if (!r.ok) return;
        setQuickProductId(r.data);
        try { localStorage.setItem(quickProductKey(company.id), r.data); } catch { /* sans plus */ }
      })
      .catch(() => {});
  }, [company?.id]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    const sorted = [...products].sort((a, b) => Number(b.favorite) - Number(a.favorite) || a.name.localeCompare(b.name));
    const list = q ? sorted.filter((p) => p.name.toLowerCase().includes(q)) : sorted;
    return list.slice(0, q ? 24 : FAVORITES_SHOWN);
  }, [products, search]);

  // ── La marge, vue AVANT de valider (mode produit, patron seulement) ──────
  const SALE_CURRENCY = 'HTG' as const;
  const costCurrency = (selected?.currency ?? 'HTG') as 'HTG' | 'USD';
  const hasCost      = Number(selected?.purchase_price ?? 0) > 0;
  const costNeedsRate = !!selected && hasCost && costCurrency !== SALE_CURRENCY && exchangeRate === null;
  const displayCurrency = exchangeRate === null ? SALE_CURRENCY : currency;
  const margin = useMemo(() => {
    if (!selected || costNeedsRate || !seesMargin) return null;
    const m = computeMargin({
      purchasePrice: selected.purchase_price,
      costCurrency:  hasCost ? costCurrency : SALE_CURRENCY,
      salePrice:     selected.sale_price,
      saleCurrency:  SALE_CURRENCY,
      quantity,
      exchangeRate:    exchangeRate ?? 1,
      displayCurrency,
    });
    return m.computable ? m : null;
  }, [selected, quantity, exchangeRate, costCurrency, hasCost, costNeedsRate, displayCurrency, seesMargin]);

  function reset() {
    setSelected(null);
    setQuantity(1);
    setAmount('');
    setNote('');
    setCustomerName('');
    setAdvance('');
    setSearch('');
    setPay('cash');
  }

  /** La vente à envoyer, ou un message qui dit ce qui manque. */
  function buildPayload(): { payload: any; total: number; soldIn: 'HTG' | 'USD' } | { error: string } {
    if (!company?.id) return { error: t({ fr: 'Commerce introuvable.', ht: 'Nou pa jwenn biznis la.' }) };
    if (isCredit && !customerName.trim()) {
      return { error: t({ fr: 'Le nom du client est obligatoire pour un crédit.', ht: 'Non kliyan an obligatwa pou yon kredi.' }) };
    }

    const base = {
      business_id:      company.id,
      payment_method:   PAY_TO_DB[pay],
      payment_status:   (isCredit ? 'credit' : 'paid') as 'credit' | 'paid',
      discount_percent: 0,
      tax_amount:       0,
      customer_name:    customerName.trim() || undefined,
      client_ref:       newClientRef(),
    };

    if (mode === 'product') {
      if (!selected) return { error: t({ fr: 'Choisissez ce que vous vendez.', ht: 'Chwazi sa w ap vann.' }) };
      return {
        total: selected.sale_price * quantity,
        soldIn: 'HTG',
        payload: {
          ...base,
          currency: SALE_CURRENCY,
          items: [{
            product_id: selected.id, product_name: selected.name, quantity,
            unit_price: selected.sale_price, discount_percent: 0, tax_rate: 0,
          }],
        },
      };
    }

    const typed = Number(amount.replace(',', '.'));
    if (!(typed > 0)) return { error: t({ fr: 'Tapez le montant.', ht: 'Tape montan an.' }) };
    if (!quickProductId) {
      return { error: t({ fr: 'Connectez-vous une première fois au réseau pour activer la vente au montant.', ht: 'Konekte sou rezo a yon premye fwa pou aktive vant pa montan.' }) };
    }
    const soldIn = unit === 'USD' ? 'USD' as const : 'HTG' as const;
    const price = soldIn === 'USD' ? typed : toHtg(typed, unit);
    return {
      total: price,
      soldIn,
      payload: {
        ...base,
        currency: soldIn,
        notes: note.trim() || undefined,
        items: [{
          product_id: quickProductId,
          // Le nom de la ligne est ce que le marchand a dit, s'il l'a dit.
          product_name: note.trim() || t(saleWord(trade)).toLowerCase(),
          quantity: 1, unit_price: price, discount_percent: 0, tax_rate: 0,
        }],
      },
    };
  }

  async function submit() {
    const built = buildPayload();
    if ('error' in built) { toast.error(built.error); return; }
    const { payload, soldIn } = built;
    const advanceValue = isCredit ? Number(advance.replace(',', '.')) : 0;
    if (isCredit && advanceValue > built.total) {
      toast.error(t({ fr: 'L’avance dépasse le prix.', ht: 'Avans lan pi gwo pase pri a.' }));
      return;
    }

    setSubmitting(true);

    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      await queueSale(payload.client_ref, payload);
      window.dispatchEvent(new Event('pp:sale-queued'));
      if (isCredit) flagAttention('receivables');
      toast.success(t({
        fr: 'Vente gardée sur ce téléphone. Elle partira au retour du réseau.',
        ht: 'Vant lan rete nan telefòn nan. L ap pati lè rezo a tounen.',
      }));
      if (advanceValue > 0) {
        toast.message(t({ fr: 'Notez l’avance au retour du réseau, dans « Kredi ».', ht: 'Note avans lan lè rezo a tounen, nan « Kredi ».' }));
      }
      reset();
      setSubmitting(false);
      return;
    }

    try {
      const result = unwrap(await createSaleAction(payload));
      if (!result.success) {
        toast.error(result.errors[0]?.message ?? t({ fr: 'Enregistrement impossible.', ht: 'Nou pa ka anrejistre l.' }));
        return;
      }

      // L'avance d'un crédit : un versement immédiat sur la vente qui vient de
      // naître. Le solde reste dans le cahier de crédit.
      if (advanceValue > 0 && result.saleId) {
        const paid = await recordReceivablePayment(result.saleId, advanceValue, 'Cash').catch(() => null);
        if (!paid?.settled) {
          toast.message(t({
            fr: 'Crédit noté, mais l’avance n’a pas pu être enregistrée : ajoutez-la dans « Kredi ».',
            ht: 'Kredi a note, men avans lan pa t pase : ajoute l nan « Kredi ».',
          }));
        }
      }

      toast.success(
        isCredit
          ? t({ fr: `Crédit noté — ${formatAmount(result.totalAmount, soldIn)}`, ht: `Kredi a note — ${formatAmount(result.totalAmount, soldIn)}` })
          : t({ fr: `Vente notée — ${formatAmount(result.totalAmount, soldIn)}`, ht: `Vant lan note — ${formatAmount(result.totalAmount, soldIn)}` }),
        { description: margin ? t({ fr: `Marge : ${formatAmount(margin.netMargin, margin.currency)}`, ht: `Maj : ${formatAmount(margin.netMargin, margin.currency)}` }) : undefined },
      );

      if (selected && selected.track_inventory) {
        setProducts((prev) => prev.map((p) =>
          p.id === selected.id ? { ...p, stock_quantity: Math.max(p.stock_quantity - quantity, 0) } : p));
      }
      if (isCredit) flagAttention('receivables');
      notifyEntrySaved();
      setConfirmed(true);
      setFlying({ amount: result.totalAmount, currency: soldIn });
      setTimeout(() => {
        setFlying(null);
        if (soldIn === totalCurrency) setTodayTotal((prev) => (prev ?? 0) + result.totalAmount);
        else loadTodayTotal();
      }, 680);
      setTimeout(() => { setConfirmed(false); reset(); onSaved?.(); }, 680);
    } catch {
      await queueSale(payload.client_ref, payload);
      window.dispatchEvent(new Event('pp:sale-queued'));
      if (isCredit) flagAttention('receivables');
      toast.success(t({
        fr: 'Réseau coupé. La vente est gardée sur ce téléphone et partira toute seule.',
        ht: 'Rezo a koupe. Vant lan rete nan telefòn nan, l ap pati poukont li.',
      }));
      reset();
      onSaved?.();
    } finally {
      setSubmitting(false);
    }
  }

  const word = t(saleWord(trade));
  const itemNoun = trade === 'service'
    ? t({ fr: 'Service', ht: 'Sèvis' })
    : t({ fr: 'Produit', ht: 'Pwodwi' });
  const ready = mode === 'product' ? Boolean(selected) : Number(amount.replace(',', '.')) > 0;

  return (
    <div className="space-y-6">
      {/* Le total du jour — une ligne, la cible du vol. Un aide ne voit que ses
          propres saisies ailleurs ; le total du commerce, lui, reste au patron. */}
      {todayTotal !== null && seesMargin && (
        <>
          <div className="relative flex min-h-touch items-center justify-between gap-4 border-b border-border pb-2 dark:border-dark-border">
            <span className="text-note font-bold uppercase tracking-wide text-muted dark:text-dark-muted">
              {t({ fr: 'Ventes du jour', ht: 'Vant jodi a' })}
            </span>
            <Money key={todayTotal} value={todayTotal} currency={totalCurrency} size="card" />
            {flying !== null && (
              <span
                className="pp-fly amount pointer-events-none absolute right-0 top-full text-card font-bold text-accent"
                style={{ ['--fly-y' as string]: '-2rem' }}
                aria-hidden
              >
                +{formatAmount(flying.amount, flying.currency)}
              </span>
            )}
          </div>
          {todayUnconverted > 0 && (
            <p role="status" className="text-note text-amber-700 dark:text-amber-400">
              {t(unconvertedNotice(todayUnconverted, totalCurrency))}
              {' · '}
              <Link href="/settings" className="font-bold underline underline-offset-4">{t({ fr: 'Renseigner le taux', ht: 'Mete to a' })}</Link>
            </p>
          )}
        </>
      )}

      {/* Deux façons de noter : un tap sur un favori, ou juste le montant. */}
      <div className="grid grid-cols-2 gap-2" role="tablist" aria-label={t({ fr: 'Façon de noter', ht: 'Fason pou note' })}>
        {([
          { key: 'product' as const, label: trade === 'service' ? t({ fr: 'Mes services', ht: 'Sèvis mwen yo' }) : t({ fr: 'Mes produits', ht: 'Pwodwi mwen yo' }) },
          { key: 'amount' as const,  label: t({ fr: 'Juste le montant', ht: 'Montan sèlman' }) },
        ]).map((m) => (
          <button
            key={m.key}
            type="button"
            role="tab"
            aria-selected={mode === m.key}
            onClick={() => { setMode(m.key); setSelected(null); }}
            className={cn(
              'pressable min-h-touch rounded-control px-3 text-body font-bold transition-colors duration-press',
              mode === m.key ? 'bg-primary text-white' : 'bg-surface2 text-primary hover:bg-border dark:bg-dark-surface2 dark:text-dark-text',
            )}
          >
            {m.label}
          </button>
        ))}
      </div>

      {/* ── Mode produit : la grille des favoris ── */}
      {mode === 'product' && !selected && (
        <div className="space-y-4">
          <div className="flex items-stretch gap-2">
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted" aria-hidden />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t({ fr: 'Chercher…', ht: 'Chèche…' })}
                aria-label={t({ fr: `Chercher un ${itemNoun.toLowerCase()}`, ht: `Chèche yon ${itemNoun.toLowerCase()}` })}
                className="min-h-hero w-full rounded-surface border border-border bg-surface pl-12 pr-4 text-body text-primary outline-none placeholder:text-muted focus:border-accent dark:border-dark-border dark:bg-dark-surface2 dark:text-dark-text"
              />
            </div>
            <VoiceButton
              kind="sale"
              onResult={(r) => {
                const match = r.item
                  ? products.find((p) => p.name.toLowerCase().includes(r.item!.toLowerCase()))
                  : undefined;
                if (match) {
                  setSelected(match);
                  setQuantity(r.quantity ?? 1);
                } else {
                  setMode('amount');
                  if (r.amount) setAmount(String(r.amount));
                  if (r.unit) setUnit(r.unit);
                  if (r.note) setNote(r.note);
                }
                if (r.kind === 'credit') setPay('credit');
                if (r.customer) setCustomerName(r.customer);
              }}
            />
          </div>

          {loading ? (
            <div className="grid grid-cols-2 gap-2">
              {[0, 1, 2, 3].map((i) => <span key={i} className="pp-skeleton block h-20 rounded-surface" />)}
            </div>
          ) : visible.length === 0 ? (
            search.trim() ? (
              <NoResult
                query={search.trim()}
                noun={itemNoun.toLowerCase()}
                suggestion={closestMatch(search, products.map((p) => p.name))}
                onUseSuggestion={setSearch}
                onClear={() => setSearch('')}
              />
            ) : (
              <FirstRun
                title={t({ fr: 'Aucun favori pour l’instant', ht: 'Pa gen favori ankò' })}
                hint={t({
                  fr: 'Choisissez vos 10 ventes les plus fréquentes : elles apparaîtront ici. En attendant, notez juste le montant.',
                  ht: 'Chwazi 10 sa w vann pi souvan yo : y ap parèt isit la. Pandan sa, note montan an sèlman.',
                })}
                action={
                  <Link href="/demarrage">
                    <Button variant="accent" size="lg" block>{t({ fr: 'Choisir mes favoris', ht: 'Chwazi favori mwen yo' })}</Button>
                  </Link>
                }
              />
            )
          ) : (
            <div className="grid grid-cols-2 gap-2">
              {visible.map((p) => {
                const out = p.track_inventory && p.stock_quantity <= 0;
                return (
                  <button
                    key={p.id}
                    type="button"
                    disabled={out}
                    onClick={() => { setSelected(p); setQuantity(1); }}
                    className={cn(
                      'pressable flex min-h-13 flex-col justify-center rounded-surface border border-border p-3 text-left',
                      out ? 'cursor-not-allowed opacity-45' : 'bg-white hover:border-accent dark:bg-dark-surface',
                    )}
                  >
                    <span className="flex items-center gap-1 truncate text-body font-bold text-primary dark:text-dark-text">
                      {p.favorite && <Star className="h-4 w-4 flex-shrink-0 text-accent" aria-label={t({ fr: 'Favori', ht: 'Favori' })} />}
                      <span className="truncate">{p.name}</span>
                    </span>
                    <Money value={p.sale_price} currency={SALE_CURRENCY} size="body" className="mt-1 block font-bold" />
                    {p.track_inventory && (
                      <span className="mt-1 text-note text-muted dark:text-dark-muted">
                        {out
                          ? t({ fr: 'Rupture de stock', ht: 'Fini nan stòk' })
                          : p.stock_quantity <= (p.reorder_point || 5)
                            ? t({ fr: `Presque fini · ${p.stock_quantity}`, ht: `Prèske fini · ${p.stock_quantity}` })
                            : t({ fr: `${p.stock_quantity} en stock`, ht: `${p.stock_quantity} nan stòk` })}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── Mode produit : quantité ── */}
      {mode === 'product' && selected && (
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-4">
            <span className="min-w-0">
              <span className="block truncate text-card font-bold text-primary dark:text-dark-text">{selected.name}</span>
              <span className="block text-note text-muted dark:text-dark-muted">
                {formatAmount(selected.sale_price, SALE_CURRENCY)} {t({ fr: 'l’unité', ht: 'chak' })}
              </span>
            </span>
            <button
              type="button"
              onClick={() => setSelected(null)}
              className="pressable min-h-touch flex-shrink-0 text-body text-muted underline underline-offset-4 dark:text-dark-muted"
            >
              {t({ fr: 'Changer', ht: 'Chanje' })}
            </button>
          </div>
          <div className="flex items-center justify-center gap-6">
            <button
              type="button"
              onClick={() => setQuantity((q) => Math.max(1, q - 1))}
              aria-label={t({ fr: 'Retirer une unité', ht: 'Retire youn' })}
              className="pressable flex h-13 w-13 items-center justify-center rounded-surface border border-border text-primary dark:border-dark-border dark:text-dark-text"
            >
              <Minus className="h-5 w-5" strokeWidth={2} aria-hidden />
            </button>
            <span className="amount w-16 text-center text-amount-lg font-bold text-primary dark:text-dark-text">{quantity}</span>
            <button
              type="button"
              onClick={() => setQuantity((q) => Math.min(q + 1, selected.track_inventory ? Math.max(selected.stock_quantity, 1) : 999))}
              aria-label={t({ fr: 'Ajouter une unité', ht: 'Ajoute youn' })}
              className="pressable flex h-13 w-13 items-center justify-center rounded-surface border border-border text-primary dark:border-dark-border dark:text-dark-text"
            >
              <Plus className="h-5 w-5" strokeWidth={2} aria-hidden />
            </button>
          </div>
          <div className="flex items-center justify-between rounded-surface bg-surface px-4 py-3 dark:bg-dark-surface2">
            <span className="text-note font-bold uppercase tracking-wide text-muted dark:text-dark-muted">{t({ fr: 'Total', ht: 'Total' })}</span>
            <span className="flex items-baseline gap-3">
              <Money value={selected.sale_price * quantity} currency={SALE_CURRENCY} size="card" />
              {margin && (
                <span className="text-note text-muted dark:text-dark-muted">
                  {t({ fr: 'marge', ht: 'maj' })}{' '}
                  <Money value={margin.netMargin} currency={margin.currency} size="note" tone={margin.isLoss ? 'down' : 'default'} className="font-bold" />
                </span>
              )}
            </span>
          </div>
          {costNeedsRate && seesMargin && (
            <p role="status" className="text-note text-amber-700 dark:text-amber-400">
              {t({
                fr: `Prix d’achat en ${costCurrency} : renseignez le taux du jour pour calculer la marge et enregistrer cette vente.`,
                ht: `Pri acha a an ${costCurrency} : mete to jounen an pou kalkile maj la epi anrejistre vant sa a.`,
              })}{' '}
              <Link href="/settings" className="font-bold underline underline-offset-4">{t({ fr: 'Renseigner le taux', ht: 'Mete to a' })}</Link>
            </p>
          )}
        </div>
      )}

      {/* ── Mode montant ── */}
      {mode === 'amount' && (
        <div className="space-y-4">
          <div className="flex items-end gap-2">
            <div className="min-w-0 flex-1">
              <AmountInput
                value={amount}
                onChange={setAmount}
                unit={unit}
                onUnitChange={setUnit}
                autoFocus
                label={isCredit ? t({ fr: 'Montant du crédit', ht: 'Montan kredi a' }) : t({ fr: 'Montant reçu', ht: 'Montan ou touche' })}
              />
            </div>
            <VoiceButton
              kind="sale"
              onResult={(r) => {
                if (r.amount) setAmount(String(r.amount));
                if (r.unit) setUnit(r.unit);
                if (r.note) setNote(r.note);
                if (r.kind === 'credit') setPay('credit');
                if (r.customer) setCustomerName(r.customer);
              }}
            />
          </div>
          {unit === 'USD' && exchangeRate === null && (
            <p role="status" className="text-note text-amber-700 dark:text-amber-400">
              {t({ fr: 'Renseignez d’abord le taux du jour pour noter en dollars.', ht: 'Mete to jounen an anvan pou w note an dola.' })}{' '}
              <Link href="/settings" className="font-bold underline underline-offset-4">{t({ fr: 'Taux du jour', ht: 'To jounen an' })}</Link>
            </p>
          )}
          <div className="space-y-2">
            <label htmlFor="pp-sale-note" className="block text-note font-bold uppercase tracking-wide text-muted dark:text-dark-muted">
              {t({ fr: 'Quoi ? (facultatif)', ht: 'Kisa ? (si w vle)' })}
            </label>
            <input
              id="pp-sale-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={trade === 'service' ? t({ fr: 'Ex. : coupe + barbe', ht: 'Egz. : kout cheve + bab' }) : t({ fr: 'Ex. : 2 kola', ht: 'Egz. : 2 kola' })}
              className="min-h-13 w-full rounded-surface border border-border bg-surface px-4 text-body text-primary outline-none placeholder:text-muted focus:border-accent dark:border-dark-border dark:bg-dark-surface2 dark:text-dark-text"
            />
          </div>
        </div>
      )}

      {/* ── Paiement, client, avance ── */}
      {ready && (
        <>
          <div className="space-y-2">
            <span className="block text-note font-bold uppercase tracking-wide text-muted dark:text-dark-muted">
              {t({ fr: 'Paiement', ht: 'Peman' })}
            </span>
            <PaymentPicker value={pay as PaymentKey} onChange={(k) => setPay(k as QuickPay)} methods={payMethods} />
          </div>

          <div className="space-y-2">
            <label htmlFor="pp-customer" className="block text-note font-bold uppercase tracking-wide text-muted dark:text-dark-muted">
              {isCredit ? t({ fr: 'Client (obligatoire)', ht: 'Kliyan (obligatwa)' }) : t({ fr: 'Client (facultatif)', ht: 'Kliyan (si w vle)' })}
            </label>
            <input
              id="pp-customer"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              placeholder={t({ fr: 'Nom du client', ht: 'Non kliyan an' })}
              className="min-h-13 w-full rounded-surface border border-border bg-surface px-4 text-body text-primary outline-none placeholder:text-muted focus:border-accent dark:border-dark-border dark:bg-dark-surface2 dark:text-dark-text"
            />
          </div>

          {isCredit && (
            <div className="space-y-2">
              <label htmlFor="pp-advance" className="block text-note font-bold uppercase tracking-wide text-muted dark:text-dark-muted">
                {t({ fr: 'Avance reçue maintenant (facultatif)', ht: 'Avans li bay kounye a (si genyen)' })}
              </label>
              <input
                id="pp-advance"
                inputMode="decimal"
                value={advance}
                onChange={(e) => setAdvance(e.target.value.replace(/[^0-9.,]/g, ''))}
                placeholder="0"
                className="amount min-h-13 w-full rounded-surface border border-border bg-surface px-4 text-body text-primary outline-none placeholder:text-muted focus:border-accent dark:border-dark-border dark:bg-dark-surface2 dark:text-dark-text"
              />
              <p className="text-note text-muted dark:text-dark-muted">
                {t({ fr: 'L’avance n’est pas du profit : le solde reste dans le cahier de crédit.', ht: 'Avans la pa pwofi. Balans lan rete nan kaye kredi a.' })}
              </p>
            </div>
          )}

          <Button
            variant="accent"
            size="lg"
            block
            loading={submitting}
            confirmed={confirmed}
            loadingLabel={t({ fr: 'Enregistrement…', ht: 'N ap anrejistre…' })}
            onClick={submit}
          >
            {confirmed
              ? t({ fr: 'Noté', ht: 'Li note' })
              : isCredit
                ? t({ fr: 'Noter le crédit', ht: 'Note kredi a' })
                : t({ fr: `Noter : ${word}`, ht: `Note : ${word}` })}
          </Button>
        </>
      )}
    </div>
  );
}
