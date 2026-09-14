'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { createSaleAction } from '../app/actions/sales';
import { useCompany } from '../hooks/useCompany';
import { getCustomers, upsertCustomer, type Customer } from '../app/actions/customers';
import { supabase } from '../lib/supabaseClient';
import { Button } from './Button';
import { BarcodeScanner } from './BarcodeScanner';
import { SaleInvoiceModal, type InvoiceData } from './SaleInvoiceModal';
import {
  Scan, Trash2, DollarSign, UserPlus, ChevronDown,
  Percent, User,
  Check as CheckIcon, Package as PackageIcon, X as XIcon,
} from 'lucide-react';
import { useLanguage } from './LanguageWrapper';
import { PaymentPicker, type PaymentKey } from './ds';

// ── Types ─────────────────────────────────────────────────────────────────────

type ProductOption = {
  id: string;
  name: string;
  sale_price: number;
  purchase_price: number;
  stock_quantity: number;
  category: string;
  // `products` n'a pas de colonne `barcode` : le code scanné est le SKU.
  sku?: string | null;
  image_url?: string;
  currency: 'HTG' | 'USD';
};

type CartItem = {
  product: ProductOption;
  quantity: number;
};

type PaymentMode = 'Espèces' | 'Moncash' | 'Natcash' | 'Carte Visa' | 'Crédit';

// ── Constants ─────────────────────────────────────────────────────────────────

// Map display mode → DB value accepted by createSaleAction
const MODE_TO_DB: Record<PaymentMode, 'Cash' | 'MonCash' | 'Natcash' | 'Card'> = {
  Espèces:     'Cash',
  Moncash:     'MonCash',
  Natcash:     'Natcash',
  'Carte Visa': 'Card',
  Crédit:      'Cash', // credit sales use Cash as default DB method
};


const IMMEDIATE_METHODS: PaymentMode[] = ['Espèces', 'Moncash', 'Natcash', 'Carte Visa'];
const ALL_MODES: PaymentMode[] = ['Espèces', 'Moncash', 'Natcash', 'Carte Visa', 'Crédit'];

// Le mode de paiement passe par le composant unique (3.4) : la selection se
// marque par le contraste, pas par cinq teintes saturees cote a cote.
const PAY_KEY: Record<PaymentMode, PaymentKey> = {
  'Espèces': 'cash', Moncash: 'moncash', Natcash: 'natcash',
  'Carte Visa': 'card', 'Crédit': 'credit',
};
const KEY_PAY: Record<PaymentKey, PaymentMode> = {
  cash: 'Espèces', moncash: 'Moncash', natcash: 'Natcash',
  card: 'Carte Visa', credit: 'Crédit',
};

/** Même consigne que le refus serveur de createSaleAction (champ `currency`). */
const RATE_MISSING_MESSAGE = {
  fr: "Renseignez le taux USD/HTG de l'entreprise (Paramètres) avant d'enregistrer un montant en dollars.",
  ht: 'Mete to USD/HTG antrepriz la (Paramèt) anvan ou anrejistre yon montan an dola.',
};

const PRODUCT_COLUMNS = 'id,name,sale_price,purchase_price,stock_quantity,category,currency,image_url,sku';

const MODE_LABELS: Record<PaymentMode, string> = {
  Espèces:     'Espèces',
  Moncash:     'MonCash',
  Natcash:     'NatCash',
  'Carte Visa': 'Carte Visa',
  Crédit:       'À crédit',
};

// ── Component ─────────────────────────────────────────────────────────────────

