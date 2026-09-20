'use client';

// ─────────────────────────────────────────────────────────────────────────────
// Les onglets de la fiche produit (§16)
//
// Sous la galerie et la colonne d'achat, les maquettes posent une barre
// d'onglets : Description, Détails, Livraison, Retours, Avis, FAQ chez un
// commerçant ; Histoire de la pièce, Matériaux, Fabrication, Dimensions chez
// un artisan. Ce sont les mêmes questions que la page d'accueil traite en
// sections — reposées ici, où l'on décide.
//
// ── Pourquoi des onglets plutôt que des sections empilées ──────────────────
//
// La fiche portait tout en colonne : description longue, détails repliés, puis
// des sections pleine largeur reprises de l'accueil. L'acheteur qui cherchait
// une dimension devait faire défiler quatre écrans, et celui qui ne cherchait
// rien les traversait tous avant d'atteindre les suggestions. Six titres
// alignés disent d'un coup ce que la fiche sait, et chacun se lit sans quitter
// l'endroit.
//
// ── Ce qu'un onglet ne fait jamais ─────────────────────────────────────────
//
// Inventer. Chaque panneau lit une donnée réelle du marchand ; celui dont la
// source est vide n'existe pas — son titre ne s'affiche même pas, parce qu'un
// onglet « Livraison » qui s'ouvre sur du vide est pire que pas d'onglet.
// Dans l'aperçu de l'éditeur, et là seulement, il reste visible avec un exemple
// gris qui dit au marchand quoi remplir et où (`MerchantHint`).
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useMemo, useRef, useState } from 'react';
import { Truck, RotateCcw, Ruler, Leaf, Check } from 'lucide-react';
import { storeMoney } from '../format';
import { StoreImage } from '../blocks/StoreImage';
import { ProductReviews } from '../blocks/ProductReviews';
import { MerchantHint, useMerchantPreview } from './MerchantHint';
import { PDP_TAB_EVENT } from './pdpTabs';
import { IMAGE_SIZES } from '../../../lib/storeImage';
import type { PdpTab, PdpTabKey } from '../../../lib/storeProductPage';
import type { StoreReview } from '../sections/types';
import type { StoreProduct, StoreView } from '../types';
import type { ShippingMode } from '../../../app/actions/store-public';

type TabsProps = {
  tabs:          PdpTab[];
  product:       StoreProduct;
  store:         StoreView;
  shippingModes: ShippingMode[];
  reviews:       StoreReview[];
  average:       number;
};

