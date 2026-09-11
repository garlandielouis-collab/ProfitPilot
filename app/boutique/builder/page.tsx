'use client';

// ─────────────────────────────────────────────────────────────────────────────
// Store Builder — l'éditeur de vitrine
//
// Cinq onglets, dans l'ordre où un marchand construit sa boutique :
//
//   Général  — comment elle s'appelle, à quelle adresse, où arrivent les
//              commandes. Sans ça rien d'autre n'a de sens.
//   Design   — quel gabarit, quelles couleurs.
//   Contenu  — ce que les sections du gabarit affichent. Sans lui, la moitié
//              d'une page reste invisible : le moteur n'affiche rien qui n'ait
//              été saisi, et le marchand conclut que le gabarit est cassé.
//   Sections — leur ordre et leur activation.
//   Produits — ce qui part en ligne, et le Studio photo.
//
// Un principe tient tout l'écran : ce qui est enregistré est visible tout de
// suite. Le lien « Voir ma boutique » est en permanence en haut, et chaque
// enregistrement invalide le cache de la vitrine côté serveur. Un éditeur où
// l'on ne sait pas si le changement est passé produit des marchands qui
// enregistrent trois fois.
//
// Il complète /boutique (paiements, SEO, commandes) au lieu de le remplacer :
// les réglages qui existaient déjà n'ont pas été déplacés.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import {
  ExternalLink, Check, AlertTriangle, Sparkles, Search, Globe,
  Palette, Package, Settings2, Eye, EyeOff, Loader2, PenLine, LayoutList, Star,
} from 'lucide-react';
import {
  getBuilderState, saveGeneral, saveDesign, setCustomDomain,
  toggleProductPublication, setAllProductsPublication, toggleProductFeatured,
  type BuilderState, type BuilderProduct,
} from '../../actions/storeBuilder';
import { TEMPLATES, templateGroups, templateSections } from '../../../components/store/templates/registry';
import { ContentTab } from './ContentTab';
import { SectionsTab } from './SectionsTab';
import { ImageEnhancerModal } from '../../../components/store/ImageEnhancerModal';
import { CopyStudioModal } from '../../../components/store/CopyStudioModal';
import {
  slugify, storeRootDomain, readableInk, contrastRatio, brandPresetFor,
  FONT_CHOICES, type ThemeConfig, type TemplateId,
} from '../../../lib/storeTheme';
import { Button } from '../../../components/ds/Button';
import { Card } from '../../../components/ds/Surface';
import { Field, TextField } from '../../../components/ds/Field';
import { Switch } from '../../../components/ds/Switch';

type Tab = 'general' | 'design' | 'content' | 'sections' | 'products';

const TABS: Array<{ id: Tab; label: string; Icon: typeof Settings2 }> = [
  { id: 'general',  label: 'Général',  Icon: Settings2 },
  { id: 'design',   label: 'Design',   Icon: Palette },
  { id: 'content',  label: 'Contenu',  Icon: PenLine },
  { id: 'sections', label: 'Sections', Icon: LayoutList },
  { id: 'products', label: 'Produits', Icon: Package },
];

