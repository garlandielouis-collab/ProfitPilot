'use client';

// ─────────────────────────────────────────────────────────────────────────────
// Vente en 10 secondes — Diagnostic 2 (la comptabilité invisible)
//
// Trois gestes, pas plus : je tape le produit, je confirme la quantité, je tape
// le mode de paiement. Tout le reste (prix, marge, stock, écritures) est déduit.
// Le panier complet reste disponible via <NewSaleForm /> pour les cas riches.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Minus, Plus, Search } from 'lucide-react';
import { toast } from 'sonner';
import { createSaleAction, getTodaySalesTotal } from '../../app/actions/sales';
import { getProductsAction, type Product } from '../../app/actions/products';
import { useCompany } from '../../hooks/useCompany';
import { computeMargin } from '../../lib/margin';
import { newClientRef, queueSale } from '../../lib/offlineQueue';
import { unconvertedNotice } from '../../lib/currency';
import { flagAttention } from '../../lib/pendingAttention';
import { cn } from '../../lib/utils';
import {
  Button, FirstRun, Money, NoResult, PaymentPicker, closestMatch, formatAmount,
  type PaymentKey,
} from '../ds';

type PaymentMode = 'Espèces' | 'MonCash' | 'Natcash' | 'Carte' | 'Crédit';

const MODE_TO_DB: Record<PaymentMode, 'Cash' | 'MonCash' | 'Natcash' | 'Card'> = {
  'Espèces': 'Cash',
  'MonCash': 'MonCash',
  'Natcash': 'Natcash',
  'Carte':   'Card',
  'Crédit':  'Cash',
};

// Le composant de paiement est unique et partage (3.4) : ces deux tables font
// le pont entre sa cle et le vocabulaire metier deja utilise ici.
const PAY_KEY: Record<PaymentMode, PaymentKey> = {
  'Espèces': 'cash', 'MonCash': 'moncash', 'Natcash': 'natcash',
  'Carte': 'card', 'Crédit': 'credit',
};
const KEY_PAY: Record<PaymentKey, PaymentMode> = {
  cash: 'Espèces', moncash: 'MonCash', natcash: 'Natcash',
  card: 'Carte', credit: 'Crédit',
};


const fmt = (n: number, currency: string): string =>
  `${new Intl.NumberFormat('fr-HT', { maximumFractionDigits: 0 }).format(n)} ${currency}`;

/**
 * Devise du PRIX DE VENTE d'un produit (`sale_price`) : HTG, comme sur la fiche
 * produit. `products.currency` est celle du prix d'ACHAT : elle ne dit rien de
 * la devise dans laquelle le client paie. La vente est donc toujours en HTG.
 */
const SALE_CURRENCY = 'HTG' as const;

