'use client';

import { useEffect, useMemo, useState } from 'react';
import { createSaleAction, type CartItemPayload } from '../app/actions/sales';
import { getClients, upsertClient, type Client } from '../app/actions/clients';
import { formatCurrency } from '../lib/utils';
import { supabase } from '../lib/supabaseClient';
import { Button } from './Button';
import { BarcodeScanner } from './BarcodeScanner';
import { SaleInvoiceModal, type InvoiceData } from './SaleInvoiceModal';
import {
  Scan, Trash2, DollarSign, UserPlus, ChevronDown,
  FileText, Percent, User,
} from 'lucide-react';
import { useLanguage } from './LanguageWrapper';

// ── Types ─────────────────────────────────────────────────────────────────────

type ProductOption = {
  id: string;
  name: string;
  sale_price: number;
  purchase_price: number;
  stock_quantity: number;
  category: string;
  barcode?: string;
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

const MODE_COLORS: Record<PaymentMode, string> = {
  Espèces:     'bg-emerald-600 text-white',
  Moncash:     'bg-[#e91e8c] text-white',
  Natcash:     'bg-purple-600 text-white',
  'Carte Visa': 'bg-[#0056b3] text-white',
  Crédit:       'bg-amber-500 text-white',
};

const MODE_LABELS: Record<PaymentMode, string> = {
  Espèces:     '💵 Espèces',
  Moncash:     '📱 MonCash',
  Natcash:     '📲 NatCash',
  'Carte Visa': '💳 Carte Visa',
  Crédit:       '⏳ À Crédit',
};

// ── Component ─────────────────────────────────────────────────────────────────

export function NewSaleForm({ onSaleComplete }: { onSaleComplete?: () => void }) {
  const { t } = useLanguage();
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
  const [exchangeRate, setExchangeRate] = useState(1);

  // CRM
  const [clients, setClients] = useState<Client[]>([]);
  const [clientsLoading, setClientsLoading] = useState(true);
  const [clientsError, setClientsError] = useState('');
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [clientSearch, setClientSearch] = useState('');
  const [clientDropdown, setClientDropdown] = useState(false);
  const [newClientName, setNewClientName] = useState('');
  const [showNewClient, setShowNewClient] = useState(false);
  const [savingClient, setSavingClient] = useState(false);

  // Submission
  const [ownerId, setOwnerId] = useState<string | null>(null);
  const [businessId, setBusinessId] = useState<string | null>(null);
  const [businessName, setBusinessName] = useState('Mon Entreprise');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [invoiceData, setInvoiceData] = useState<InvoiceData | null>(null);

  // ── Load data ──────────────────────────────────────────────────────────────

  useEffect(() => {
    async function init() {
      const [{ data: userData }, { data: prods }, { data: biz }] = await Promise.all([
        supabase.auth.getUser(),
        supabase.from('products').select('id,name,sale_price,purchase_price,stock_quantity,category,currency,image_url').order('name'),
        supabase.from('businesses').select('id,name,exchange_rate').maybeSingle(),
      ]);
      setOwnerId(userData.user?.id ?? null);
      setProducts((prods ?? []) as ProductOption[]);
      if (biz?.name) setBusinessName(biz.name);
      if (biz?.id) setBusinessId(biz.id);
      if (biz?.exchange_rate) setExchangeRate(biz.exchange_rate);
    }

    async function loadClients() {
      setClientsLoading(true);
      setClientsError('');
      try {
        const list = await getClients();
        setClients(list);
      } catch (e: any) {
        setClientsError(e?.message ?? t({ fr: 'Erreur de chargement des clients', ht: 'Erè chajman kliyan yo' }));
      } finally {
        setClientsLoading(false);
      }
    }

    init();
    loadClients();
  }, []);

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
    [cart, currency, exchangeRate]  // eslint-disable-line react-hooks/exhaustive-deps
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

  function displayUnitPrice(product: ProductOption) {
    if (product.currency === currency) return product.sale_price;
    if (product.currency === 'USD') return product.sale_price * exchangeRate;
    return product.sale_price / exchangeRate;
  }

  function fmtDisplay(n: number) {
    const sym = currency === 'HTG' ? 'G' : '$';
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
    const found = products.find(p => p.barcode === code.trim());
    setScanMessage(found ? `${t({ fr: 'Ajouté: ', ht: 'Ajoute: ' })}${found.name}` : `${t({ fr: 'Aucun produit pour ', ht: 'Pa gen pwodui pou ' })}${code}`);
    if (found) addToCart(found);
    setScannerOpen(false);
  }

  // ── Client handlers ────────────────────────────────────────────────────────

  async function handleSaveNewClient() {
    if (!newClientName.trim()) return;
    setSavingClient(true);
    try {
      const created = await upsertClient({ name: newClientName });
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
    if (isCredit && !selectedClient) {
      setError(t({ fr: 'Sélectionnez un client pour une vente à crédit.', ht: 'Chwazi yon kliyan pou yon vant a kredi.' }));
      return;
    }

    setSubmitting(true);
    setError('');

    try {
      const items = cart.map(i => {
        const unitPrice = i.product.currency === currency
          ? i.product.sale_price
          : i.product.currency === 'USD'
            ? parseFloat((i.product.sale_price * exchangeRate).toFixed(2))
            : parseFloat((i.product.sale_price / exchangeRate).toFixed(2));
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
        currency,
        discount_percent: discountPercent,
        customer_id: selectedClient?.id,
        customer_name: selectedClient?.name ?? undefined,
      });

      if (!result.success) {
        setError(result.errors.map(e => e.message).join(', '));
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
        currency,
      };

      setInvoiceData(invoice);
      setCart([]);
      setSearch('');
      setDiscountPercent(0);
      setSelectedClient(null);
      setClientSearch('');
      setPaymentMode('Espèces');
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
        <section className="rounded-[28px] border border-slate-200 bg-white p-4 shadow-sm md:p-6">
          <div className="mb-5 flex items-center justify-between gap-4">
            <div>
              <h2 className="text-xl font-semibold text-[#212529]">{t({ fr: 'Catalogue', ht: 'Katalòg' })}</h2>
              <p className="mt-1 text-sm text-[#212529]/60">{t({ fr: "Cliquez sur un produit pour l'ajouter.", ht: 'Klike sou yon pwodui pou ajoute l.' })}</p>
            </div>
          </div>

          {/* Search + Scan */}
          <div className="mb-4 flex flex-col gap-3 sm:flex-row">
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder={t({ fr: 'Rechercher un produit ou catégorie…', ht: 'Chèche yon pwodui oswa kategori…' })}
              className="flex-1 rounded-3xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-[#212529] outline-none focus:border-[#0056b3] focus:bg-white"
            />
            <button type="button" onClick={() => { setScanMessage(''); setScannerOpen(true); }}
              className="inline-flex items-center gap-2 rounded-3xl bg-[#0056b3] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#0047a1]">
              <Scan size={15} /> {t({ fr: 'Scan', ht: 'Eskane' })}
            </button>
          </div>
          {scanMessage && <p className="mb-3 text-xs text-[#0056b3]">{scanMessage}</p>}

          {/* Products grid */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
            {filteredProducts.length === 0 ? (
              <p className="col-span-full py-8 text-center text-sm text-[#212529]/50">{t({ fr: 'Aucun produit trouvé.', ht: 'Pa gen pwodui jwenn.' })}</p>
            ) : filteredProducts.map(p => (
              <div key={p.id} onClick={() => addToCart(p)}
                className={`cursor-pointer rounded-2xl border border-slate-200 bg-slate-50 overflow-hidden transition hover:shadow-md hover:border-[#0056b3]/40 ${p.stock_quantity === 0 ? 'opacity-50 pointer-events-none' : ''}`}>
                <div className="aspect-square bg-slate-100 overflow-hidden">
                  {p.image_url
                    ? <img src={p.image_url} alt={p.name} className="h-full w-full object-cover" />
                    : <div className="flex h-full w-full items-center justify-center text-2xl">📦</div>}
                </div>
                <div className="p-2.5">
                  <p className="truncate text-xs font-semibold text-[#212529]">{p.name}</p>
                  <p className="mt-1 text-[10px] text-[#212529]/50">{p.category}</p>
                  <div className="mt-2 flex items-center justify-between">
                    <div className="flex items-center gap-1">
                      <p className="text-xs font-bold text-[#0056b3]">{fmtDisplay(displayUnitPrice(p))}</p>
                      {p.currency === 'USD' && <span className="text-[9px] font-bold text-[#0056b3]/60">USD</span>}
                    </div>
                    <p className={`text-[10px] font-medium ${p.stock_quantity < 5 ? 'text-orange-500' : 'text-[#212529]/50'}`}>{p.stock_quantity}{t({ fr: ' unités', ht: ' inite' })}</p>
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
          <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-[#212529]">
                Panier <span className="ml-1 text-sm text-[#212529]/50">({cart.length})</span>
              </h2>
              <button type="button" onClick={() => setCurrency(c => c === 'HTG' ? 'USD' : 'HTG')}
                className="inline-flex items-center gap-1.5 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-[#212529] transition hover:bg-slate-100">
                <DollarSign size={13} /> {currency}
              </button>
            </div>

            {/* Cart items */}
            <div className="max-h-52 overflow-y-auto space-y-2">
              {cart.length === 0
                ? <p className="rounded-2xl bg-slate-50 py-6 text-center text-xs text-[#212529]/50">{t({ fr: 'Panier vide', ht: 'Panye vid' })}</p>
                : cart.map(item => (
                  <div key={item.product.id} className="rounded-xl border border-slate-100 bg-slate-50 p-3 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <p className="flex-1 truncate text-xs font-semibold text-[#212529]">{item.product.name}</p>
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
                        className="w-12 rounded border border-slate-200 bg-white py-0.5 text-center text-xs outline-none focus:border-[#0056b3]" />
                      <button type="button" onClick={() => updateQty(item.product.id, item.quantity + 1)}
                        className="h-6 w-6 rounded border border-slate-200 text-xs font-bold hover:bg-slate-100">+</button>
                      <p className="ml-auto text-xs font-bold text-[#0056b3]">
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
                  <label className="flex items-center gap-1.5 text-xs font-medium text-[#212529]/70">
                    <Percent size={12} /> Remise (%)
                  </label>
                  <input type="number" min={0} max={100} step={0.5}
                    value={discountPercent}
                    onChange={e => setDiscountPercent(Math.min(100, Math.max(0, Number(e.target.value))))}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-[#212529] outline-none focus:border-[#0056b3] focus:bg-white" />
                </div>

                {/* Client selector */}
                <div className="space-y-1 relative">
                  <label className="flex items-center gap-1.5 text-xs font-medium text-[#212529]/70">
                    <User size={12} />
                    {t({ fr: 'Client ', ht: 'Kliyan ' })}{isCredit && <span className="text-red-500">*</span>}
                  </label>

                  {/* Error state */}
                  {clientsError && (
                    <p className="rounded-xl bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-600">
                      ⚠️ {clientsError}
                    </p>
                  )}

                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setClientDropdown(v => !v)}
                      disabled={clientsLoading}
                      className="w-full flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-[#212529] transition hover:bg-slate-100 disabled:opacity-60"
                    >
                      <span className={selectedClient ? 'font-medium text-[#212529]' : 'text-[#212529]/40'}>
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
                            className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs outline-none focus:border-[#0056b3] focus:bg-white"
                          />
                        </div>

                        {/* List */}
                        <div className="max-h-44 overflow-y-auto">
                          {/* Deselect */}
                          {selectedClient && (
                            <button type="button"
                              onClick={() => { setSelectedClient(null); setClientDropdown(false); }}
                              className="w-full px-3 py-2 text-left text-xs text-[#212529]/50 hover:bg-slate-50">
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
                                className="inline-flex items-center gap-1 rounded-lg bg-[#0056b3] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#0047a1]"
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
                                selectedClient?.id === c.id ? 'bg-blue-50 font-semibold text-[#0056b3]' : 'text-[#212529]'
                              }`}
                            >
                              <span className="font-medium truncate">{c.name}</span>
                              {(c.outstanding_balance ?? 0) > 0 && (
                                <span className="shrink-0 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700">
                                  {formatCurrency(c.outstanding_balance)}
                                </span>
                              )}
                            </button>
                          ))}
                        </div>

                        {/* Add new client */}
                        <div className="border-t border-slate-100 p-2">
                          {!showNewClient ? (
                            <button
                              type="button"
                              onClick={() => setShowNewClient(true)}
                              className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#0056b3] hover:underline"
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
                                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs outline-none focus:border-[#0056b3] focus:bg-white"
                              />
                              <div className="flex gap-2">
                                <button
                                  type="button"
                                  onClick={handleSaveNewClient}
                                  disabled={!newClientName.trim() || savingClient}
                                  className="flex-1 rounded-xl bg-[#0056b3] py-1.5 text-xs font-semibold text-white disabled:opacity-50 hover:bg-[#0047a1]"
                                >
                                  {savingClient ? t({ fr: 'Création…', ht: 'Ap kreye…' }) : t({ fr: 'Créer', ht: 'Kreye' })}
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
                      <span className="text-xs font-semibold text-[#0056b3]">✓ {selectedClient.name}</span>
                      {(selectedClient.outstanding_balance ?? 0) > 0 && (
                        <span className="text-[10px] text-amber-600 font-medium">
                          {t({ fr: 'Crédit: ', ht: 'Kredi: ' })}{formatCurrency(selectedClient.outstanding_balance)}
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={() => setSelectedClient(null)}
                        className="text-[10px] text-slate-400 hover:text-red-500 ml-2"
                      >
                        ✕
                      </button>
                    </div>
                  )}
                </div>

                {/* Payment mode */}
                <div className="space-y-2">
                  <label className="text-xs font-medium text-[#212529]/70">{t({ fr: 'Méthode de Paiement', ht: 'Metòd Peman' })}</label>
                  <div className="grid grid-cols-2 gap-1.5">
                    {ALL_MODES.map(mode => (
                      <button key={mode} type="button"
                        onClick={() => setPaymentMode(mode)}
                        className={`rounded-xl py-2.5 px-2 text-xs font-semibold text-center leading-tight transition
                          ${paymentMode === mode ? MODE_COLORS[mode] : 'bg-slate-100 text-[#212529]/70 hover:bg-slate-200'}`}>
                        {mode === 'Espèces' ? t({ fr: '💵 Espèces', ht: '💵 Kach' }) : mode === 'Crédit' ? t({ fr: '⏳ À Crédit', ht: '⏳ À Kredi' }) : mode === 'Carte Visa' ? t({ fr: '💳 Carte Visa', ht: '💳 Kat Visa' }) : MODE_LABELS[mode]}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Totals */}
                <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4 space-y-1.5">
                  <div className="flex justify-between text-xs text-[#212529]/60">
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
                    <span className="text-sm font-bold text-[#212529]">{t({ fr: 'Total', ht: 'Total' })}</span>
                    <span className="text-xl font-extrabold text-[#0056b3]">{fmtDisplay(total)}</span>
                  </div>
                </div>

                {isCredit && !selectedClient && (
                  <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-700">
                    {t({ fr: '⚠ Un client est requis pour une vente à crédit.', ht: '⚠ Yon kliyan obligatwa pou yon vant a kredi.' })}
                  </p>
                )}

                {error && (
                  <p className="rounded-xl bg-red-50 px-3 py-2 text-xs text-red-600">{error}</p>
                )}

                <button type="submit"
                  disabled={submitting || cart.length === 0 || (isCredit && !selectedClient)}
                  className="w-full rounded-2xl bg-green-600 py-3.5 text-sm font-bold text-white transition hover:bg-green-700 hover:scale-[1.02] active:scale-95 disabled:scale-100 disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed shadow-lg">
                  {submitting ? t({ fr: 'Traitement…', ht: 'Tretman…' }) : isCredit ? t({ fr: '⏳ Enregistrer à Crédit', ht: '⏳ Anrejistre a Kredi' }) : t({ fr: '✓ Encaisser', ht: '✓ Enkese' })}
                </button>
              </>
            )}
          </section>
        </aside>
      </form>

      {/* Invoice modal — shown after successful sale */}
      {invoiceData && (
        <div className="fixed inset-0 z-40 flex flex-col items-center justify-center bg-black/60 p-4">
          <div className="mb-4 flex w-full max-w-2xl items-center justify-between rounded-2xl bg-emerald-600 px-6 py-4 text-white shadow-lg">
            <div className="flex items-center gap-3">
              <span className="text-2xl">✓</span>
              <div>
                <p className="text-sm font-bold">{t({ fr: 'Vente enregistrée avec succès !', ht: 'Vant anrejistre avèk siksè !' })}</p>
                <p className="text-xs opacity-80">{t({ fr: 'Facture N° ', ht: 'Fakti N° ' })}{invoiceData.invoiceNumber}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => { /* keep invoiceData to show modal */ }}
                className="inline-flex items-center gap-1.5 rounded-xl bg-white/20 px-3 py-2 text-xs font-semibold transition hover:bg-white/30"
                style={{ display: 'none' }}>
                <FileText size={13} /> {t({ fr: 'Voir facture', ht: 'Wè fakti' })}
              </button>
            </div>
          </div>
          <SaleInvoiceModal data={invoiceData} onClose={() => setInvoiceData(null)} businessName={businessName} />
        </div>
      )}
    </>
  );
}