export function ProductTabs(props: TabsProps) {
  const preview = useMerchantPreview();
  const listRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLElement>(null);

  // Un onglet vide ne s'affiche pas — sauf au marchand, à qui il faut bien
  // montrer l'emplacement pour qu'il le remplisse.
  const shown = useMemo(
    () => props.tabs.filter((t) => preview || hasContent(t.key, props)),
    [props, preview],
  );

  const [active, setActive] = useState(0);

  // « Guide des tailles », « Voir la composition » : la colonne d'achat pose la
  // question à hauteur de bouton, le panneau y répond ici (`pdpTabs.ts`). Un
  // onglet absent — sa source est vide — ne trouve personne, et le clic ne
  // déplace alors rien : c'est pourquoi le bouton qui l'émet ne s'affiche que
  // si la donnée existe.
  useEffect(() => {
    function onOpen(e: Event) {
      const key = (e as CustomEvent<PdpTab['key']>).detail;
      const index = shown.findIndex((t) => t.key === key);
      if (index < 0) return;
      setActive(index);
      rootRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    window.addEventListener(PDP_TAB_EVENT, onOpen);
    return () => window.removeEventListener(PDP_TAB_EVENT, onOpen);
  }, [shown]);

  if (shown.length === 0) return null;

  const current = shown[Math.min(active, shown.length - 1)];

  /** Flèches gauche/droite : ce que `role="tablist"` promet au clavier. */
  function onKey(e: React.KeyboardEvent<HTMLDivElement>) {
    const delta = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    if (delta === 0) return;
    e.preventDefault();
    const to = (active + delta + shown.length) % shown.length;
    setActive(to);
    listRef.current?.querySelectorAll('button')[to]?.focus();
  }

  return (
    <section className="mt-14 scroll-mt-24" ref={rootRef}>
      {/* La barre défile latéralement sur téléphone : six onglets ne tiennent
          pas dans 360 pixels, et les replier en menu cacherait justement ce
          que cette barre sert à montrer — tout ce que la fiche sait dire. */}
      <div
        ref={listRef}
        role="tablist"
        aria-label="Informations sur le produit"
        onKeyDown={onKey}
        className="-mx-4 flex gap-6 overflow-x-auto border-b px-4 sm:mx-0 sm:px-0"
        style={{ borderColor: 'var(--st-border)', scrollbarWidth: 'none' }}
      >
        {shown.map((tab, i) => {
          const selected = i === Math.min(active, shown.length - 1);
          return (
            <button
              key={tab.key}
              type="button"
              role="tab"
              id={`pdp-tab-${tab.key}`}
              aria-selected={selected}
              aria-controls={`pdp-panel-${tab.key}`}
              tabIndex={selected ? 0 : -1}
              onClick={() => setActive(i)}
              className="relative flex-shrink-0 whitespace-nowrap pb-3 pt-1 text-[14px] transition"
              style={{
                color:      selected ? 'var(--st-ink)' : 'var(--st-ink-3)',
                fontWeight: selected ? 600 : 500,
              }}
            >
              {tab.label}
              {tab.key === 'reviews' && props.reviews.length > 0 && (
                <span className="ml-1 tabular-nums text-[var(--st-ink-3)]">({props.reviews.length})</span>
              )}
              {selected && (
                <span
                  className="absolute inset-x-0 -bottom-px h-[2px]"
                  style={{ background: 'var(--st-ink)' }}
                  aria-hidden
                />
              )}
            </button>
          );
        })}
      </div>

      <div
        role="tabpanel"
        id={`pdp-panel-${current.key}`}
        aria-labelledby={`pdp-tab-${current.key}`}
        className="pt-6"
      >
        <TabPanel tabKey={current.key} {...props} />
      </div>
    </section>
  );
}

// ── Ce que chaque onglet a dans le ventre ───────────────────────────────────

function hasContent(key: PdpTabKey, p: TabsProps): boolean {
  const t = p.store.theme;
  switch (key) {
    case 'description': return Boolean(p.product.description?.trim());
    case 'attributes':  return Object.keys(p.product.attributes ?? {}).length > 0;
    case 'shipping':    return p.shippingModes.length > 0 || Boolean(t.shipping.note.trim());
    case 'returns':     return Boolean(t.shipping.returns.trim()) || t.trust.badges.length > 0;
    case 'reviews':     return p.reviews.length > 0;
    case 'faq':         return t.faq.items.length > 0;
    case 'process':     return t.process.steps.length > 0;
    case 'ingredients': return t.ingredients.items.length > 0 || Boolean(t.ingredients.body.trim());
    case 'results':     return t.caseStudies.items.length > 0;
    case 'gallery':     return t.gallery.images.length > 0;
    case 'sizeGuide':   return t.sizeGuide.rows.length > 0;
  }
}

const PROSE = 'max-w-3xl whitespace-pre-line text-[15px] leading-relaxed text-[var(--st-ink-2)]';

function TabPanel({ tabKey, product, store, shippingModes, reviews, average }: TabsProps & { tabKey: PdpTabKey }) {
  const t = store.theme;

  switch (tabKey) {
    case 'description':
      return product.description?.trim()
        ? <p className={PROSE}>{product.description}</p>
        : (
          <MerchantHint title="La description du produit" where="Produits → cette fiche → Description">
            <p className={PROSE}>
              Dites en quelques phrases ce que c’est, à qui ça sert et ce qui le distingue.
            </p>
          </MerchantHint>
        );

    case 'attributes': {
      const rows = Object.entries(product.attributes ?? {}).filter(([, v]) => String(v).trim());
      if (rows.length === 0) {
        return (
          <MerchantHint title="Les caractéristiques de cette fiche" where="Produits → cette fiche → Attributs">
            <SpecList rows={[['Matière', 'Coton'], ['Dimensions', '18 cm'], ['Poids', '450 g']]} />
          </MerchantHint>
        );
      }
      return <SpecList rows={rows.map(([k, v]) => [k, String(v)])} />;
    }

    case 'shipping':
      return (
        <div className="max-w-3xl">
          {t.shipping.note.trim() && <p className={`${PROSE} mb-5`}>{t.shipping.note}</p>}
          {shippingModes.length > 0 ? (
            <ul className="grid gap-3 sm:grid-cols-2">
              {shippingModes.filter((m) => m.label?.trim()).map((mode) => (
                <li
                  key={mode.id || mode.label}
                  className="flex items-start gap-3 p-4"
                  style={{ border: '1px solid var(--st-border)', borderRadius: 'var(--st-radius-card)' }}
                >
                  <Truck className="mt-0.5 h-5 w-5 flex-shrink-0 text-[var(--st-ink-3)]" strokeWidth={1.6} aria-hidden />
                  <div className="min-w-0">
                    <p className="text-[14px] font-semibold text-[var(--st-ink)]">{mode.label}</p>
                    {mode.days?.trim() && <p className="mt-0.5 text-[13px] text-[var(--st-ink-2)]">{mode.days}</p>}
                    <p className="mt-1 text-[14px] font-semibold tabular-nums text-[var(--st-ink)]">
                      {mode.price > 0 ? storeMoney(mode.price, store.currency) : 'Offerte'}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <MerchantHint title="Vos modes de livraison" where="Réglages → Boutique → Livraison">
              <p className={PROSE}>Livraison Port-au-Prince — 24 à 48 h — 250 HTG</p>
            </MerchantHint>
          )}
          {t.freeShipping.enabled && t.freeShipping.threshold > 0 && (
            <p className="mt-4 text-[14px] font-semibold text-[var(--st-ink)]">
              Livraison offerte dès {storeMoney(t.freeShipping.threshold, store.currency)}.
            </p>
          )}
        </div>
      );

    case 'returns':
      return (
        <div className="max-w-3xl">
          {t.shipping.returns.trim() ? (
            <p className={`${PROSE} flex gap-3`}>
              <RotateCcw className="mt-1 h-5 w-5 flex-shrink-0 text-[var(--st-ink-3)]" strokeWidth={1.6} aria-hidden />
              <span>{t.shipping.returns}</span>
            </p>
          ) : (
            <MerchantHint title="Votre politique de retour" where="Éditeur → Contenu → Livraison & retours">
              <p className={PROSE}>
                Échange possible sous 7 jours, article non porté, avec le reçu.
              </p>
            </MerchantHint>
          )}
          {t.trust.enabled && t.trust.badges.length > 0 && (
            <ul className="mt-6 grid gap-3 sm:grid-cols-2">
              {t.trust.badges.filter((b) => b.label.trim()).map((badge, i) => (
                <li key={`${badge.label}-${i}`} className="flex items-start gap-3">
                  <Check className="mt-0.5 h-4 w-4 flex-shrink-0 text-[var(--st-ink-3)]" strokeWidth={2} aria-hidden />
                  <div className="min-w-0">
                    <p className="text-[14px] font-semibold text-[var(--st-ink)]">{badge.label}</p>
                    {badge.note && <p className="text-[13px] text-[var(--st-ink-3)]">{badge.note}</p>}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      );

    case 'reviews':
      return reviews.length > 0
        ? <ProductReviews reviews={reviews} average={average} embedded />
        : (
          <MerchantHint title="Les avis de vos clients" where="ils s’affichent dès qu’un acheteur en publie un">
            <p className={PROSE}>
              Un avis ne peut être déposé qu’après une commande réelle : rien à saisir ici.
            </p>
          </MerchantHint>
        );

    case 'faq':
      return t.faq.items.length > 0 ? (
        <dl className="max-w-3xl">
          {t.faq.items.map((item, i) => (
            <div key={`${item.question}-${i}`} className="border-b py-4 last:border-0" style={{ borderColor: 'var(--st-border)' }}>
              <dt className="text-[15px] font-semibold text-[var(--st-ink)]">{item.question}</dt>
              <dd className="mt-2 whitespace-pre-line text-[14px] leading-relaxed text-[var(--st-ink-2)]">{item.answer}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <MerchantHint title="Vos questions fréquentes" where="Éditeur → Contenu → Questions fréquentes">
          <p className={PROSE}>Livrez-vous en province ? — Oui, sous 48 h, via les transporteurs.</p>
        </MerchantHint>
      );

    case 'process':
      return t.process.steps.length > 0 ? (
        <ol className="grid max-w-3xl gap-6 sm:grid-cols-2">
          {t.process.steps.map((step, i) => (
            <li key={`${step.title}-${i}`}>
              <p className="tabular-nums text-[13px] font-semibold text-[var(--st-accent)]" aria-hidden>
                {String(i + 1).padStart(2, '0')}
              </p>
              <p className="mt-1 text-[15px] font-semibold text-[var(--st-ink)]">{step.title}</p>
              {step.body && <p className="mt-1 text-[14px] leading-relaxed text-[var(--st-ink-2)]">{step.body}</p>}
            </li>
          ))}
        </ol>
      ) : (
        <MerchantHint title="Les étapes de votre savoir-faire" where="Éditeur → Contenu → Comment ça se passe">
          <p className={PROSE}>01 · La matière — 02 · L’atelier — 03 · La pièce</p>
        </MerchantHint>
      );

    case 'ingredients':
      return t.ingredients.items.length > 0 || t.ingredients.body.trim() ? (
        <div className="max-w-3xl">
          {t.ingredients.body.trim() && <p className={`${PROSE} mb-5`}>{t.ingredients.body}</p>}
          {t.ingredients.items.length > 0 && (
            <ul className="grid gap-4 sm:grid-cols-2">
              {t.ingredients.items.filter((i) => i.name.trim()).map((item, i) => (
                <li key={`${item.name}-${i}`} className="flex items-start gap-3">
                  <Leaf className="mt-0.5 h-4 w-4 flex-shrink-0 text-[var(--st-accent)]" strokeWidth={1.6} aria-hidden />
                  <div className="min-w-0">
                    <p className="text-[14px] font-semibold text-[var(--st-ink)]">{item.name}</p>
                    {item.role.trim() && <p className="text-[13px] leading-relaxed text-[var(--st-ink-2)]">{item.role}</p>}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : (
        <MerchantHint title="La composition" where="Éditeur → Contenu → Composition">
          <p className={PROSE}>Cuir tanné végétal — Perles de bois — Fil de coton ciré</p>
        </MerchantHint>
      );

    case 'results':
      return t.caseStudies.items.length > 0 ? (
        <ul className="grid max-w-3xl gap-5 sm:grid-cols-2">
          {t.caseStudies.items.map((item, i) => (
            <li
              key={`${item.client}-${i}`}
              className="p-5"
              style={{ border: '1px solid var(--st-border)', borderRadius: 'var(--st-radius-card)' }}
            >
              {item.client && <p className="text-[12px] uppercase tracking-wide text-[var(--st-ink-3)]">{item.client}</p>}
              <p className="mt-2 text-[13px] text-[var(--st-ink-3)]">Avant — {item.before}</p>
              <p className="mt-1 text-[14px] font-semibold text-[var(--st-ink)]">Après — {item.after}</p>
              {item.quote && <p className="mt-3 text-[14px] italic leading-relaxed text-[var(--st-ink-2)]">« {item.quote} »</p>}
            </li>
          ))}
        </ul>
      ) : (
        <MerchantHint title="Vos résultats clients" where="Éditeur → Contenu → Résultats obtenus">
          <p className={PROSE}>Avant — 12 ventes par mois · Après — 48 ventes par mois</p>
        </MerchantHint>
      );

    case 'gallery':
      return t.gallery.images.length > 0 ? (
        <div>
          {t.gallery.caption.trim() && <p className={`${PROSE} mb-5`}>{t.gallery.caption}</p>}
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {t.gallery.images.slice(0, 8).map((src, i) => (
              <li key={`${src}-${i}`} className="relative aspect-square overflow-hidden" style={{ borderRadius: 'var(--st-radius-media)' }}>
                <StoreImage src={src} alt="" sizes={IMAGE_SIZES.thumb} className="object-cover" />
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <MerchantHint title="Vos photos hors catalogue" where="Éditeur → Contenu → Galerie">
          <p className={PROSE}>L’atelier, la vitrine, vos clients — ce qui n’est pas une fiche produit.</p>
        </MerchantHint>
      );

    case 'sizeGuide': {
      const rows = t.sizeGuide.rows.map((r) => r.cells.split(',').map((c) => c.trim()));
      const head = t.sizeGuide.columns.trim() ? t.sizeGuide.columns.split(',').map((c) => c.trim()) : [];
      if (rows.length === 0) {
        return (
          <MerchantHint title="Votre tableau de mesures" where="Éditeur → Contenu → Guide des tailles">
            <p className={PROSE}>S — 86 — 68 — 92 · M — 90 — 72 — 96</p>
          </MerchantHint>
        );
      }
      const width = Math.max(head.length, ...rows.map((r) => r.length));
      return (
        <div className="max-w-3xl">
          {t.sizeGuide.note.trim() && <p className={`${PROSE} mb-5`}>{t.sizeGuide.note}</p>}
          <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
            <table className="w-full min-w-[420px] border-collapse text-[14px]">
              {head.length > 0 && (
                <thead>
                  <tr>
                    {Array.from({ length: width }, (_, i) => (
                      <th
                        key={i}
                        scope="col"
                        className="border-b px-3 py-2 text-left text-[12px] font-semibold uppercase tracking-wide text-[var(--st-ink-3)]"
                        style={{ borderColor: 'var(--st-border)' }}
                      >
                        {head[i] ?? ''}
                      </th>
                    ))}
                  </tr>
                </thead>
              )}
              <tbody>
                {rows.map((row, i) => (
                  <tr key={i} style={{ background: i % 2 ? 'var(--st-surface-2)' : undefined }}>
                    {Array.from({ length: width }, (_, j) => (
                      <td
                        key={j}
                        className={`px-3 py-2 tabular-nums ${j === 0 ? 'font-semibold text-[var(--st-ink)]' : 'text-[var(--st-ink-2)]'}`}
                      >
                        {row[j] ?? ''}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-4 flex items-center gap-2 text-[12px] text-[var(--st-ink-3)]">
            <Ruler className="h-4 w-4" strokeWidth={1.6} aria-hidden />
            Mesures données par la boutique.
          </p>
        </div>
      );
    }
  }
}

/** Une liste de paires « caractéristique — valeur », alignée sur deux colonnes. */
function SpecList({ rows }: { rows: [string, string][] }) {
  return (
    <dl className="grid max-w-3xl gap-x-10 sm:grid-cols-2">
      {rows.map(([key, value]) => (
        <div
          key={key}
          className="flex items-baseline justify-between gap-4 border-b py-3"
          style={{ borderColor: 'var(--st-border)' }}
        >
          <dt className="text-[13px] text-[var(--st-ink-3)]">{key}</dt>
          <dd className="text-right text-[14px] font-semibold text-[var(--st-ink)]">{value}</dd>
        </div>
      ))}
    </dl>
  );
}