export function QuickSaleForm({ onSaved }: { onSaved?: () => void }) {
  const { company } = useCompany();

  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading]   = useState(true);
  const [search, setSearch]     = useState('');
  const [selected, setSelected] = useState<Product | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [customerName, setCustomerName] = useState('');
  const [submitting, setSubmitting]     = useState(false);
  // Le paiement se choisit avant de valider : un seul appel a l'action,
  // au lieu de cinq boutons colores qui validaient chacun (3.4).
  const [mode, setMode]                 = useState<PaymentMode>('Espèces');
  // La confirmation dure le temps du moment chorégraphié (7, moment 1),
  // puis le bouton redevient disponible pour le client suivant.
  const [confirmed, setConfirmed]       = useState(false);
  // ── Moment 1 : la vente enregistrée (§7) ────────────────────────────────
  // « Le bouton se contracte, coche animée, le montant vole vers le total du
  //   jour qui s'incrémente en comptant. » Le total est celui du serveur : on
  //   n'anime pas un chiffre inventé, on anime le chiffre réel qui vient de
  //   changer. C'est la règle du budget d'animation : animer le changement
  //   d'état, jamais la décoration.
  const [todayTotal, setTodayTotal]     = useState<number | null>(null);
  // Devise du total du jour telle que le serveur l'a calculé (celle de
  // l'entreprise), et ventes de l'autre devise laissées hors du total faute de
  // taux saisi.
  const [todayCurrency, setTodayCurrency]       = useState<string | null>(null);
  const [todayUnconverted, setTodayUnconverted] = useState(0);
  // Le montant qui vole garde SA devise : celle de la vente, pas celle du total.
  const [flying, setFlying]             = useState<{ amount: number; currency: string } | null>(null);

  // Seulement un taux SAISI : `null` sinon (1 est le défaut de la colonne).
  const exchangeRate = company?.exchangeRateSet ? company.exchangeRate : null;
  const currency     = company?.defaultCurrency ?? 'HTG';
  const totalCurrency = todayCurrency ?? currency;

  function loadTodayTotal() {
    getTodaySalesTotal()
      .then((r) => {
        setTodayTotal(r.total);
        setTodayCurrency(r.currency);
        setTodayUnconverted(r.unconvertedCount ?? 0);
      })
      .catch(() => {});
  }

  useEffect(() => {
    // Silencieux en cas d'échec : sans total, la ligne ne s'affiche pas — elle
    // ne montre jamais un zéro qui pourrait passer pour « rien vendu ».
    loadTodayTotal();
  }, []);

  useEffect(() => {
    getProductsAction()
      .then(setProducts)
      .catch(() => toast.error('Impossible de charger les produits.'))
      .finally(() => setLoading(false));
  }, []);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = q
      ? products.filter((p) => p.name.toLowerCase().includes(q))
      : products;
    return list.slice(0, 12);
  }, [products, search]);

  // Marge de la vente en cours — le marchand voit ce qu'il gagne AVANT de valider.
  //
  // La vente est en HTG (SALE_CURRENCY) ; le coût d'achat est dans la devise
  // du produit (`costCurrency`), à ne pas confondre avec elle.
  const costCurrency = (selected?.currency ?? 'HTG') as 'HTG' | 'USD';
  const hasCost      = Number(selected?.purchase_price ?? 0) > 0;
  // Coût d'achat dans l'autre devise sans taux saisi : le serveur refuse la
  // vente (il ne convertit le coût qu'au taux saisi) et la marge n'est pas
  // calculée. Même condition que createSaleAction (coût nul : rien à convertir).
  const costNeedsRate = !!selected && hasCost && costCurrency !== SALE_CURRENCY && exchangeRate === null;
  // Sans taux saisi, rien n'est converti vers la devise de l'entreprise : les
  // montants se lisent en HTG, jamais convertis à 1 ou à 130.
  const displayCurrency = exchangeRate === null ? SALE_CURRENCY : currency;
  const noConversion    = displayCurrency !== currency;
  const margin = useMemo(() => {
    if (!selected || costNeedsRate) return null;
    const m = computeMargin({
      purchasePrice: selected.purchase_price,
      // Un coût nul vaut zéro dans les deux devises : aucun taux nécessaire.
      costCurrency:  hasCost ? costCurrency : SALE_CURRENCY,
      salePrice:     selected.sale_price,
      saleCurrency:  SALE_CURRENCY,
      quantity,
      // Taux manquant ⇒ tout est déjà en HTG, et computeMargin ne lit pas le
      // taux quand aucune conversion n'est nécessaire.
      exchangeRate:    exchangeRate ?? 1,
      displayCurrency,
    });
    return m.computable ? m : null;
  }, [selected, quantity, exchangeRate, costCurrency, hasCost, costNeedsRate, displayCurrency]);

  function reset() {
    setSelected(null);
    setQuantity(1);
    setCustomerName('');
    setSearch('');
    setMode('Espèces');
  }

  async function submit(paymentMode: PaymentMode) {
    const mode = paymentMode;
    if (!selected || !company?.id) return;
    const isCredit = mode === 'Crédit';

    if (isCredit && !customerName.trim()) {
      toast.error('Nom du client requis pour une vente à crédit.');
      return;
    }

    setSubmitting(true);

    // Clé d'idempotence générée AVANT l'appel : c'est elle qui permet de
    // rejouer la vente hors-ligne sans jamais la compter deux fois.
    const clientRef = newClientRef();
    const payload = {
      business_id:      company.id,
      // La devise du montant envoyé (`sale_price`, HTG), jamais celle du prix
      // d'achat : le serveur convertit lui-même le coût depuis products.currency.
      currency:         SALE_CURRENCY,
      payment_method:   MODE_TO_DB[mode],
      payment_status:   (isCredit ? 'credit' : 'paid') as 'credit' | 'paid',
      discount_percent: 0,
      tax_amount:       0,
      customer_name:    customerName.trim() || undefined,
      client_ref:       clientRef,
      items: [
        {
          product_id:       selected.id,
          product_name:     selected.name,
          quantity,
          unit_price:       selected.sale_price,
          discount_percent: 0,
          tax_rate:         0,
        },
      ],
    };

    // Hors-ligne : on met en file tout de suite plutôt que de faire échouer la
    // vente. Le marchand a encaissé, la saisie ne doit pas être perdue.
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      await queueSale(clientRef, payload);
      window.dispatchEvent(new Event('pp:sale-queued'));
      // La créance naîtra au rejeu : l'onglet doit le signaler dès maintenant.
      if (isCredit) flagAttention('receivables');
      toast.success('Vente enregistrée sur ce téléphone. Elle partira dès le retour du réseau.');
      reset();
      setSubmitting(false);
      return;
    }

    try {
      const result = await createSaleAction(payload);

      if (!result.success) {
        toast.error(result.errors[0]?.message ?? 'Enregistrement impossible.');
        return;
      }

      toast.success(
        `Vente enregistrée — ${fmt(result.totalAmount, SALE_CURRENCY)}`,
        { description: margin ? `Marge : ${fmt(margin.netMargin, margin.currency)}` : undefined },
      );

      // Décrémente le stock localement pour un retour immédiat.
      setProducts((prev) =>
        prev.map((p) =>
          p.id === selected.id
            ? { ...p, stock_quantity: Math.max(p.stock_quantity - quantity, 0) }
            : p,
        ),
      );
      // La confirmation dure le temps du moment (7, moment 1) : la coche se
      // dessine, le montant vole vers le total du jour, le total s'incrémente,
      // puis le formulaire se libère pour le client suivant — sans bloquer la
      // saisie : le marchand peut enchaîner trois clients.
      // L'effet se produit AILLEURS : une vente à crédit crée une créance sur
      // un écran que le marchand ne regarde pas. La pastille l'y attend (§3.7).
      if (isCredit) flagAttention('receivables');
      setConfirmed(true);
      const soldIn = SALE_CURRENCY;
      setFlying({ amount: result.totalAmount, currency: soldIn });
      setTimeout(() => {
        setFlying(null);
        // Même devise que le total : on l'incrémente sur place. Autre devise :
        // additionner les deux nombres serait faux, le serveur convertit (ou
        // compte la vente comme non convertie).
        if (soldIn === totalCurrency) {
          setTodayTotal((prev) => (prev ?? 0) + result.totalAmount);
        } else {
          loadTodayTotal();
        }
      }, 680);
      setTimeout(() => { setConfirmed(false); reset(); onSaved?.(); }, 680);
    } catch (err) {
      // Coupure réseau pendant l'appel : même traitement que le cas hors-ligne.
      // Le `client_ref` garantit qu'un rejeu ne créera pas de doublon même si
      // la requête était en fait passée côté serveur.
      await queueSale(clientRef, payload);
      window.dispatchEvent(new Event('pp:sale-queued'));
      if (isCredit) flagAttention('receivables');
      toast.success('Réseau coupé. La vente est gardée sur ce téléphone et partira toute seule.');
      reset();
      onSaved?.();
    } finally {
      setSubmitting(false);
    }
  }

  // ── Rendu ──────────────────────────────────────────────────────────────────
  //
  // Ce que cet écran a perdu par rapport à sa version d'avant :
  //   · les cinq boutons de paiement en cinq couleurs saturées — émeraude,
  //     rose, violet, bleu, ambre — remplacés par UN composant décliné, la
  //     sélection marquée par le contraste (§3.4, §4.2) ;
  //   · l'en-tête marine décoratif qui volait un tiers de la feuille ;
  //   · les mentions en 11 px, illisibles en plein soleil (§5.2).
  //
  // Et ce qu'il a gagné : un seul appel à l'action, portant les trois états
  // obligatoires — enfoncé, chargement, confirmation (§3.7). Le marchand ne
  // peut plus créer une vente en double en appuyant deux fois.

  return (
    <div className="space-y-6">
      {/* Le total du jour — la cible du vol. Une ligne, deux valeurs, aucune
          carte : ce n'est pas un indicateur de plus, c'est le repère de la
          journée en cours. */}
      {todayTotal !== null && (
        <>
        <div className="relative flex min-h-touch items-center justify-between gap-4 border-b border-border pb-2 dark:border-dark-border">
          <span className="text-note font-bold uppercase tracking-wide text-muted dark:text-dark-muted">
            Ventes du jour
          </span>
          <Money
            key={todayTotal}
            value={todayTotal}
            currency={totalCurrency}
            size="card"
            className={confirmed ? 'transition-colors duration-move ease-pp' : undefined}
          />
          {/* Le montant qui vole : il monte depuis la saisie et se fond dans le
              total, qui s'incrémente au même instant. 680 ms, interruptible,
              coupé si « réduire les animations » est activé — la règle vit dans
              globals.css, un seul endroit pour une seule décision. */}
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
        {/* Total incomplet : des ventes dans l'autre devise en sont restées
            dehors, faute de taux saisi. */}
        {todayUnconverted > 0 && (
          <p role="status" className="text-note text-amber-700 dark:text-amber-400">
            {unconvertedNotice(todayUnconverted, totalCurrency).fr}
            {' · '}
            <Link href="/settings" className="font-bold underline underline-offset-4">Renseigner le taux</Link>
          </p>
        )}
        </>
      )}

      {/* Étape 1 — le produit */}
      {!selected && (
        <div className="space-y-4">
          <div className="relative">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted" aria-hidden />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Chercher un produit…"
              aria-label="Chercher un produit"
              className="min-h-13 w-full rounded-surface border border-border bg-surface pl-12 pr-4 text-body text-primary outline-none placeholder:text-muted focus:border-accent dark:border-dark-border dark:bg-dark-surface2 dark:text-dark-text"
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
                noun="produit"
                suggestion={closestMatch(search, products.map((p) => p.name))}
                onUseSuggestion={setSearch}
                onClear={() => setSearch('')}
              />
            ) : (
              <FirstRun
                title="Aucun produit enregistré"
                hint="Ajoutez d'abord ce que vous vendez ; la vente prendra ensuite dix secondes."
                action={
                  <Link href="/products">
                    <Button variant="accent" size="lg" block>Ajouter un produit</Button>
                  </Link>
                }
              />
            )
          ) : (
            <div className="grid grid-cols-2 gap-2">
              {visible.map((p) => {
                const out = p.stock_quantity <= 0;
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
                    <span className="truncate text-body font-bold text-primary dark:text-dark-text">{p.name}</span>
                    {/* Le prix est une DONNÉE : il est en marine, pas en
                        émeraude. L'émeraude est réservée à l'action (§6.3). */}
                    <Money value={p.sale_price} currency={SALE_CURRENCY} size="body" className="mt-1 block font-bold" />
                    <span className="mt-1 text-note text-muted dark:text-dark-muted">
                      {out ? 'Rupture de stock' : `${p.stock_quantity} en stock`}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Étape 2 — quantité, paiement, validation */}
      {selected && (
        <div className="space-y-6">
          {/* Le produit choisi et sa quantité sont LIÉS : ils se touchent. */}
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-4">
              <span className="min-w-0">
                <span className="block truncate text-card font-bold text-primary dark:text-dark-text">{selected.name}</span>
                <span className="block text-note text-muted dark:text-dark-muted">
                  {formatAmount(selected.sale_price, SALE_CURRENCY)} l unité
                </span>
              </span>
              <button
                type="button"
                onClick={reset}
                className="pressable min-h-touch flex-shrink-0 text-body text-muted underline underline-offset-4 dark:text-dark-muted"
              >
                Changer
              </button>
            </div>

            <div className="flex items-center justify-center gap-6">
              <button
                type="button"
                onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                aria-label="Retirer une unité"
                className="pressable flex h-13 w-13 items-center justify-center rounded-surface border border-border text-primary dark:border-dark-border dark:text-dark-text"
              >
                <Minus className="h-5 w-5" strokeWidth={2} aria-hidden />
              </button>
              <span className="amount w-16 text-center text-amount-lg font-bold text-primary dark:text-dark-text">
                {quantity}
              </span>
              <button
                type="button"
                onClick={() => setQuantity((q) => Math.min(q + 1, Math.max(selected.stock_quantity, 1)))}
                aria-label="Ajouter une unité"
                className="pressable flex h-13 w-13 items-center justify-center rounded-surface border border-border text-primary dark:border-dark-border dark:text-dark-text"
              >
                <Plus className="h-5 w-5" strokeWidth={2} aria-hidden />
              </button>
            </div>
          </div>

          {/* Le marchand voit ce qu il gagne AVANT de valider. Sans marge
              calculable, le total reste affiché : c'est son prix, en HTG. */}
          <div className="flex items-center justify-between rounded-surface bg-surface px-4 py-3 dark:bg-dark-surface2">
            <span className="text-note font-bold uppercase tracking-wide text-muted dark:text-dark-muted">Total</span>
            <span className="flex items-baseline gap-3">
              {margin ? (
                <Money value={margin.revenue} currency={margin.currency} size="card" />
              ) : (
                <Money value={selected.sale_price * quantity} currency={SALE_CURRENCY} size="card" />
              )}
              {margin && (
                <span className="text-note text-muted dark:text-dark-muted">
                  marge{' '}
                  <Money
                    value={margin.netMargin}
                    currency={margin.currency}
                    size="note"
                    tone={margin.isLoss ? 'down' : 'default'}
                    className="font-bold"
                  />
                </span>
              )}
            </span>
          </div>
          {/* Prix d'achat en dollars sans taux saisi : ni marge, ni vente — le
              serveur refuserait d'enregistrer un coût converti à un taux inventé. */}
          {costNeedsRate && (
            <p role="status" className="-mt-4 text-note text-amber-700 dark:text-amber-400">
              Prix d&apos;achat en {costCurrency} : renseignez le taux USD/HTG de l&apos;entreprise (Paramètres) pour calculer la marge et enregistrer cette vente.{' '}
              <Link href="/settings" className="font-bold underline underline-offset-4">Renseigner le taux</Link>
            </p>
          )}
          {/* Pas de taux saisi, entreprise en USD : les montants restent en HTG,
              sans conversion. */}
          {margin && noConversion && (
            <p className="-mt-4 text-note text-muted dark:text-dark-muted">
              Montants en {displayCurrency} : taux de change non renseigné, aucune conversion en {currency}.{' '}
              <Link href="/settings" className="font-bold underline underline-offset-4">Renseigner le taux</Link>
            </p>
          )}

          <div className="space-y-2">
            <label htmlFor="pp-customer" className="block text-note font-bold uppercase tracking-wide text-muted dark:text-dark-muted">
              Client {mode === 'Crédit' ? '(obligatoire)' : '(facultatif)'}
            </label>
            <input
              id="pp-customer"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              placeholder="Nom du client"
              className="min-h-13 w-full rounded-surface border border-border bg-surface px-4 text-body text-primary outline-none placeholder:text-muted focus:border-accent dark:border-dark-border dark:bg-dark-surface2 dark:text-dark-text"
            />
          </div>

          <div className="space-y-2">
            <span className="block text-note font-bold uppercase tracking-wide text-muted dark:text-dark-muted">
              Paiement
            </span>
            <PaymentPicker value={PAY_KEY[mode]} onChange={(k) => setMode(KEY_PAY[k])} />
          </div>

          {/* L unique appel à l action de la feuille : les 10 % de la palette
              tombent exactement ici. Il porte ses trois états (§3.7). */}
          <Button
            variant="accent"
            size="lg"
            block
            loading={submitting}
            confirmed={confirmed}
            loadingLabel="Enregistrement…"
            onClick={() => submit(mode)}
          >
            {confirmed ? 'Vente enregistrée' : 'Enregistrer la vente'}
          </Button>
        </div>
      )}
    </div>
  );
}
