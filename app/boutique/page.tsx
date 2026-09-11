'use client';

import { useEffect, useState, useTransition } from 'react';
import {
  getMyStoreSettings,
  upsertStoreSettings,
} from '../actions/boutique';
import { StorePreview } from '../../components/store/StorePreview';
import { TEMPLATE_LIST } from '../../components/store/templates/registry';
import { storePublicUrl } from '../../lib/storeTheme';
import type { StoreSettings, ShippingMode } from '../actions/store-public';
// Vingt-trois émojis sur l'écran qui configure la vitrine du marchand — dont
// six en guise d'onglets. Un onglet est un point de repère : il doit être
// dessiné par nous, pas par le clavier du téléphone (§3.5).
import {
  AlertTriangle, Check, CreditCard, ExternalLink, Eye, FileText, Globe,
  Package, Palette, Rocket, Settings, ShoppingCart, Smartphone, Star,
  type LucideIcon,
} from 'lucide-react';

const PAYMENT_OPTIONS = [
  { value: 'cash',    label: 'Paiement à la livraison' },
  { value: 'moncash', label: 'MonCash' },
  { value: 'natcash', label: 'NatCash' },
  { value: 'card',    label: 'Carte bancaire' },
];

type Tab = 'general' | 'design' | 'payment' | 'seo' | 'apercu' | 'netlify';

function Spinner({ sm }: { sm?: boolean }) {
  return (
    <div className={`animate-spin rounded-full border-2 border-slate-300 border-t-[#001F3F] ${sm ? 'h-4 w-4' : 'h-6 w-6'}`} />
  );
}

function fmt(n: number, currency = 'HTG') {
  return new Intl.NumberFormat('fr-HT', { minimumFractionDigits: 0 }).format(n) + ' ' + currency;
}

// ── Netlify tab ───────────────────────────────────────────────────────────────