export function NewSaleForm({ onSaleComplete }: { onSaleComplete?: () => void }) {
  const { t } = useLanguage();
  // L'entreprise ACTIVE (celle du sélecteur) et son taux, pas la première créée.
  const { company } = useCompany();
  const businessId   = company?.id ?? null;
  const businessName = company?.name ?? 'Mon Entreprise';
  // Seulement un taux SAISI : `null` sinon (1 est le défaut de la colonne).
  const exchangeRate = company?.exchangeRateSet ? company.exchangeRate : null;
  // Products
  const [products, setProducts] = useState<ProductOption[]>([]);
  const [search, setSearch] = useState('');
  const [scannerOpen, setScannerOpen] = useState(false);
  const [scanMessage, setScanMessage] = useState('');

  // Cart
  const [cart, setCart] = useState<CartItem[]>([]);
  const [discountPercent, setDiscountPercent] = useState<number>(0);

  // Payment
  const [paymentMode, setPaymentMode] = useState<PaymentMode>('Espèces');
  const [currency, setCurrency] = useState<'HTG' | 'USD'>('HTG');
  // La devise EFFECTIVE de la vente : USD seulement avec un taux saisi. Sans
  // lui, tout reste en HTG, la devise de `sale_price` — aucune conversion à 1.
  const saleCurrency: 'HTG' | 'USD' = currency === 'USD' && exchangeRate !== null ? 'USD' : 'HTG';
  const [rateNotice, setRateNotice] = useState(false);

  // CRM
  const [clients, setClients] = useState<Customer[]>([]);
  const [clientsLoading, setClientsLoading] = useState(true);
  const [clientsError, setClientsError] = useState('');
  const [selectedClient, setSelectedClient] = useState<Customer | null>(null);
  const [clientSearch, setClientSearch] = useState('');
  const [clientDropdown, setClientDropdown] = useState(false);
  const [newClientName, setNewClientName] = useState('');
  const [showNewClient, setShowNewClient] = useState(false);
  const [savingClient, setSavingClient] = useState(false);

  // Submission
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [invoiceData, setInvoiceData] = useState<InvoiceData | null>(null);

  // ── Load data ──────────────────────────────────────────────────────────────

  // Taux retiré (ou autre entreprise sans taux) : on revient en HTG.
  useEffect(() => {
    if (exchangeRate === null && currency === 'USD') setCurrency('HTG');
    if (exchangeRate !== null) setRateNotice(false);
  }, [exchangeRate, currency]);

  // Produits et clients de l'entreprise active, rechargés quand elle change :
  // un panier d'une autre entreprise ne doit pas partir sous ce business_id.
  useEffect(() => {
    if (!businessId) return;
    const bizId: string = businessId;
    let cancelled = false;

    async function init() {
      const { data: prods } = await supabase
        .from('products')
        .select(PRODUCT_COLUMNS)
        .eq('business_id', bizId)
        .order('name');
      if (!cancelled) setProducts((prods ?? []) as ProductOption[]);
    }

    async function loadClients() {
      setClientsLoading(true);
      setClientsError('');
      try {
        const list = await getCustomers();
        setClients(list);
      } catch (e: any) {
        setClientsError(e?.message ?? t({ fr: 'Erreur de chargement des clients', ht: 'Erè chajman kliyan yo' }));
      } finally {
        setClientsLoading(false);
      }
    }

    setCart([]);
    setSelectedClient(null);
    init();
    loadClients();
    return () => { cancelled = true; };
  }, [businessId]);

  // ── Derived values ─────────────────────────────────────────────────────────

  const filteredProducts = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return products;
    return products.filter(p => p.name.toLowerCase().includes(q) || p.category.toLowerCase().includes(q));
  }, [products, search]);

  const filteredClients = useMemo(() => {
    const q = clientSearch.trim().toLowerCase();
    if (!q) return clients;
    return clients.filter(c => c.name.toLowerCase().includes(q));
  }, [clients, clientSearch]);

  const subtotal = useMemo(() =>
    cart.reduce((s, i) => s + displayUnitPrice(i.product) * i.quantity, 0),
    [cart, saleCurrency, exchangeRate]  // eslint-disable-line react-hooks/exhaustive-deps
  );

  const discountAmount = useMemo(() =>
    parseFloat((subtotal * (discountPercent / 100)).toFixed(2)),
    [subtotal, discountPercent]
  );

  const total = useMemo(() =>
    parseFloat((subtotal - discountAmount).toFixed(2)),
    [subtotal, discountAmount]
  );

  const isCredit = paymentMode === 'Crédit';

  // ── Helpers ────────────────────────────────────────────────────────────────

  // `sale_price` est en HTG (fiche produit), quelle que soit `product.currency`,
  // qui est la devise du prix d'ACHAT. En USD, conversion au taux saisi
  // uniquement (saleCurrency n'est 'USD' qu'avec lui), arrondie au centime :
  // c'est ce prix-là qui est envoyé au serveur.
  function displayUnitPrice(product: ProductOption) {
    if (saleCurrency === 'HTG' || exchangeRate === null) return product.sale_price;
    return parseFloat((product.sale_price / exchangeRate).toFixed(2));
  }

  function toggleCurrency() {
    if (saleCurrency === 'HTG' && exchangeRate === null) {
      setRateNotice(true);
      return;
    }
    setRateNotice(false);
    setCurrency(saleCurrency === 'HTG' ? 'USD' : 'HTG');
  }

  function fmtDisplay(n: number) {
    const sym = saleCurrency === 'HTG' ? 'G' : '$';
    return `${sym} ${n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }

  // ── Cart handlers ──────────────────────────────────────────────────────────

  function addToCart(product: ProductOption) {
    setCart(prev => {
      const existing = prev.find(i => i.product.id === product.id);
      if (existing) {
        return prev.map(i =>
          i.product.id === product.id && i.quantity < product.stock_quantity
            ? { ...i, quantity: i.quantity + 1 }
            : i
        );
      }
      return [...prev, { product, quantity: 1 }];
    });
  }

  function updateQty(productId: string, qty: number) {
    if (qty <= 0) {
      setCart(prev => prev.filter(i => i.product.id !== productId));
    } else {
      setCart(prev => prev.map(i =>
        i.product.id === productId
          ? { ...i, quantity: Math.min(qty, i.product.stock_quantity) }
          : i
      ));
    }
  }

  function removeFromCart(productId: string) {
    setCart(prev => prev.filter(i => i.product.id !== productId));
  }

  function handleBarcodeDetected(code: string) {
    // Le scan cherchait `p.barcode`, jamais lu (la colonne n'existe pas) : aucun
    // produit n'était jamais trouvé.
    const wanted = code.trim().toLowerCase();
    const found = wanted
      ? products.find(p => (p.sku ?? '').trim().toLowerCase() === wanted)
      : undefined;
    setScanMessage(found ? `${t({ fr: 'Ajouté: ', ht: 'Ajoute: ' })}${found.name}` : `${t({ fr: 'Aucun produit pour ', ht: 'Pa gen pwodui pou ' })}${code}`);
    if (found) addToCart(found);
    setScannerOpen(false);
  }

  // ── Client handlers ────────────────────────────────────────────────────────

  async function handleSaveNewClient() {
    if (!newClientName.trim()) return;
    setSavingClient(true);
    try {
      // Ensure upsertClient attaches business_id server-side; reuse created client
      const created = await upsertCustomer({ name: newClientName });
      setClients(prev => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)));
      setSelectedClient(created);
      setShowNewClient(false);
      setNewClientName('');
      setClientDropdown(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSavingClient(false);
    }
  }

  // ── Submit ─────────────────────────────────────────────────────────────────

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!cart.length) return;
    if (!businessId) {
      setError(t({ fr: 'Entreprise non chargée. Rechargez la page.', ht: 'Antrepriz pa chaje. Recharge paj la.' }));
      return;
    }
    if (isCredit && !selectedClient) {
      setError(t({ fr: 'Sélectionnez un client pour une vente à crédit.', ht: 'Chwazi yon kliyan pou yon vant a kredi.' }));
      return;
    }

    setSubmitting(true);
    setError('');

    try {
      const items = cart.map(i => {
        // Même prix que l'écran : HTG tel quel, ou converti au taux saisi.
        const unitPrice = displayUnitPrice(i.product);
        return {
          product_id: i.product.id,
          product_name: i.product.name,
          quantity: i.quantity,
          unit_price: unitPrice,
          discount_percent: 0,
          tax_rate: 0,
        };
      });

      const dbPaymentMethod = MODE_TO_DB[paymentMode];

      const result = await createSaleAction({
        business_id: businessId as string,
        items,
        payment_method: dbPaymentMethod,
        payment_status: isCredit ? 'credit' : 'paid',
        tax_amount: 0,
        currency: saleCurrency,
        discount_percent: discountPercent,
        customer_id: selectedClient?.id,
        customer_name: selectedClient?.name ?? undefined,
      });

      if (!result.success) {
        // Refus « taux manquant » (vente en USD, ou coût d'achat dans l'autre
        // devise) : la consigne avec son lien vers les Paramètres.
        if (result.errors.some(e => e.field === 'currency')) setRateNotice(true);
        setError(result.errors.filter(e => e.field !== 'currency').map(e => e.message).join(', '));
        return;
      }

      // Build invoice data
      const invoice: InvoiceData = {
        invoiceNumber: result.invoiceNumber,
        date: new Date(),
        clientName: selectedClient?.name,
        items: cart.map(i => ({
          product_name: i.product.name,
          quantity: i.quantity,
          unit_price: displayUnitPrice(i.product),
        })),
        discountPercent,
        subtotal: parseFloat((cart.reduce((s, i) => s + displayUnitPrice(i.product) * i.quantity, 0)).toFixed(2)),
        discountAmount: result.discountAmount,
        totalAmount: result.totalAmount,
        paymentMethod: paymentMode === 'Crédit' ? 'Cash' : paymentMode,
        isCredit,
        currency: saleCurrency,
      };

      setInvoiceData(invoice);
      setCart([]);
      setSearch('');
      setDiscountPercent(0);
      setSelectedClient(null);
      setClientSearch('');
      setPaymentMode('Espèces');

      // Reload products to get updated stock quantities
      const { data: freshProds } = await supabase
        .from('products')
        .select(PRODUCT_COLUMNS)
        .eq('business_id', businessId)
        .order('name');
      if (freshProds) setProducts(freshProds as ProductOption[]);

      onSaleComplete?.();
    } catch (e) {
      setError((e as Error).message ?? t({ fr: 'Erreur lors de la vente.', ht: 'Erè pandan vant la.' }));
    } finally {
      setSubmitting(false);
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <>
      <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_360px]">

        {/* ── Catalogue ── */}
        <section className="rounded-surface border border-slate-200 bg-white p-4 md:p-6">
          <div className="mb-5 flex items-center justify-between gap-4">
            <div>
              <h2 className="text-xl font-semibold text-anthracite">{t({ fr: 'Catalogue', ht: 'Katalòg' })}</h2>
              <p className="mt-1 text-sm text-anthracite/60">{t({ fr: "Cliquez sur un produit pour l'ajouter.", ht: 'Klike sou yon pwodui pou ajoute l.' })}</p>
            </div>
          </div>

          {/* Search + Scan */}
          <div className="mb-4 flex flex-col gap-3 sm:flex-row">
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder={t({ fr: 'Rechercher un produit ou catégorie…', ht: 'Chèche yon pwodui oswa kategori…' })}
              className="flex-1 rounded-3xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-anthracite outline-none focus:border-primary focus:bg-white"
            />
            <button type="button" onClick={() => { setScanMessage(''); setScannerOpen(true); }}
              className="inline-flex items-center gap-2 rounded-3xl bg-primary px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-primary-h">
              <Scan size={15} /> {t({ fr: 'Scan', ht: 'Eskane' })}
            </button>
          </div>
          {scanMessage && <p className="mb-3 text-xs text-primary">{scanMessage}</p>}

          {/* Products grid */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
            {filteredProducts.length === 0 ? (
              <p className="col-span-full py-8 text-center text-sm text-anthracite/50">{t({ fr: 'Aucun produit trouvé.', ht: 'Pa gen pwodui jwenn.' })}</p>
            ) : filteredProducts.map(p => (
              <div key={p.id} onClick={() => addToCart(p)}
                className={`cursor-pointer rounded-2xl border border-slate-200 bg-slate-50 overflow-hidden transition hover:shadow-md hover:border-primary/40 ${p.stock_quantity === 0 ? 'opacity-50 pointer-events-none' : ''}`}>
                <div className="aspect-square bg-slate-100 overflow-hidden">
                  {p.image_url
                    ? <img src={p.image_url} alt={p.name} className="h-full w-full object-cover" />
                    : (
                      <div className="flex h-full w-full items-center justify-center text-muted">
                        <PackageIcon className="h-7 w-7" strokeWidth={1.5} aria-hidden />
                      </div>
                    )}
                </div>
                <div className="p-2.5">
                  <p className="truncate text-xs font-semibold text-anthracite">{p.name}</p>
                  <p className="mt-1 text-note text-anthracite/50">{p.category}</p>
                  <div className="mt-2 flex items-center justify-between">
                    {/* Prix dans la devise de la vente. `p.currency` (devise
                        d'achat) n'est plus affichée à côté : elle faisait lire
                        « USD » sous un prix en gourdes. */}
                    <div className="flex items-center gap-1">
                      <p className="text-xs font-bold text-primary">{fmtDisplay(displayUnitPrice(p))}</p>
                    </div>
                    <p className={`text-note font-medium ${p.stock_quantity < 5 ? 'text-orange-500' : 'text-anthracite/50'}`}>{p.stock_quantity}{t({ fr: ' unités', ht: ' inite' })}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {scannerOpen && (
            <BarcodeScanner onDetected={handleBarcodeDetected} onClose={() => setScannerOpen(false)} />
          )}
        </section>

        {/* ── Panier ── */}
        <aside className="sticky top-6 h-fit">
          <section className="rounded-surface border border-slate-200 bg-white p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-anthracite">
                Panier <span className="ml-1 text-sm text-anthracite/50">({cart.length})</span>
              </h2>
              <button type="button" onClick={toggleCurrency}
                aria-describedby={rateNotice ? 'sale-rate-notice' : undefined}
                className="inline-flex items-center gap-1.5 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-anthracite transition hover:bg-slate-100">
                <DollarSign size={13} /> {saleCurrency}
              </button>
            </div>

            {/* Pas de taux saisi : la vente en dollars n'est pas proposée, et
                rien n'est converti à 1. */}
            {rateNotice && exchangeRate === null && (
              <p id="sale-rate-notice" role="status" className="rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-700">
                {t(RATE_MISSING_MESSAGE)}{' '}
                <Link href="/settings" className="font-bold underline underline-offset-4">
                  {t({ fr: 'Renseigner le taux', ht: 'Mete to a' })}
                </Link>
              </p>
            )}

            {/* Cart items */}
            <div className="max-h-52 overflow-y-auto space-y-2">
              {cart.length === 0
                ? <p className="rounded-2xl bg-slate-50 py-6 text-center text-xs text-anthracite/50">{t({ fr: 'Panier vide', ht: 'Panye vid' })}</p>
                : cart.map(item => (
                  <div key={item.product.id} className="rounded-xl border border-slate-100 bg-slate-50 p-3 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <p className="flex-1 truncate text-xs font-semibold text-anthracite">{item.product.name}</p>
                      <button type="button" onClick={() => removeFromCart(item.product.id)}
                        className="shrink-0 rounded p-0.5 text-red-400 hover:bg-red-50 transition">
                        <Trash2 size={13} />
                      </button>
                    </div>
                    <div className="flex items-center gap-2">
                      <button type="button" onClick={() => updateQty(item.product.id, item.quantity - 1)}
                        className="h-6 w-6 rounded border border-slate-200 text-xs font-bold hover:bg-slate-100">−</button>
                      <input type="number" value={item.quantity} min={1} max={item.product.stock_quantity}
                        onChange={e => updateQty(item.product.id, Number(e.target.value))}
                        className="w-12 rounded border border-slate-200 bg-white py-0.5 text-center text-xs outline-none focus:border-primary" />
                      <button type="button" onClick={() => updateQty(item.product.id, item.quantity + 1)}
                        className="h-6 w-6 rounded border border-slate-200 text-xs font-bold hover:bg-slate-100">+</button>
                      <p className="ml-auto text-xs font-bold text-primary">
                        {fmtDisplay(displayUnitPrice(item.product) * item.quantity)}
                      </p>
                    </div>
                  </div>
                ))}
            </div>

            {cart.length > 0 && (
              <>
                {/* Discount */}
                <div className="space-y-1">
                  <label htmlFor="sale-discount" className="flex items-center gap-1.5 text-xs font-medium text-anthracite/70">
                    <Percent size={12} /> Remise (%)
                  </label>
                  <input id="sale-discount" type="number" min={0} max={100} step={0.5}
                    value={discountPercent}
                    onChange={e => setDiscountPercent(Math.min(100, Math.max(0, Number(e.target.value))))}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-anthracite outline-none focus:border-primary focus:bg-white" />
                </div>

                {/* Client selector */}
                <div className="space-y-1 relative">
                  <span className="flex items-center gap-1.5 text-xs font-medium text-anthracite/70">
                    <User size={12} />
                    {t({ fr: 'Client ', ht: 'Kliyan ' })}{isCredit && <span className="text-red-500">*</span>}
                  </span>

                  {/* Error state */}
                  {clientsError && (
                    <p className="rounded-xl bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-600">
                      {clientsError}
                    </p>
                  )}

                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setClientDropdown(v => !v)}
                      disabled={clientsLoading}
                      className="w-full flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-anthracite transition hover:bg-slate-100 disabled:opacity-60"
                    >
                      <span className={selectedClient ? 'font-medium text-anthracite' : 'text-anthracite/40'}>
                        {clientsLoading
                          ? t({ fr: 'Chargement des clients…', ht: 'Ap chaje kliyan yo…' })
                          : selectedClient
                            ? selectedClient.name
                            : clients.length === 0
                              ? t({ fr: 'Aucun client — créez-en un +', ht: 'Pa gen kliyan — kreye youn +' })
                              : t({ fr: 'Choisissez un client…', ht: 'Chwazi yon kliyan…' })}
                      </span>
                      <ChevronDown size={14} className={clientsLoading ? 'animate-spin opacity-50' : ''} />
                    </button>

                    {clientDropdown && !clientsLoading && (
                      <div className="absolute top-full left-0 z-30 mt-1 w-full rounded-2xl border border-slate-200 bg-white shadow-xl overflow-hidden">

                        {/* Search */}
                        <div className="p-2 border-b border-slate-100">
                          <input
                            autoFocus
                            value={clientSearch}
                            onChange={e => setClientSearch(e.target.value)}
                            placeholder={t({ fr: 'Chercher client…', ht: 'Chèche kliyan…' })}
                            className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs outline-none focus:border-primary focus:bg-white"
                          />
                        </div>

                        {/* List */}
                        <div className="max-h-44 overflow-y-auto">
                          {/* Deselect */}
                          {selectedClient && (
                            <button type="button"
                              onClick={() => { setSelectedClient(null); setClientDropdown(false); }}
                              className="w-full px-3 py-2 text-left text-xs text-anthracite/50 hover:bg-slate-50">
                              {t({ fr: '— Retirer client —', ht: '— Retire kliyan —' })}
                            </button>
                          )}

                          {/* Empty state */}
                          {filteredClients.length === 0 && !showNewClient && (
                            <div className="px-3 py-4 text-center">
                              <p className="text-xs text-slate-400 mb-2">
                                {clientSearch ? `${t({ fr: 'Aucun client avec ', ht: 'Okenn kliyan ak ' })}"${clientSearch}"` : t({ fr: 'Aucun client encore', ht: 'Pa gen kliyan ankò' })}
                              </p>
                              <button
                                type="button"
                                onClick={() => setShowNewClient(true)}
                                className="inline-flex items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-white hover:bg-primary-h"
                              >
                                <UserPlus size={11} /> {t({ fr: 'Créer votre premier client', ht: 'Kreye premye kliyan ou' })}
                              </button>
                            </div>
                          )}

                          {/* Client rows */}
                          {filteredClients.map(c => (
                            <button
                              key={c.id}
                              type="button"
                              onClick={() => { setSelectedClient(c); setClientDropdown(false); setClientSearch(''); }}
                              className={`w-full px-3 py-2.5 text-left text-xs transition hover:bg-slate-50 flex items-center justify-between gap-2 ${
                                selectedClient?.id === c.id ? 'bg-blue-50 font-semibold text-primary' : 'text-anthracite'
                              }`}
                            >
                              <span className="font-medium truncate">{c.name}</span>
                            </button>
                          ))}
                        </div>

                        {/* Add new client */}
                        <div className="border-t border-slate-100 p-2">
                          {!showNewClient ? (
                            <button
                              type="button"
                              onClick={() => setShowNewClient(true)}
                              className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline"
                            >
                              <UserPlus size={12} /> {t({ fr: 'Nouveau client', ht: 'Nouvo kliyan' })}
                            </button>
                          ) : (
                            <div className="space-y-2">
                              <input
                                autoFocus
                                value={newClientName}
                                onChange={e => setNewClientName(e.target.value)}
                                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleSaveNewClient(); } }}
                                placeholder={t({ fr: 'Nom client *', ht: 'Non kliyan *' })}
                                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs outline-none focus:border-primary focus:bg-white"
                              />
                              <div className="flex gap-2">
                                <button
                                  type="button"
                                  onClick={handleSaveNewClient}
                                  disabled={!newClientName.trim() || savingClient}
                                  className="min-h-touch min-w-touch flex-1 rounded-xl bg-primary py-1.5 text-xs font-semibold text-white disabled:opacity-50 hover:bg-primary-h"
                                >
                                  {savingClient
                                    ? t({ fr: 'Création…', ht: 'Ap kreye…' })
                                    : t({ fr: 'Créer le client', ht: 'Kreye kliyan an' })}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => { setShowNewClient(false); setNewClientName(''); }}
                                  className="rounded-xl border border-slate-200 px-3 py-1.5 text-xs text-slate-500 hover:bg-slate-50"
                                >
                                  {t({ fr: 'Annuler', ht: 'Anile' })}
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Selected client info */}
                  {selectedClient && (
                    <div className="flex items-center justify-between rounded-xl bg-blue-50 px-3 py-2">
                      <span className="text-xs font-semibold text-primary">{selectedClient.name}</span>
                      <button
                        type="button"
                        onClick={() => setSelectedClient(null)}
                        className="text-note text-slate-400 hover:text-red-500 ml-2"
                      >
                        <XIcon className="h-4 w-4" strokeWidth={2} aria-hidden />
                      </button>
                    </div>
                  )}
                </div>

                {/* Mode de paiement — un seul composant, decline par une
                    icone et un libelle. Le rose #001F3F installait une note
                    d alerte permanente sur le moment le plus positif de la
                    journee du marchand (4.2). */}
                <div className="space-y-2">
                  <span className="block text-note font-bold uppercase tracking-wide text-muted">
                    {t({ fr: 'Paiement', ht: 'Peman' })}
                  </span>
                  <PaymentPicker
                    value={PAY_KEY[paymentMode]}
                    onChange={(k) => setPaymentMode(KEY_PAY[k])}
                  />
                </div>

                {/* Totals */}
                <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4 space-y-1.5">
                  <div className="flex justify-between text-xs text-anthracite/60">
                    <span>{t({ fr: 'Sous-total', ht: 'Sous-total' })}</span>
                    <span>{fmtDisplay(subtotal)}</span>
                  </div>
                  {discountPercent > 0 && (
                    <div className="flex justify-between text-xs text-red-500">
                      <span>{t({ fr: 'Remise ', ht: 'Rabè ' })}({discountPercent}%)</span>
                      <span>−{fmtDisplay(discountAmount)}</span>
                    </div>
                  )}
                  <div className="flex justify-between border-t border-slate-200 pt-1.5">
                    <span className="text-sm font-bold text-anthracite">{t({ fr: 'Total', ht: 'Total' })}</span>
                    <span className="text-xl font-extrabold text-primary">{fmtDisplay(total)}</span>
                  </div>
                </div>

                {isCredit && !selectedClient && (
                  <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-700">
                    {t({ fr: 'Un client est requis pour une vente à crédit.', ht: 'Yon kliyan obligatwa pou yon vant a kredi.' })}
                  </p>
                )}

                {error && (
                  <p className="rounded-xl bg-red-50 px-3 py-2 text-xs text-red-600">{error}</p>
                )}

                <button type="submit"
                  disabled={submitting || cart.length === 0 || (isCredit && !selectedClient)}
                  className="w-full rounded-2xl bg-green-600 py-3.5 text-sm font-bold text-white transition hover:bg-green-700 hover:scale-[1.02] active:scale-95 disabled:scale-100 disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed shadow-lg">
                  {submitting ? t({ fr: 'Traitement…', ht: 'Tretman…' }) : isCredit ? t({ fr: 'Enregistrer à crédit', ht: 'Anrejistre a kredi' }) : t({ fr: 'Encaisser', ht: 'Enkese' })}
                </button>
              </>
            )}
          </section>
        </aside>
      </form>

      {/* Invoice modal — shown after successful sale */}
      {invoiceData && (
        <div className="fixed inset-0 z-40 flex flex-col items-center justify-center bg-black/60 p-4">
          <div className="mb-4 flex w-full max-w-2xl items-center justify-between rounded-2xl bg-accent px-6 py-4 text-accent-ink shadow-lg">
            <div className="flex items-center gap-3">
              <CheckIcon className="h-6 w-6" strokeWidth={2.5} aria-hidden />
              <div>
                <p className="text-sm font-bold">{t({ fr: 'Vente enregistrée avec succès !', ht: 'Vant anrejistre avèk siksè !' })}</p>
                <p className="text-xs opacity-80">{t({ fr: 'Facture N° ', ht: 'Fakti N° ' })}{invoiceData.invoiceNumber}</p>
              </div>
            </div>
          </div>
          <SaleInvoiceModal data={invoiceData} onClose={() => setInvoiceData(null)} businessName={businessName} />
        </div>
      )}
    </>
  );
}