export default function StoreBuilderPage() {
  const [state, setState]   = useState<BuilderState | null>(null);
  const [tab, setTab]       = useState<Tab>('general');
  const [error, setError]   = useState<string | null>(null);
  const [saved, setSaved]   = useState(false);
  const [pending, start]    = useTransition();

  const reload = useCallback(async () => {
    try {
      setState(await getBuilderState());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Chargement impossible.');
    }
  }, []);

  useEffect(() => { void reload(); }, [reload]);

  // Un renvoi peut viser un onglet (`?tab=products` depuis le merchandising).
  // Lu après le montage : `useSearchParams` exigerait une frontière Suspense.
  useEffect(() => {
    const wanted = new URLSearchParams(window.location.search).get('tab');
    const match = TABS.find((t) => t.id === wanted);
    if (match) setTab(match.id);
  }, []);

  /** Enregistre, puis affiche une confirmation brève — et une erreur durable. */
  const run = useCallback((fn: () => Promise<unknown>) => {
    setError(null);
    start(async () => {
      try {
        await fn();
        await reload();
        setSaved(true);
        window.setTimeout(() => setSaved(false), 2200);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Enregistrement impossible.');
      }
    });
  }, [reload]);

  if (!state) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <span
          className="h-8 w-8 animate-spin rounded-pill border-2 border-border border-t-primary"
          aria-label="Chargement"
        />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-8">
      {/* ── En-tête ── */}
      <header className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-screen font-semibold text-primary dark:text-dark-text">
            Ma boutique en ligne
          </h1>
          <p className="mt-1 text-body text-text2 dark:text-dark-text2">
            {state.isActive
              ? 'Votre boutique est en ligne.'
              : "Votre boutique n'est pas encore publiée."}
          </p>
        </div>

        <a
          href={state.publicUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex min-h-action items-center gap-2 rounded-surface border border-border px-4 text-body font-semibold text-primary transition hover:bg-surface dark:border-dark-border dark:text-dark-text"
        >
          <ExternalLink className="h-4 w-4" strokeWidth={1.8} aria-hidden />
          Voir ma boutique
        </a>
      </header>

      {/* ── Messages ── */}
      {error && (
        <div className="mb-6 flex items-start gap-2 rounded-control bg-danger-sub px-3 py-3">
          <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-danger" strokeWidth={1.8} aria-hidden />
          <p className="text-body text-danger">{error}</p>
        </div>
      )}
      {saved && !error && (
        <div className="mb-6 flex items-center gap-2 rounded-control bg-accent-sub px-3 py-3">
          <Check className="h-4 w-4 flex-shrink-0 text-success" strokeWidth={2.2} aria-hidden />
          <p className="text-body text-primary">Enregistré.</p>
        </div>
      )}

      {/* ── Onglets ── */}
      <div
        role="tablist"
        aria-label="Sections de l'éditeur"
        className="mb-8 -mx-4 flex gap-1 overflow-x-auto border-b border-border px-4 sm:mx-0 sm:px-0 dark:border-dark-border"
      >
        {TABS.map(({ id, label, Icon }) => (
          <button
            key={id}
            role="tab"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
            className={[
              'flex min-h-action items-center gap-2 border-b-2 px-4 text-body font-semibold transition',
              tab === id
                ? 'border-accent text-primary dark:text-dark-text'
                : 'border-transparent text-muted hover:text-primary dark:text-dark-muted',
            ].join(' ')}
          >
            <Icon className="h-4 w-4" strokeWidth={1.8} aria-hidden />
            {label}
          </button>
        ))}
      </div>

      {tab === 'general'  && <GeneralTab  state={state} run={run} pending={pending} />}
      {tab === 'design'   && <DesignTab   state={state} run={run} pending={pending} />}
      {tab === 'content'  && <ContentTab   state={state} run={run} pending={pending} />}
      {tab === 'sections' && <SectionsTab  state={state} run={run} pending={pending} />}
      {tab === 'products' && <ProductsTab state={state} run={run} pending={pending} onRefresh={reload} />}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// Onglet Général
// ═════════════════════════════════════════════════════════════════════════════

function GeneralTab({
  state, run, pending,
}: {
  state: BuilderState;
  run: (fn: () => Promise<unknown>) => void;
  pending: boolean;
}) {
  const [storeName, setStoreName] = useState(state.storeName);
  const [tagline, setTagline]     = useState(state.tagline);
  const [slug, setSlug]           = useState(state.slug);
  const [whatsapp, setWhatsapp]   = useState(state.whatsappNumber);
  const [isActive, setIsActive]   = useState(state.isActive);
  const [domain, setDomain]       = useState(state.customDomain ?? '');

  const root = storeRootDomain();

  return (
    <div className="flex flex-col gap-8">
      <Card className="p-4">
        <h2 className="mb-4 text-card font-semibold text-primary dark:text-dark-text">
          Identité
        </h2>
        <div className="flex flex-col gap-4">
          <Field
            label="Nom de la boutique"
            value={storeName}
            onChange={(e) => setStoreName(e.target.value)}
            placeholder={state.businessName}
          />
          <TextField
            label="Phrase d'accroche"
            hint="Une ligne. Elle apparaît sous le nom, sur la page d'accueil."
            rows={2}
            value={tagline}
            onChange={(e) => setTagline(e.target.value)}
          />
        </div>
      </Card>

      <Card className="p-4">
        <h2 className="mb-1 text-card font-semibold text-primary dark:text-dark-text">
          Adresse
        </h2>
        <p className="mb-4 text-note text-muted dark:text-dark-muted">
          C'est le lien que vous partagerez à vos clients.
        </p>

        <Field
          label="Adresse de la boutique"
          value={slug}
          onChange={(e) => setSlug(slugify(e.target.value))}
          suffix={`.${root}`}
          hint="Lettres minuscules, chiffres et tirets."
        />

        <div className="mt-6">
          <Field
            label="Nom de domaine personnalisé (facultatif)"
            value={domain}
            onChange={(e) => setDomain(e.target.value)}
            placeholder="maboutique.com"
            prefix={<Globe className="h-4 w-4" strokeWidth={1.8} aria-hidden />}
            hint={
              domain
                ? `Chez votre registrar, créez un CNAME de « ${domain} » vers cname.vercel-dns.com`
                : 'Si vous avez acheté un domaine, indiquez-le ici.'
            }
          />
          {domain !== (state.customDomain ?? '') && (
            <Button
              variant="quiet"
              size="sm"
              className="mt-3"
              loading={pending}
              onClick={() => run(() => setCustomDomain(domain || null))}
            >
              Enregistrer le domaine
            </Button>
          )}
        </div>
      </Card>

      <Card className="p-4">
        <h2 className="mb-1 text-card font-semibold text-primary dark:text-dark-text">
          Commandes WhatsApp
        </h2>
        <p className="mb-4 text-note text-muted dark:text-dark-muted">
          Le numéro qui reçoit les commandes. Sans lui, le bouton « Commander sur
          WhatsApp » ne s'affiche pas sur la boutique.
        </p>
        <Field
          label="Numéro WhatsApp"
          type="tel"
          value={whatsapp}
          onChange={(e) => setWhatsapp(e.target.value)}
          placeholder="3712 3456"
          hint="Format haïtien ou international."
        />
      </Card>

      <Card className="p-4">
        <Switch
          checked={isActive}
          onChange={setIsActive}
          label="Boutique en ligne"
          hint={isActive
            ? 'Vos clients peuvent y accéder.'
            : 'Personne ne peut y accéder pour le moment.'}
        />
      </Card>

      <Button
        variant="accent"
        size="lg"
        block
        loading={pending}
        loadingLabel="Enregistrement…"
        onClick={() =>
          run(() =>
            saveGeneral({
              storeName, tagline, slug,
              logoUrl: state.logoUrl,
              whatsappNumber: whatsapp,
              isActive,
            }),
          )
        }
      >
        Enregistrer
      </Button>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// Onglet Design
// ═════════════════════════════════════════════════════════════════════════════

function DesignTab({
  state, run, pending,
}: {
  state: BuilderState;
  run: (fn: () => Promise<unknown>) => void;
  pending: boolean;
}) {
  const [templateId, setTemplateId] = useState(state.templateId);
  const [theme, setTheme] = useState<ThemeConfig>(state.theme);

  // Le marchand a-t-il déjà choisi ses couleurs ? La réponse vient de la base
  // au chargement ; elle devient « oui » dès qu'il touche un sélecteur ici,
  // sans attendre l'enregistrement — sinon changer de gabarit juste après
  // effacerait la couleur qu'il vient de poser.
  const [ownsPalette, setOwnsPalette] = useState(state.ownsPalette);

  function patch<K extends keyof ThemeConfig>(key: K, value: Partial<ThemeConfig[K]>) {
    if (key === 'palette' || key === 'typography') setOwnsPalette(true);
    setTheme((t) => ({ ...t, [key]: { ...t[key], ...value } }));
  }

  /**
   * Choisir un gabarit, couleurs comprises.
   *
   * L'aperçu montre la boutique dans la palette du gabarit tant que le marchand
   * n'a pas choisi la sienne. L'éditeur doit dire la même chose : sans cela, il
   * enregistrait le nouveau gabarit avec les anciennes couleurs — et le
   * marchand qui venait de voir du terracotta dans l'aperçu obtenait de
   * l'émeraude en ligne.
   */
  function chooseTemplate(id: TemplateId) {
    setTemplateId(id);
    if (ownsPalette) return;
    const preset = brandPresetFor(id);
    setTheme((t) => ({ ...t, palette: preset.palette, typography: preset.typography }));
  }

  /**
   * Rendre les couleurs au gabarit.
   *
   * Le chemin de retour qui manquait : une palette enregistrée tenait pour
   * toujours, et le marchand qui voulait retrouver les couleurs de chaque
   * gabarit n'avait aucun geste pour le dire. Effectif à l'enregistrement,
   * comme le reste de l'onglet.
   */
  function resetToTemplateColors() {
    setOwnsPalette(false);
    const preset = brandPresetFor(templateId);
    setTheme((t) => ({ ...t, palette: preset.palette, typography: preset.typography }));
  }

  // Le contraste du bouton d'achat, calculé en direct. Le marchand choisit sa
  // couleur de marque ; il doit savoir, AVANT de publier, si le libellé de son
  // bouton « Commander » sera lisible dehors à midi. C'est le contrôle du §31
  // de la constitution, transposé à une couleur que nous ne choisissons pas.
  const accentInk   = readableInk(theme.palette.accent);
  const accentRatio = contrastRatio(theme.palette.accent, accentInk);

  return (
    <div className="flex flex-col gap-8">
      {/* ── Le choix du gabarit ────────────────────────────────────────────
          Dix-neuf gabarits. Trois choses les rendent choisissables :

          1. La VIGNETTE. Une maquette vaut les trois lignes qu'elle remplace,
             et se lit en une seconde. Elle ne montre PAS la boutique de ce
             marchand — c'est un dessin, et le lien d'aperçu juste dessous
             existe précisément pour montrer la vraie.
          2. Les GROUPES. « Par métier », « Marques en ligne », « Par rayon » :
             trois questions courtes à la place d'un catalogue de dix-neuf.
          3. Le DÉTAIL À LA DEMANDE. Les points forts et le plan de page ne
             s'affichent que sur le gabarit sélectionné. Dix-neuf fois quatre
             lignes de prose, personne ne les lit — et celui qui les lirait
             aurait perdu de vue la première carte. */}
      <section>
        <h2 className="mb-1 text-card font-semibold text-primary dark:text-dark-text">
          Gabarit
        </h2>
        <p className="mb-5 text-note text-muted dark:text-dark-muted">
          Il décide de la mise en page. Vous pouvez en changer à tout moment.
        </p>

        <div className="flex flex-col gap-7">
          {templateGroups(state.templateId).map((group) => (
            <div key={group.family}>
              <h3 className="text-body font-semibold text-primary dark:text-dark-text">
                {group.title}
              </h3>
              <p className="mb-3 mt-0.5 text-note text-muted dark:text-dark-muted">
                {group.hint}
              </p>

              <div className="flex flex-col gap-3">
                {group.templates.map((t) => {
                  const active = templateId === t.id;
                  // Ce que ce gabarit met sur la page d'accueil, dans son
                  // ordre. Cinq suffisent : au-delà, la liste cesse d'être un
                  // repère et devient un sommaire que personne ne lit.
                  const plan = templateSections(t.id)
                    .slice(0, 5)
                    .map((s) => s.label)
                    .join(' · ');

                  return (
                    <div
                      key={t.id}
                      className={[
                        'overflow-hidden rounded-surface border transition',
                        active
                          ? 'border-accent bg-accent-sub'
                          : 'border-border dark:border-dark-border',
                      ].join(' ')}
                    >
                      {/* Le bouton porte la sélection ; le lien d'aperçu vit en
                          dehors de lui. Un lien imbriqué dans un bouton n'est
                          pas du HTML valide, et le clavier n'y arrive qu'une
                          fois sur deux. */}
                      <button
                        type="button"
                        onClick={() => chooseTemplate(t.id)}
                        aria-pressed={active}
                        className="w-full p-3 text-left transition hover:bg-surface dark:hover:bg-white/5"
                      >
                        <div className="flex items-start gap-3">
                          <TemplatePreview templateId={t.id} src={t.preview} />

                          <div className="min-w-0 flex-1 pt-0.5">
                            <div className="flex items-start justify-between gap-2">
                              <p className="text-card font-semibold text-primary dark:text-dark-text">
                                {t.name}
                              </p>
                              {active && (
                                <Check
                                  className="mt-0.5 h-5 w-5 flex-shrink-0 text-success"
                                  strokeWidth={2.4}
                                  aria-hidden
                                />
                              )}
                            </div>
                            <p className="mt-0.5 text-body text-text2 dark:text-dark-text2">
                              {t.tagline}
                            </p>
                            <p className="mt-1.5 text-note text-muted dark:text-dark-muted">
                              {t.bestFor.join(', ')}
                            </p>
                          </div>
                        </div>

                        {active && (
                          <div className="mt-3 border-t border-border pt-3 dark:border-dark-border">
                            <ul className="flex flex-col gap-1">
                              {t.highlights.map((h) => (
                                <li key={h} className="text-note text-muted dark:text-dark-muted">
                                  — {h}
                                </li>
                              ))}
                            </ul>
                            <p className="mt-2 text-note text-muted dark:text-dark-muted">
                              Sa page : {plan}…
                            </p>
                          </div>
                        )}
                      </button>

                      <div className="border-t border-border px-3 py-2 dark:border-dark-border">
                        <a
                          href={`/apercu/${t.id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex min-h-action items-center gap-2 text-note font-semibold text-primary underline underline-offset-4 dark:text-dark-text"
                        >
                          <Eye className="h-4 w-4" strokeWidth={1.8} aria-hidden />
                          Voir ma boutique dans ce gabarit
                        </a>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </section>

      <Card className="p-4">
        <h2 className="mb-1 text-card font-semibold text-primary dark:text-dark-text">
          Couleurs
        </h2>
        {/* D'où viennent les couleurs, dit AVANT de changer de gabarit :
            choisies, elles tiennent sur les vingt-deux ; sinon, elles suivent
            le gabarit. Sans cette ligne, le marchand découvre la règle en
            voyant tous ses gabarits porter la même teinte. */}
        <p className="mb-4 text-note text-muted dark:text-dark-muted">
          {ownsPalette
            ? 'Vos couleurs : elles restent les mêmes quel que soit le gabarit.'
            : `Les couleurs du gabarit « ${TEMPLATES[templateId as TemplateId]?.name ?? templateId} ». Elles changent avec lui tant que vous n'y touchez pas.`}
        </p>
        {ownsPalette && (
          <Button variant="quiet" size="sm" className="mb-4" onClick={resetToTemplateColors}>
            Reprendre les couleurs du gabarit
          </Button>
        )}

        <div className="flex flex-col gap-4">
          <ColorField
            label="Couleur principale"
            hint="Navigation, titres, aplats sombres."
            value={theme.palette.primary}
            onChange={(primary) => patch('palette', { primary })}
          />
          <ColorField
            label="Couleur d'action"
            hint="Le bouton qui déclenche l'achat."
            value={theme.palette.accent}
            onChange={(accent) => patch('palette', { accent })}
          />
        </div>

        {/* L'aperçu du bouton, avec son ratio réel. */}
        <div className="mt-6">
          <p className="mb-2 text-note font-semibold uppercase tracking-wider text-muted dark:text-dark-muted">
            Votre bouton d'achat
          </p>
          <div
            className="flex min-h-hero items-center justify-center rounded-surface text-body font-semibold"
            style={{ background: theme.palette.accent, color: accentInk }}
          >
            Commander
          </div>
          <p
            className="mt-2 text-note"
            style={{ color: accentRatio >= 4.5 ? '#0B7F54' : '#B45309' }}
          >
            {accentRatio >= 4.5
              ? `Contraste ${accentRatio.toFixed(1)}:1 — lisible en plein soleil.`
              : `Contraste ${accentRatio.toFixed(1)}:1 — trop faible. Choisissez une couleur plus foncée ou plus claire : ce bouton sera illisible dehors.`}
          </p>
        </div>
      </Card>

      <Card className="p-4">
        <h2 className="mb-4 text-card font-semibold text-primary dark:text-dark-text">
          Typographie
        </h2>
        <div className="flex flex-col gap-2">
          {(Object.keys(FONT_CHOICES) as Array<keyof typeof FONT_CHOICES>).map((key) => {
            const active = theme.typography.heading === key;
            return (
              <button
                key={key}
                type="button"
                onClick={() => patch('typography', { heading: key })}
                aria-pressed={active}
                className={[
                  'flex min-h-action items-center justify-between rounded-control border px-4 transition',
                  active ? 'border-accent bg-accent-sub' : 'border-border dark:border-dark-border',
                ].join(' ')}
              >
                <span
                  className="text-card text-primary dark:text-dark-text"
                  style={{ fontFamily: FONT_CHOICES[key].stack }}
                >
                  {FONT_CHOICES[key].label}
                </span>
                {active && <Check className="h-4 w-4 text-success" strokeWidth={2.4} aria-hidden />}
              </button>
            );
          })}
        </div>
      </Card>

      <Card className="p-4">
        <h2 className="mb-4 text-card font-semibold text-primary dark:text-dark-text">
          Catalogue
        </h2>

        <Switch
          checked={theme.catalog.mode === 'selected'}
          onChange={(on) => patch('catalog', { mode: on ? 'selected' : 'all' })}
          label="Choisir les produits à publier"
          hint={
            theme.catalog.mode === 'selected'
              ? `Seuls les produits cochés sont en ligne (${state.publishedCount} sur ${state.products.length}).`
              : 'Tout votre inventaire est en ligne.'
          }
        />

        <div className="mt-4">
          <Switch
            checked={theme.catalog.hideOutOfStock}
            onChange={(hideOutOfStock) => patch('catalog', { hideOutOfStock })}
            label="Masquer les produits épuisés"
            hint="Sinon ils restent visibles, marqués « Épuisé »."
          />
        </div>
      </Card>

      <Card className="p-4">
        <h2 className="mb-1 text-card font-semibold text-primary dark:text-dark-text">
          Commande par WhatsApp
        </h2>
        <p className="mb-4 text-note text-muted dark:text-dark-muted">
          Ajoute un bouton « Commander sur WhatsApp » au panier et aux fiches
          produit. Le panier part en message tout prêt.
        </p>
        <Switch
          checked={theme.whatsapp.enabled}
          onChange={(enabled) => patch('whatsapp', { enabled })}
          disabled={!state.whatsappNumber}
          label="Activer la commande WhatsApp"
          hint={
            state.whatsappNumber
              ? `Les commandes arriveront au ${state.whatsappNumber}.`
              : "Ajoutez un numéro dans l'onglet Général pour l'activer."
          }
        />
      </Card>

      <Button
        variant="accent"
        size="lg"
        block
        loading={pending}
        loadingLabel="Enregistrement…"
        onClick={() => run(() => saveDesign({ templateId, theme, ownsPalette }))}
      >
        Enregistrer le design
      </Button>
    </div>
  );
}

/**
 * La vignette d'un gabarit dans le sélecteur.
 *
 * Une maquette quand ce gabarit en a une, la PALETTE du gabarit sinon. Jamais
 * la vignette d'un autre : un marchand qui choisit sur une image doit obtenir
 * la page de cette image, et un aperçu emprunté est un mensonge silencieux —
 * il ne se découvre qu'après publication.
 *
 * `<img>` et non `next/image` : ces fichiers sont servis depuis `public/` à une
 * taille fixe et connue, l'optimiseur n'a rien à y gagner. `object-top` cadre
 * sur la bannière, qui est ce qui distingue deux gabarits ; `loading="lazy"`
 * parce que dix-neuf vignettes se chargeraient sinon toutes à l'ouverture de
 * l'onglet, sur une connexion souvent comptée.
 */
function TemplatePreview({ templateId, src }: { templateId: TemplateId; src: string | null }) {
  const wrapper =
    'w-[104px] flex-shrink-0 overflow-hidden rounded-control border border-border '
    + 'dark:border-dark-border sm:w-[148px]';

  if (src) {
    return (
      <div className={wrapper} style={{ aspectRatio: '4 / 3' }}>
        <img
          src={src}
          alt=""
          loading="lazy"
          decoding="async"
          width={600}
          height={450}
          className="h-full w-full object-cover object-top"
        />
      </div>
    );
  }

  // Pas de maquette : sa palette, en trois aplats. L'aplat du haut est
  // l'en-tête, la barre colorée est le bouton d'achat — c'est ce que le
  // marchand reconnaîtra sur sa page.
  const { palette } = brandPresetFor(templateId);
  return (
    <div className={wrapper} style={{ aspectRatio: '4 / 3', background: palette.surface }} aria-hidden>
      <div className="h-[34%] w-full" style={{ background: palette.primary }} />
      <div className="flex h-[66%] flex-col justify-end gap-1.5 p-2">
        <span className="block h-1.5 w-2/3 rounded-full" style={{ background: palette.surface2 }} />
        <span className="block h-1.5 w-1/2 rounded-full" style={{ background: palette.surface2 }} />
        <span className="block h-3 w-3/5 rounded-sm" style={{ background: palette.accent }} />
      </div>
    </div>
  );
}

function ColorField({
  label, hint, value, onChange,
}: {
  label: string;
  hint: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <p className="text-body font-semibold text-primary dark:text-dark-text">{label}</p>
      <p className="mt-0.5 text-note text-muted dark:text-dark-muted">{hint}</p>
      <div className="mt-2 flex items-center gap-3">
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-label={label}
          className="h-touch w-touch cursor-pointer rounded-control border border-border bg-transparent dark:border-dark-border"
        />
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-label={`${label}, code hexadécimal`}
          className="min-h-touch w-32 rounded-control border border-border bg-white px-3 text-body uppercase tabular-nums text-primary outline-none focus:border-accent dark:border-dark-border dark:bg-dark-surface2 dark:text-dark-text"
        />
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// Onglet Produits
// ═════════════════════════════════════════════════════════════════════════════

function ProductsTab({
  state, run, pending, onRefresh,
}: {
  state: BuilderState;
  run: (fn: () => Promise<unknown>) => void;
  pending: boolean;
  onRefresh: () => Promise<void>;
}) {
  const [query, setQuery]     = useState('');
  const [studio, setStudio]   = useState<BuilderProduct | null>(null);
  const [copy, setCopy]       = useState<BuilderProduct | null>(null);
  const [busyId, setBusyId]   = useState<string | null>(null);
  const [starBusyId, setStarBusyId] = useState<string | null>(null);

  const selectionMode = state.theme.catalog.mode === 'selected';
  // L'étoile n'a d'effet visible que si une section qui la lit est affichée.
  const featuredShown = state.sections.some(
    (s) => (s.key === 'featured' || s.key === 'featured_product') && s.enabled,
  );

  async function toggleFeatured(product: BuilderProduct) {
    setStarBusyId(product.id);
    try {
      await toggleProductFeatured(product.id, !product.is_featured);
      await onRefresh();
    } finally {
      setStarBusyId(null);
    }
  }

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return state.products;
    return state.products.filter(
      (p) => p.name.toLowerCase().includes(q) || (p.category ?? '').toLowerCase().includes(q),
    );
  }, [state.products, query]);

  async function toggle(product: BuilderProduct) {
    setBusyId(product.id);
    try {
      await toggleProductPublication(product.id, !product.is_published_to_store);
      await onRefresh();
    } finally {
      setBusyId(null);
    }
  }

  if (state.products.length === 0) {
    return (
      <Card className="p-8 text-center">
        <Package className="mx-auto h-10 w-10 text-muted" strokeWidth={1.3} aria-hidden />
        <p className="mt-4 text-card font-semibold text-primary dark:text-dark-text">
          Aucun produit dans votre inventaire
        </p>
        <p className="mt-2 text-body text-text2 dark:text-dark-text2">
          Ajoutez vos produits, ils apparaîtront ici pour être publiés.
        </p>
        <Link href="/products" className="mt-6 inline-block">
          <Button variant="accent">Ajouter un produit</Button>
        </Link>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {!selectionMode && (
        <div className="flex items-start gap-2 rounded-control bg-accent-sub px-3 py-3">
          <Eye className="mt-0.5 h-4 w-4 flex-shrink-0 text-primary" strokeWidth={1.8} aria-hidden />
          <p className="text-body text-primary">
            Tout votre inventaire est en ligne. Pour choisir produit par produit,
            activez « Choisir les produits à publier » dans l'onglet Design.
          </p>
        </div>
      )}

      {/* Ce que fait l'étoile, et quand elle ne se voit pas : aucune section qui
          la lit n'est affichée sur la page d'accueil de ce gabarit. */}
      <p className="flex items-start gap-2 text-note text-muted dark:text-dark-muted">
        <Star className="mt-0.5 h-4 w-4 flex-shrink-0" strokeWidth={1.8} aria-hidden />
        {featuredShown
          ? "L'étoile met un produit en avant : il apparaît dans « Produits mis en avant » ou « Produit à la une » sur votre page d'accueil, s'il est en ligne."
          : "L'étoile met un produit en avant, mais votre page d'accueil n'affiche ni « Produits mis en avant » ni « Produit à la une » : ajoutez ou activez l'une d'elles dans l'onglet Sections."}
      </p>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-[200px] flex-1">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted"
            strokeWidth={1.8}
            aria-hidden
          />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Rechercher un produit…"
            aria-label="Rechercher un produit"
            className="min-h-touch w-full rounded-control border border-border bg-white pl-9 pr-3 text-body text-primary outline-none focus:border-accent dark:border-dark-border dark:bg-dark-surface2 dark:text-dark-text"
          />
        </div>

        {selectionMode && (
          <>
            <Button
              variant="quiet"
              size="sm"
              loading={pending}
              onClick={() => run(() => setAllProductsPublication(true))}
            >
              Tout publier
            </Button>
            <Button
              variant="quiet"
              size="sm"
              loading={pending}
              onClick={() => run(() => setAllProductsPublication(false))}
            >
              Tout retirer
            </Button>
          </>
        )}
      </div>

      <ul className="flex flex-col gap-2">
        {visible.map((product) => {
          const image = product.enhanced_image_url ?? product.image_url;
          const busy  = busyId === product.id;

          return (
            <li key={product.id}>
              <Card className="flex items-center gap-3 p-3">
                <div className="h-14 w-14 flex-shrink-0 overflow-hidden rounded-inner bg-surface2 dark:bg-dark-surface2">
                  {image ? (
                    // eslint-disable-next-line @next/next/no-img-element -- photo marchand, hôte libre
                    <img src={image} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-muted">
                      <Package className="h-5 w-5" strokeWidth={1.5} aria-hidden />
                    </div>
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <p className="truncate text-body font-semibold text-primary dark:text-dark-text">
                    {product.name}
                  </p>
                  <p className="text-note text-muted dark:text-dark-muted">
                    {product.category ?? 'Sans catégorie'}
                    {product.stock <= 0 && ' — épuisé'}
                    {product.enhanced_image_url && ' — photo studio'}
                  </p>
                </div>

                {/* La rédaction avant la photo dans l'ordre de lecture : un
                    produit sans description ne se vend pas, un produit avec une
                    photo moyenne se vend quand même. */}
                <button
                  type="button"
                  onClick={() => setCopy(product)}
                  title="Écrire la fiche produit"
                  className="flex h-touch w-touch flex-shrink-0 items-center justify-center rounded-control text-primary transition hover:bg-surface dark:text-dark-text dark:hover:bg-white/5"
                  aria-label={`Rédaction PilotAI pour ${product.name}`}
                >
                  <PenLine className="h-5 w-5" strokeWidth={1.8} aria-hidden />
                </button>

                <button
                  type="button"
                  onClick={() => setStudio(product)}
                  disabled={!product.image_url}
                  title={
                    product.image_url
                      ? 'Améliorer la photo'
                      : "Ce produit n'a pas de photo à améliorer"
                  }
                  className="flex h-touch w-touch flex-shrink-0 items-center justify-center rounded-control text-primary transition hover:bg-surface disabled:opacity-30 dark:text-dark-text dark:hover:bg-white/5"
                  aria-label={`Studio photo pour ${product.name}`}
                >
                  <Sparkles className="h-5 w-5" strokeWidth={1.8} aria-hidden />
                </button>

                {/* Hors du mode sélection aussi : un produit en avant se voit
                    quel que soit le mode de publication du catalogue. */}
                <button
                  type="button"
                  onClick={() => void toggleFeatured(product)}
                  disabled={starBusyId === product.id}
                  aria-pressed={product.is_featured}
                  title={product.is_featured ? 'Ne plus mettre en avant' : 'Mettre en avant'}
                  aria-label={
                    product.is_featured
                      ? `Ne plus mettre ${product.name} en avant`
                      : `Mettre ${product.name} en avant`
                  }
                  className="flex h-touch w-touch flex-shrink-0 items-center justify-center rounded-control transition hover:bg-surface dark:hover:bg-white/5"
                >
                  {starBusyId === product.id ? (
                    <Loader2 className="h-5 w-5 animate-spin text-muted" strokeWidth={1.8} aria-hidden />
                  ) : product.is_featured ? (
                    <Star className="h-5 w-5 fill-current text-primary dark:text-dark-text" strokeWidth={1.8} aria-hidden />
                  ) : (
                    <Star className="h-5 w-5 text-muted" strokeWidth={1.8} aria-hidden />
                  )}
                </button>

                {selectionMode && (
                  <button
                    type="button"
                    onClick={() => void toggle(product)}
                    disabled={busy}
                    aria-pressed={product.is_published_to_store}
                    aria-label={
                      product.is_published_to_store
                        ? `Retirer ${product.name} de la boutique`
                        : `Publier ${product.name} sur la boutique`
                    }
                    className="flex h-touch w-touch flex-shrink-0 items-center justify-center rounded-control transition hover:bg-surface dark:hover:bg-white/5"
                  >
                    {busy ? (
                      <Loader2 className="h-5 w-5 animate-spin text-muted" strokeWidth={1.8} aria-hidden />
                    ) : product.is_published_to_store ? (
                      <Eye className="h-5 w-5 text-success" strokeWidth={1.8} aria-hidden />
                    ) : (
                      <EyeOff className="h-5 w-5 text-muted" strokeWidth={1.8} aria-hidden />
                    )}
                  </button>
                )}
              </Card>
            </li>
          );
        })}
      </ul>

      {visible.length === 0 && (
        <p className="py-8 text-center text-body text-muted dark:text-dark-muted">
          Aucun produit ne correspond à « {query} ».
        </p>
      )}

      {studio && (
        <ImageEnhancerModal
          product={studio}
          open
          onClose={() => setStudio(null)}
          onApplied={() => void onRefresh()}
        />
      )}

      {copy && (
        <CopyStudioModal
          productId={copy.id}
          productName={copy.name}
          open
          onClose={() => setCopy(null)}
          onSaved={() => void onRefresh()}
        />
      )}
    </div>
  );
}