function NetlifyTab({ settings }: { settings: StoreSettings | null }) {
  const [token,     setToken]     = useState('');
  const [siteName,  setSiteName]  = useState('');
  const [deploying, setDeploying] = useState(false);
  const [result,    setResult]    = useState<{ url: string; productCount?: number } | null>(null);
  const [error,     setError]     = useState('');
  const [step,      setStep]      = useState<'token' | 'deploy' | 'done'>(
    (settings as any)?.netlify_site_url ? 'done' : 'token'
  );

  const existingUrl = (settings as any)?.netlify_site_url ?? null;

  async function handleDeploy() {
    if (!token.trim()) { setError('Token Netlify requis'); return; }
    setDeploying(true);
    setError('');
    try {
      const res = await fetch('/api/boutique/netlify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          netlifyToken: token.trim(),
          siteName: siteName.trim() || undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) { setError(json.error ?? 'Erreur'); setDeploying(false); return; }
      setResult({ url: json.url, productCount: json.productCount });
      setStep('done');
    } catch (e: any) {
      setError(e.message ?? 'Erreur réseau');
    }
    setDeploying(false);
  }

  return (
    <div className="space-y-6">
      {/* Header info */}
      <div className="rounded-2xl border border-blue-100 bg-blue-50 p-5 space-y-2">
        <h3 className="flex items-center gap-2 font-bold text-blue-900">
          <Globe className="h-5 w-5" strokeWidth={1.8} aria-hidden />
          Publier sur Netlify
        </h3>
        <p className="text-sm text-blue-700">
          Publiez votre boutique comme un site statique sur Netlify — gratuit, rapide, et accessible partout.
          Vous obtiendrez une URL du type <code className="rounded bg-blue-100 px-1">ma-boutique.netlify.app</code>.
        </p>
      </div>

      {/* Already deployed */}
      {(existingUrl || result?.url) && (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 space-y-3">
          <p className="text-sm font-bold text-emerald-800">
            <Check className="mr-1 inline h-4 w-4 align-[-3px]" strokeWidth={2.5} aria-hidden />
            Boutique publiée
            {result?.productCount !== undefined && (
              <span className="ml-2 font-normal text-emerald-700">— {result.productCount} produit{result.productCount !== 1 ? 's' : ''} inclus</span>
            )}
          </p>
          <a
            href={result?.url ?? existingUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 rounded-xl bg-accent px-4 py-2 text-sm font-bold text-accent-ink hover:bg-accent-h"
          >
            <ExternalLink className="h-4 w-4" strokeWidth={1.8} aria-hidden />
            Voir la boutique en ligne
            <svg viewBox="0 0 20 20" className="h-4 w-4" fill="currentColor">
              <path d="M11 3a1 1 0 100 2h2.586l-6.293 6.293a1 1 0 101.414 1.414L15 6.414V9a1 1 0 102 0V4a1 1 0 00-1-1h-5z" />
              <path d="M5 5a2 2 0 00-2 2v8a2 2 0 002 2h8a2 2 0 002-2v-3a1 1 0 10-2 0v3H5V7h3a1 1 0 000-2H5z" />
            </svg>
          </a>
          <p className="text-xs text-emerald-600">
            URL : <strong>{result?.url ?? existingUrl}</strong>
          </p>
          <button
            onClick={() => setStep('token')}
            className="text-xs text-emerald-600 underline"
          >
            Re-déployer avec un nouveau token
          </button>
        </div>
      )}

      {/* Steps */}
      {step !== 'done' && (
        <>
          {/* Step 1 : Token */}
          <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-4">
            <div className="flex items-center gap-3">
              <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-white">1</div>
              <h4 className="font-bold text-slate-800">Obtenir un token Netlify</h4>
            </div>
            <p className="text-sm text-slate-600">
              Allez sur{' '}
              <a
                href="https://app.netlify.com/user/applications#personal-access-tokens"
                target="_blank"
                rel="noreferrer"
                className="font-semibold text-blue-600 hover:underline"
              >
                app.netlify.com → User settings → Applications → Personal access tokens
              </a>
              , créez un token et collez-le ici.
            </p>
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Personal Access Token Netlify *
                </label>
                <input
                  type="password"
                  value={token}
                  onChange={e => setToken(e.target.value)}
                  placeholder="nfp_..."
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-mono outline-none focus:border-primary/40 focus:ring-2 focus:ring-primary/10"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Nom du site (facultatif)
                </label>
                <input
                  type="text"
                  value={siteName}
                  onChange={e => setSiteName(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-'))}
                  placeholder="ma-boutique (ex: jean-shop → jean-shop.netlify.app)"
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-primary/40 focus:ring-2 focus:ring-primary/10"
                />
              </div>
            </div>

            {error && (
              <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-600">
                {error}
              </div>
            )}

            <button
              onClick={handleDeploy}
              disabled={!token.trim() || deploying}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-3 text-sm font-bold text-white transition hover:bg-primary-h disabled:opacity-60"
            >
              {deploying ? (
                <>
                  <Spinner sm /> Déploiement en cours…
                </>
              ) : (
                <>
                  <Rocket className="h-4 w-4" strokeWidth={1.8} aria-hidden />
                  Déployer sur Netlify
                </>
              )}
            </button>

            {deploying && (
              <div className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-xs text-blue-700 space-y-1">
                <p>Génération du site statique…</p>
                <p>Création du fichier ZIP…</p>
                <p>Envoi vers Netlify…</p>
              </div>
            )}
          </div>

          {/* Step 2 : Info */}
          <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-2">
            <div className="flex items-center gap-3">
              <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-slate-200 text-xs font-bold text-slate-600">2</div>
              <h4 className="font-bold text-slate-500">Votre boutique est en ligne</h4>
            </div>
            <p className="text-sm text-slate-400 pl-10">
              Après déploiement, vous recevrez l'URL de votre boutique Netlify. À chaque modification, re-déployez pour mettre à jour.
            </p>
          </div>
        </>
      )}

      {/* Guide */}
      <div className="rounded-2xl border border-slate-100 bg-slate-50 p-5 space-y-2">
        <h4 className="text-sm font-bold text-slate-700">Ce que contient le déploiement</h4>
        <ul className="space-y-1 text-xs text-slate-500">
          <li>• Page d'accueil avec hero, produits, catégories</li>
          <li>• Grille de {settings ? 'vos' : 'tous les'} produits avec images, prix et stock</li>
          <li>• Panier et formulaire de commande intégrés</li>
          <li>• Informations de paiement et livraison</li>
          <li>• Design personnalisé (couleurs, logo, bannière)</li>
          <li>• Compatible mobile (responsive)</li>
        </ul>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function BoutiquePage() {
  const [settings,       setSettings]       = useState<StoreSettings | null>(null);
  const [loading,        setLoading]        = useState(true);
  const [tab,            setTab]            = useState<Tab>('general');
  const [saving,         startSaving]       = useTransition();
  const [saved,          setSaved]          = useState(false);
  const [error,          setError]          = useState('');

  const [form, setForm] = useState({
    slug:             '',
    is_active:        false,
    store_name:       '',
    tagline:          '',
    logo_url:         '',
    banner_url:       '',
    banner_text:      '',
    primary_color:    '#001F3F',
    secondary_color:  '#50C878',
    show_prices:      true,
    show_stock:       false,
    currency:         'HTG',
    meta_title:       '',
    meta_description: '',
    contact_email:    '',
    contact_phone:    '',
    contact_address:  '',
    payment_methods:  ['cash'] as string[],
  });

  const [shippingModes, setShippingModes] = useState<ShippingMode[]>([]);
  const [newMode,       setNewMode]       = useState({ label: '', price: 0, days: '2-3 jours' });
  const [creds, setCreds] = useState({
    moncash_client_id:     '',
    moncash_client_secret: '',
    moncash_sandbox:       false,
    natcash_client_id:     '',
    natcash_client_secret: '',
    natcash_sandbox:       false,
  });

  useEffect(() => {
    getMyStoreSettings().then((s) => {
      if (s) {
        setSettings(s);
        setForm({
          slug:             s.slug,
          is_active:        s.is_active,
          store_name:       s.store_name       ?? '',
          tagline:          s.tagline          ?? '',
          logo_url:         s.logo_url         ?? '',
          banner_url:       s.banner_url       ?? '',
          banner_text:      s.banner_text      ?? '',
          primary_color:    s.primary_color,
          secondary_color:  s.secondary_color,
          show_prices:      s.show_prices,
          show_stock:       s.show_stock,
          currency:         s.currency,
          meta_title:       s.meta_title       ?? '',
          meta_description: s.meta_description ?? '',
          contact_email:    s.contact_email    ?? '',
          contact_phone:    s.contact_phone    ?? '',
          contact_address:  s.contact_address  ?? '',
          payment_methods:  s.payment_methods  ?? ['cash'],
        });
        setShippingModes(s.shipping_modes ?? []);
        const pc = (s as any).payment_credentials ?? {};
        setCreds({
          moncash_client_id:     pc.moncash?.client_id     ?? '',
          moncash_client_secret: pc.moncash?.client_secret ?? '',
          moncash_sandbox:       pc.moncash?.sandbox       ?? false,
          natcash_client_id:     pc.natcash?.client_id     ?? '',
          natcash_client_secret: pc.natcash?.client_secret ?? '',
          natcash_sandbox:       pc.natcash?.sandbox       ?? false,
        });
      }
    }).finally(() => setLoading(false));
  }, []);

  function togglePayment(method: string) {
    setForm((f) => ({
      ...f,
      payment_methods: f.payment_methods.includes(method)
        ? f.payment_methods.filter((m) => m !== method)
        : [...f.payment_methods, method],
    }));
  }

  function addShippingMode() {
    if (!newMode.label.trim()) return;
    setShippingModes((prev) => [...prev, { id: crypto.randomUUID(), ...newMode }]);
    setNewMode({ label: '', price: 0, days: '2-3 jours' });
  }

  function removeShippingMode(id: string) {
    setShippingModes((prev) => prev.filter((m) => m.id !== id));
  }

  function handleSave() {
    setError('');
    startSaving(async () => {
      try {
        const payment_credentials = {
          moncash: {
            client_id:     creds.moncash_client_id.trim(),
            client_secret: creds.moncash_client_secret.trim(),
            sandbox:       creds.moncash_sandbox,
          },
          natcash: {
            client_id:     creds.natcash_client_id.trim(),
            client_secret: creds.natcash_client_secret.trim(),
            sandbox:       creds.natcash_sandbox,
          },
        };
        await upsertStoreSettings({ ...form, shipping_modes: shippingModes, payment_credentials } as any);
        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
      } catch (e: any) {
        setError(e.message ?? 'Erreur sauvegarde.');
      }
    });
  }

  const storeUrl = typeof window !== 'undefined' && form.slug
    ? `${window.location.origin}/store/${form.slug}`
    : '';

  const inp = 'w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-800 outline-none focus:border-primary/40 focus:ring-2 focus:ring-primary/10';

  const TABS: { key: Tab; label: string; icon: LucideIcon }[] = [
    { key: 'general',  label: 'Général',        icon: Settings },
    { key: 'design',   label: 'Design',         icon: Palette },
    { key: 'payment',  label: 'Paiement',       icon: CreditCard },
    { key: 'seo',      label: 'SEO & Contact',  icon: FileText },
    { key: 'apercu',   label: 'Aperçu',         icon: Eye },
    { key: 'netlify',  label: 'Publier',        icon: Rocket },
  ];

  if (loading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      {/* Header */}
      <div className="mb-8 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-primary">Boutique en ligne</h1>
          <p className="mt-1 text-sm text-slate-500">Gérez et publiez votre boutique publique.</p>
          {form.slug && (
            <a
              href={storeUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-1 inline-flex items-center gap-1 text-xs text-blue-600 hover:underline"
            >
              <ExternalLink className="h-4 w-4" strokeWidth={1.8} aria-hidden />
              {storeUrl}
              <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
            </a>
          )}
        </div>
        <div className="flex items-center gap-3">
          {saved && (
            <span className="flex items-center gap-1 text-sm font-medium text-emerald-600">
              <Check className="h-4 w-4" strokeWidth={2.5} aria-hidden />
              Sauvegardé
            </span>
          )}
          {tab !== 'apercu' && tab !== 'netlify' && (
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-white transition hover:bg-primary-h disabled:opacity-50"
            >
              {saving && <Spinner sm />}
              Enregistrer
            </button>
          )}
        </div>
      </div>

      {/* Le créateur de vitrine vit sur un autre écran : cet écran-ci règle le
          commerce (paiements, livraison, SEO), l'autre règle ce que le CLIENT
          voit. Sans ce renvoi, le second était introuvable depuis le premier. */}
      <a
        href="/boutique/builder"
        className="mb-8 flex items-center gap-3 rounded-surface border border-border bg-accent-sub px-4 py-3 transition hover:border-accent"
      >
        <Palette className="h-5 w-5 flex-shrink-0 text-primary" strokeWidth={1.8} aria-hidden />
        <span className="min-w-0 flex-1">
          <span className="block text-body font-semibold text-primary">
            Choisir le design de votre vitrine
          </span>
          {/* Compté, pas écrit en dur : le texte disait « Trois » bien après
              que l'éditeur en propose davantage. */}
          <span className="block text-note text-muted">
            {TEMPLATE_LIST.length} gabarits, vos couleurs, les produits publiés et le Studio photo
          </span>
        </span>
        <ExternalLink className="h-4 w-4 flex-shrink-0 text-muted" strokeWidth={1.8} aria-hidden />
      </a>

      {error && (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
          {error}
        </div>
      )}

      {/* Tabs */}
      <div className="mb-6 flex gap-1 overflow-x-auto rounded-xl bg-slate-100 p-1">
        {TABS.map((t) => {
          const TabIcon = t.icon;
          return (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex flex-shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition ${
              tab === t.key ? 'bg-white shadow text-primary' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <TabIcon className="h-4 w-4" strokeWidth={1.8} aria-hidden />
            <span>{t.label}</span>
          </button>
          );
        })}
      </div>

      {/* ── Aperçu : la vitrine réelle, pas une simulation (§34) ── */}
      {tab === 'apercu' && (
        form.slug ? (
          <StorePreview slug={form.slug} />
        ) : (
          <div className="rounded-2xl border border-dashed border-slate-200 py-16 text-center">
            <Eye className="mx-auto h-10 w-10 text-slate-300" strokeWidth={1.5} aria-hidden />
            <p className="mt-3 text-sm font-medium text-slate-500">
              Choisissez d'abord une adresse pour votre boutique
            </p>
            <p className="text-xs text-slate-400">
              Onglet Général → Slug. C'est elle qui donne l'adresse de l'aperçu.
            </p>
          </div>
        )
      )}

      {/* ── Netlify tab ── */}
      {tab === 'netlify' && (
        <NetlifyTab settings={settings} />
      )}

      {/* ── Config tabs (inside card) ── */}
      {tab !== 'apercu' && tab !== 'netlify' && (
        <div className="rounded-2xl border border-slate-200 bg-white p-6">
          {/* General */}
          {tab === 'general' && (
            <div className="space-y-5">
              <div className="flex items-center justify-between rounded-2xl border border-slate-200 p-4">
                <div>
                  <p className="font-semibold text-slate-800">Boutique active</p>
                  <p className="text-xs text-slate-500">Rendre la boutique accessible au public</p>
                </div>
                <button
                  onClick={() => setForm((f) => ({ ...f, is_active: !f.is_active }))}
                  className={`relative h-7 w-12 rounded-full transition ${form.is_active ? 'bg-emerald-500' : 'bg-slate-200'}`}
                >
                  <div className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-all ${form.is_active ? 'left-6' : 'left-1'}`} />
                </button>
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-widest text-slate-500">Slug (URL) *</label>
                <input
                  className={inp}
                  value={form.slug}
                  onChange={(e) => setForm({ ...form, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-') })}
                  placeholder="ma-boutique"
                />
                {/* L'adresse que la vitrine a réellement (sous-domaine, ou domaine
                    branché par le marchand), pas l'ancien chemin `/store/`. */}
                <p className="mt-1 text-xs text-slate-400">
                  {storePublicUrl({ slug: form.slug || 'votre-slug', custom_domain: settings?.custom_domain ?? null })}
                </p>
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-widest text-slate-500">Nom de la boutique</label>
                <input className={inp} value={form.store_name} onChange={(e) => setForm({ ...form, store_name: e.target.value })} placeholder="Ma Super Boutique" />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-widest text-slate-500">Slogan</label>
                <input className={inp} value={form.tagline} onChange={(e) => setForm({ ...form, tagline: e.target.value })} placeholder="La meilleure boutique de la ville" />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-widest text-slate-500">URL du logo</label>
                <input className={inp} value={form.logo_url} onChange={(e) => setForm({ ...form, logo_url: e.target.value })} placeholder="https://..." />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-widest text-slate-500">Devise</label>
                <select className={inp} value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })}>
                  <option value="HTG">HTG (Gourde)</option>
                  <option value="USD">USD (Dollar)</option>
                </select>
              </div>
              <div className="flex gap-6">
                <label className="flex cursor-pointer items-center gap-2">
                  <input type="checkbox" checked={form.show_prices} onChange={(e) => setForm({ ...form, show_prices: e.target.checked })} className="h-4 w-4 accent-primary" />
                  <span className="text-sm text-slate-700">Afficher les prix</span>
                </label>
                <label className="flex cursor-pointer items-center gap-2">
                  <input type="checkbox" checked={form.show_stock} onChange={(e) => setForm({ ...form, show_stock: e.target.checked })} className="h-4 w-4 accent-primary" />
                  <span className="text-sm text-slate-700">Afficher le stock</span>
                </label>
              </div>
            </div>
          )}

          {/* Design */}
          {tab === 'design' && (
            <div className="space-y-5">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1.5 block text-xs font-semibold uppercase tracking-widest text-slate-500">Couleur principale</label>
                  <div className="flex items-center gap-3">
                    <input type="color" value={form.primary_color} onChange={(e) => setForm({ ...form, primary_color: e.target.value })} className="h-10 w-16 cursor-pointer rounded-lg border border-slate-200" />
                    <input className={`${inp} flex-1`} value={form.primary_color} onChange={(e) => setForm({ ...form, primary_color: e.target.value })} />
                  </div>
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-semibold uppercase tracking-widest text-slate-500">Couleur secondaire</label>
                  <div className="flex items-center gap-3">
                    <input type="color" value={form.secondary_color} onChange={(e) => setForm({ ...form, secondary_color: e.target.value })} className="h-10 w-16 cursor-pointer rounded-lg border border-slate-200" />
                    <input className={`${inp} flex-1`} value={form.secondary_color} onChange={(e) => setForm({ ...form, secondary_color: e.target.value })} />
                  </div>
                </div>
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-widest text-slate-500">URL de la bannière</label>
                <input className={inp} value={form.banner_url} onChange={(e) => setForm({ ...form, banner_url: e.target.value })} placeholder="https://... (image)" />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-widest text-slate-500">Texte de la bannière</label>
                <input className={inp} value={form.banner_text} onChange={(e) => setForm({ ...form, banner_text: e.target.value })} placeholder="Bienvenue dans notre boutique" />
              </div>
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-slate-400">Aperçu couleurs</p>
                <div className="overflow-hidden rounded-2xl border border-slate-200">
                  <div className="flex items-center gap-2 p-3" style={{ backgroundColor: form.primary_color }}>
                    <div className="h-6 w-20 rounded bg-white/20" />
                    <div className="flex-1" />
                    <div className="h-6 w-16 rounded" style={{ backgroundColor: form.secondary_color }} />
                  </div>
                  <div
                    className="p-8 text-center"
                    style={{ background: `linear-gradient(135deg, ${form.primary_color} 0%, ${form.secondary_color} 100%)` }}
                  >
                    <p className="text-xl font-bold text-white">{form.store_name || 'Ma Boutique'}</p>
                    <p className="mt-1 text-sm text-white/80">{form.banner_text || 'Bienvenue'}</p>
                  </div>
                  <div className="grid grid-cols-3 gap-2 bg-slate-50 p-3">
                    {[1, 2, 3].map((i) => (
                      <div key={i} className="flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white">
                        <div className="aspect-square bg-slate-100" />
                        <div className="p-2">
                          <div className="mb-1 h-3 w-3/4 rounded bg-slate-200" />
                          <div className="h-3 w-1/2 rounded" style={{ backgroundColor: form.primary_color + '40' }} />
                          <div className="mt-2 h-6 w-full rounded-lg" style={{ backgroundColor: form.secondary_color }} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Payment & Shipping */}
          {tab === 'payment' && (
            <div className="space-y-8">
              <div>
                <h3 className="mb-4 font-bold text-slate-800">Moyens de paiement</h3>
                <div className="space-y-2">
                  {PAYMENT_OPTIONS.map((opt) => (
                    <label key={opt.value} className="flex cursor-pointer items-center gap-3 rounded-xl border border-slate-200 p-4 hover:bg-slate-50 transition">
                      <input type="checkbox" checked={form.payment_methods.includes(opt.value)} onChange={() => togglePayment(opt.value)} className="h-4 w-4 accent-primary" />
                      <span className="text-sm font-medium text-slate-800">{opt.label}</span>
                    </label>
                  ))}
                </div>
              </div>
              {/* MonCash credentials — shown when MonCash is enabled */}
              {form.payment_methods.includes('moncash') && (
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5 space-y-4">
                  <div className="flex items-center gap-2">
                    <Smartphone className="h-5 w-5 text-muted" strokeWidth={1.8} aria-hidden />
                    <h4 className="font-bold text-slate-800">Identifiants MonCash</h4>
                    <a href="https://moncashbutton.digicelgroup.com/Moncash-business" target="_blank" rel="noopener noreferrer" className="ml-auto text-xs text-blue-600 underline">Obtenir mes clés →</a>
                  </div>
                  <p className="text-xs text-slate-500">Créez un compte marchand sur MonCash Business et copiez votre Client ID et Client Secret.</p>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                      <label className="mb-1 block text-xs font-semibold text-slate-500">Client ID</label>
                      <input className={inp} placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" value={creds.moncash_client_id} onChange={(e) => setCreds({ ...creds, moncash_client_id: e.target.value })} />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-semibold text-slate-500">Client Secret</label>
                      <input className={inp} type="password" placeholder="••••••••••••••••" value={creds.moncash_client_secret} onChange={(e) => setCreds({ ...creds, moncash_client_secret: e.target.value })} />
                    </div>
                  </div>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={creds.moncash_sandbox} onChange={(e) => setCreds({ ...creds, moncash_sandbox: e.target.checked })} className="h-4 w-4 accent-primary" />
                    <span className="text-xs text-slate-600">Mode sandbox (test) — décochez pour la production</span>
                  </label>
                  <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                    <AlertTriangle className="mr-1 inline h-4 w-4 align-[-3px]" strokeWidth={1.8} aria-hidden />
                    Dans votre tableau de bord MonCash Business, configurez l'URL de retour :<br />
                    <code className="mt-1 block break-all font-mono text-amber-900">
                      {typeof window !== 'undefined' ? window.location.origin : 'https://votre-app.com'}/api/store/payment/moncash/callback
                    </code>
                  </div>
                </div>
              )}

              {/* NatCash credentials — shown when NatCash is enabled */}
              {form.payment_methods.includes('natcash') && (
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5 space-y-4">
                  <div className="flex items-center gap-2">
                    <Smartphone className="h-5 w-5 text-muted" strokeWidth={1.8} aria-hidden />
                    <h4 className="font-bold text-slate-800">Identifiants NatCash</h4>
                    <a href="https://www.natcash.com" target="_blank" rel="noopener noreferrer" className="ml-auto text-xs text-blue-600 underline">Portail NatCash →</a>
                  </div>
                  <p className="text-xs text-slate-500">Contactez Natcom pour obtenir vos identifiants API marchand NatCash.</p>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                      <label className="mb-1 block text-xs font-semibold text-slate-500">Client ID</label>
                      <input className={inp} placeholder="Votre Client ID NatCash" value={creds.natcash_client_id} onChange={(e) => setCreds({ ...creds, natcash_client_id: e.target.value })} />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-semibold text-slate-500">Client Secret</label>
                      <input className={inp} type="password" placeholder="••••••••••••••••" value={creds.natcash_client_secret} onChange={(e) => setCreds({ ...creds, natcash_client_secret: e.target.value })} />
                    </div>
                  </div>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={creds.natcash_sandbox} onChange={(e) => setCreds({ ...creds, natcash_sandbox: e.target.checked })} className="h-4 w-4 accent-primary" />
                    <span className="text-xs text-slate-600">Mode sandbox (test)</span>
                  </label>
                </div>
              )}

              <div>
                <h3 className="mb-4 font-bold text-slate-800">Modes de livraison</h3>
                <div className="space-y-2">
                  {shippingModes.map((mode) => (
                    <div key={mode.id} className="flex items-center justify-between rounded-xl border border-slate-200 p-4">
                      <div>
                        <p className="text-sm font-semibold text-slate-800">{mode.label}</p>
                        <p className="text-xs text-slate-400">{mode.days} — {mode.price === 0 ? 'Gratuit' : `${mode.price} ${form.currency}`}</p>
                      </div>
                      <button onClick={() => removeShippingMode(mode.id)} className="text-slate-300 hover:text-red-500 transition">
                        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  ))}
                </div>
                <div className="mt-4 rounded-xl border border-dashed border-slate-300 p-4 space-y-3">
                  <p className="text-xs font-semibold text-slate-500">+ Ajouter un mode de livraison</p>
                  <div className="grid grid-cols-3 gap-2">
                    <input className={inp} placeholder="Libellé *" value={newMode.label} onChange={(e) => setNewMode({ ...newMode, label: e.target.value })} />
                    <input className={inp} type="number" placeholder="Prix (HTG)" value={newMode.price} onChange={(e) => setNewMode({ ...newMode, price: Number(e.target.value) })} />
                    <input className={inp} placeholder="Délai" value={newMode.days} onChange={(e) => setNewMode({ ...newMode, days: e.target.value })} />
                  </div>
                  <button onClick={addShippingMode} className="min-h-touch min-w-touch inline-flex items-center justify-center rounded-xl bg-primary px-4 py-2 text-xs font-bold text-white hover:bg-primary-h">
                    Ajouter
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* SEO & Contact */}
          {tab === 'seo' && (
            <div className="space-y-5">
              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-widest text-slate-500">Titre SEO</label>
                <input className={inp} value={form.meta_title} onChange={(e) => setForm({ ...form, meta_title: e.target.value })} placeholder="Ma Boutique — Les meilleurs produits" />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-widest text-slate-500">Description SEO</label>
                <textarea className={inp} rows={3} value={form.meta_description} onChange={(e) => setForm({ ...form, meta_description: e.target.value })} placeholder="Description courte pour les moteurs de recherche…" />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-widest text-slate-500">Email de contact</label>
                <input className={inp} type="email" value={form.contact_email} onChange={(e) => setForm({ ...form, contact_email: e.target.value })} placeholder="contact@maboutique.ht" />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-widest text-slate-500">Téléphone de contact</label>
                <input className={inp} value={form.contact_phone} onChange={(e) => setForm({ ...form, contact_phone: e.target.value })} placeholder="+509 ..." />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-widest text-slate-500">Adresse</label>
                <input className={inp} value={form.contact_address} onChange={(e) => setForm({ ...form, contact_address: e.target.value })} placeholder="Port-au-Prince, Haïti" />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
