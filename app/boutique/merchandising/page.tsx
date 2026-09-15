'use client';

// ─────────────────────────────────────────────────────────────────────────────
// Merchandising — le conseiller du catalogue (§17, §18)
//
// « Quels produits mettre en avant ? Lesquels ont besoin de meilleures photos ?
// Lesquels se vendent ensemble ? Crée un lot. »
//
// ── L'écran dit quelque chose AVANT toute IA ────────────────────────────────
//
// Le premier bloc — ce qui manque au catalogue — est compté en base : quatre
// nombres, aucun crédit dépensé, aucune attente. C'est délibéré. Un écran dont
// tout le contenu est derrière un bouton payant est un écran qu'on ouvre une
// fois. Celui-ci est utile même pour un marchand qui n'ouvrira jamais l'IA, et
// c'est aussi ce qui rend l'analyse crédible quand elle arrive : elle commente
// des chiffres déjà affichés.
//
// ── Une proposition n'est pas une décision ──────────────────────────────────
//
// Le modèle propose un lot avec un nom et un prix ; les deux sont MODIFIABLES
// avant acceptation, et le lot naît inactif. Publier est un troisième geste.
// Trois gestes pour mettre un prix barré sur une vitrine publique, c'est le
// bon nombre : c'est de l'argent, et l'IA n'en connaît pas la valeur.
//
// ── Le coût est annoncé avant ───────────────────────────────────────────────
//
// Chaque bouton porte son prix en crédits, le solde reste visible en haut. La
// même règle que le Studio photo et le Studio texte, pour la même raison : une
// action payante dont on découvre le prix après est une action qu'on n'ose
// plus lancer.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import {
  AlertTriangle, Check, Coins, ImageOff, Layers, PenLine, Search,
  Sparkles, Trash2, TrendingUp, EyeOff,
} from 'lucide-react';

import {
  acceptBundle, deleteBundle, getMerchandisingState, runBundleProposals,
  runCatalogAnalysis, setBundleActive,
  type BundleProposal, type BundleRow, type Finding, type CatalogReport,
  type MerchandisingState,
} from '../../actions/merchandising';
import { Button } from '../../../components/ds/Button';
import { Card } from '../../../components/ds/Surface';
import { Badge, type BadgeTone } from '../../../components/ds/Badge';
import { Field } from '../../../components/ds/Field';
import { FirstRun } from '../../../components/ds/EmptyState';
import { unwrap, screenMessage  } from '../../../lib/actionResult';

const ANALYSIS_COST = 2;
const BUNDLE_COST   = 2;

/** Ce que chaque recommandation demande de faire, et où. */
const ACTION_LABEL: Record<Finding['action'], { label: string; href: string }> = {
  // Rédaction, Studio photo et SEO s'ouvrent depuis la liste de l'onglet
  // Produits : l'éditeur s'ouvre sinon sur Général, où aucun de ces outils n'est.
  write_copy:    { label: 'Rédiger la fiche',    href: '/boutique/builder?tab=products' },
  improve_photo: { label: 'Améliorer la photo',  href: '/boutique/builder?tab=products' },
  write_seo:     { label: 'Compléter le SEO',    href: '/boutique/builder?tab=products' },
  set_price:     { label: 'Revoir le prix',      href: '/products' },
  // L'étoile « Mettre en avant » vit dans l'onglet Produits de l'éditeur.
  feature:       { label: 'Mettre en avant',     href: '/boutique/builder?tab=products' },
  restock:       { label: 'Réapprovisionner',    href: '/inventory' },
};

const PRIORITY_TONE: Record<Finding['priority'], BadgeTone> = {
  haute:   'danger',
  moyenne: 'warning',
  basse:   'neutral',
};

function money(n: number, currency = 'HTG') {
  return `${new Intl.NumberFormat('fr-HT', { maximumFractionDigits: 0 }).format(Math.round(n))} ${currency}`;
}

export default function MerchandisingPage() {
  const [state, setState]         = useState<MerchandisingState | null>(null);
  const [report, setReport]       = useState<CatalogReport | null>(null);
  const [proposals, setProposals] = useState<BundleProposal[] | null>(null);
  const [error, setError]         = useState<string | null>(null);
  const [notice, setNotice]       = useState<string | null>(null);
  const [busy, setBusy]           = useState<null | 'analysis' | 'bundles'>(null);
  const [pending, start]          = useTransition();

  const reload = useCallback(async () => {
    try {
      setState(await getMerchandisingState());
    } catch (err) {
      setError(screenMessage(err, 'Chargement impossible.'));
    }
  }, []);

  useEffect(() => { void reload(); }, [reload]);

  const flash = useCallback((message: string) => {
    setNotice(message);
    window.setTimeout(() => setNotice(null), 2600);
  }, []);

  const analyse = useCallback(async () => {
    setError(null);
    setBusy('analysis');
    try {
      const result = unwrap(await runCatalogAnalysis('fr'));
      setReport(result);
      setState((s) => (s ? { ...s, credits: result.remaining } : s));
    } catch (err) {
      setError(screenMessage(err, "L'analyse n'a pas abouti."));
    } finally {
      setBusy(null);
    }
  }, []);

  const propose = useCallback(async () => {
    setError(null);
    setBusy('bundles');
    try {
      const result = unwrap(await runBundleProposals('fr'));
      setProposals(result.proposals);
      setState((s) => (s ? { ...s, credits: result.remaining } : s));
      if (result.proposals.length === 0) {
        flash("Aucun lot pertinent à proposer sur ce catalogue pour l'instant.");
      }
    } catch (err) {
      setError(screenMessage(err, "Les propositions n'ont pas abouti."));
    } finally {
      setBusy(null);
    }
  }, [flash]);

  /** Une écriture : on recharge, on confirme brièvement, on garde l'erreur. */
  const run = useCallback((fn: () => Promise<unknown>, done: string) => {
    setError(null);
    start(async () => {
      try {
        await fn();
        await reload();
        flash(done);
      } catch (err) {
        setError(screenMessage(err, "L'opération a échoué."));
      }
    });
  }, [reload, flash]);

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

  const gaps = [
    { key: 'photo', label: 'sans photo',       count: state.missingPhoto, Icon: ImageOff },
    { key: 'copy',  label: 'sans description', count: state.missingCopy,  Icon: PenLine },
    { key: 'seo',   label: 'sans SEO',         count: state.missingSeo,   Icon: Search },
    { key: 'pub',   label: 'non publiés',      count: state.unpublished,  Icon: EyeOff },
  ];

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-8">
      {/* ── En-tête ── */}
      <header className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-screen font-semibold text-primary dark:text-dark-text">
            Merchandising
          </h1>
          <p className="mt-1 text-body text-text2 dark:text-dark-text2">
            Ce qui manque à votre catalogue, et ce qui se vend ensemble.
          </p>
        </div>

        <span className="inline-flex min-h-touch items-center gap-2 rounded-control bg-surface2 px-4 text-body font-semibold text-primary dark:bg-dark-surface2 dark:text-dark-text">
          <Coins className="h-4 w-4" strokeWidth={1.8} aria-hidden />
          {state.credits} crédit{state.credits > 1 ? 's' : ''} IA
        </span>
      </header>

      {error && (
        <div className="mb-6 flex items-start gap-2 rounded-control bg-danger-sub px-3 py-3">
          <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-danger" strokeWidth={1.8} aria-hidden />
          <p className="text-body text-danger">{error}</p>
        </div>
      )}
      {notice && !error && (
        <div className="mb-6 flex items-center gap-2 rounded-control bg-accent-sub px-3 py-3">
          <Check className="h-4 w-4 flex-shrink-0 text-success" strokeWidth={2.2} aria-hidden />
          <p className="text-body text-primary">{notice}</p>
        </div>
      )}

      {state.productCount === 0 ? (
        <FirstRun
          illustration={<Layers className="h-12 w-12" strokeWidth={1.2} aria-hidden />}
          title="Votre catalogue est vide."
          hint="Créez un premier produit : le conseil de merchandising se lit sur de vraies fiches, pas sur des exemples."
          action={
            <Link href="/products">
              <Button block size="lg" variant="accent">Créer un produit</Button>
            </Link>
          }
        />
      ) : (
        <div className="space-y-8">
          {/* ══ Ce qui manque, compté en base ══ */}
          <section className="space-y-2">
            <h2 className="text-card font-bold text-primary dark:text-dark-text">
              L'état du catalogue
            </h2>
            <p className="text-note text-muted dark:text-dark-muted">
              Sur les {state.productCount} fiches les plus récentes. Compté dans votre base, sans IA.
            </p>

            <div className="grid grid-cols-2 gap-2 pt-2 lg:grid-cols-4">
              {gaps.map(({ key, label, count, Icon }) => (
                <Card key={key} className="flex flex-col gap-2 p-4">
                  <p className="flex items-center gap-2 text-note font-bold uppercase tracking-wide text-muted dark:text-dark-muted">
                    <Icon className="h-4 w-4" strokeWidth={1.8} aria-hidden />
                    {label}
                  </p>
                  <p className={`amount text-amount font-semibold ${count === 0 ? 'text-success' : 'text-primary dark:text-dark-text'}`}>
                    {count}
                  </p>
                </Card>
              ))}
            </div>
          </section>

          {/* ══ §17 — L'analyse ══ */}
          <section className="space-y-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-card font-bold text-primary dark:text-dark-text">
                  Recommandations
                </h2>
                <p className="mt-1 text-note text-muted dark:text-dark-muted">
                  PilotAI lit vos ventes des 90 derniers jours et ce qui manque à chaque fiche.
                </p>
              </div>

              <Button
                variant="soft"
                onClick={() => void analyse()}
                loading={busy === 'analysis'}
                loadingLabel="Analyse…"
                disabled={!state.available || pending}
                icon={<Sparkles className="h-4 w-4" strokeWidth={1.8} aria-hidden />}
              >
                Analyser le catalogue · {ANALYSIS_COST} crédits
              </Button>
            </div>

            {!state.available && (
              <p className="text-note text-muted dark:text-dark-muted">
                Le service d'IA n'est pas configuré sur cette installation. Les chiffres ci-dessus
                restent exacts.
              </p>
            )}

            {report && (
              <Card className="divide-y divide-border p-0 dark:divide-dark-border">
                <p className="p-4 text-body text-text2 dark:text-dark-text2">{report.summary}</p>

                {report.findings.length === 0 ? (
                  <p className="p-4 text-body text-text2 dark:text-dark-text2">
                    Rien à corriger d'urgent sur ces fiches.
                  </p>
                ) : (
                  report.findings.map((f) => {
                    const action = ACTION_LABEL[f.action];
                    return (
                      <div key={`${f.productId}-${f.action}`} className="flex flex-col gap-2 p-4">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-body font-semibold text-primary dark:text-dark-text">
                            {f.productName}
                          </p>
                          <Badge tone={PRIORITY_TONE[f.priority]}>{f.priority}</Badge>
                        </div>
                        <p className="text-note text-muted dark:text-dark-muted">{f.issue}</p>
                        <p className="text-body text-text2 dark:text-dark-text2">{f.recommendation}</p>
                        <Link
                          href={action.href}
                          className="pressable inline-flex min-h-touch items-center text-body font-semibold text-primary underline underline-offset-4 dark:text-accent"
                        >
                          {action.label}
                        </Link>
                      </div>
                    );
                  })
                )}
              </Card>
            )}
          </section>

          {/* ══ §18 — Les lots ══ */}
          <section className="space-y-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-card font-bold text-primary dark:text-dark-text">Lots</h2>
                <p className="mt-1 text-note text-muted dark:text-dark-muted">
                  Plusieurs produits, un prix. Proposés d'après ce que vos clients achètent ensemble.
                </p>
              </div>

              <Button
                variant="soft"
                onClick={() => void propose()}
                loading={busy === 'bundles'}
                loadingLabel="Composition…"
                disabled={!state.available || pending}
                icon={<Layers className="h-4 w-4" strokeWidth={1.8} aria-hidden />}
              >
                Proposer des lots · {BUNDLE_COST} crédits
              </Button>
            </div>

            {proposals?.map((p, index) => (
              <BundleProposalCard
                key={`${p.name}-${index}`}
                proposal={p}
                busy={pending}
                onAccept={(name, price) =>
                  run(
                    () =>
                      acceptBundle({
                        name,
                        description: p.rationale,
                        price,
                        source: 'ai',
                        items: p.items.map((i) => ({ productId: i.productId, quantity: 1 })),
                      }).then(() =>
                        setProposals((list) => (list ?? []).filter((_, i) => i !== index)),
                      ),
                    `« ${name} » créé. Publiez-le quand vous êtes prêt.`,
                  )
                }
                onDismiss={() =>
                  setProposals((list) => (list ?? []).filter((_, i) => i !== index))
                }
              />
            ))}

            {state.bundles.length === 0 && !proposals?.length ? (
              <p className="text-body text-text2 dark:text-dark-text2">
                Aucun lot pour le moment.
              </p>
            ) : (
              state.bundles.map((b) => (
                <BundleCard
                  key={b.id}
                  bundle={b}
                  busy={pending}
                  onToggle={() =>
                    run(
                      () => setBundleActive(b.id, !b.isActive),
                      b.isActive ? `« ${b.name} » retiré de la vitrine.` : `« ${b.name} » est en vitrine.`,
                    )
                  }
                  onDelete={() => run(() => deleteBundle(b.id), `« ${b.name} » supprimé.`)}
                />
              ))
            )}
          </section>
        </div>
      )}
    </div>
  );
}

// ── Une proposition ─────────────────────────────────────────────────────────

function BundleProposalCard({
  proposal, busy, onAccept, onDismiss,
}: {
  proposal: BundleProposal;
  busy: boolean;
  onAccept: (name: string, price: number) => void;
  onDismiss: () => void;
}) {
  const [name, setName]   = useState(proposal.name);
  const [price, setPrice] = useState(String(proposal.suggestedPrice));

  const parsed = Number(price.replace(/\s/g, '').replace(',', '.'));
  const valid  = name.trim().length > 0 && Number.isFinite(parsed) && parsed >= 0;
  const saving = proposal.regularTotal - (Number.isFinite(parsed) ? parsed : 0);

  return (
    <Card className="space-y-4 p-4">
      <div className="flex items-center gap-2">
        <Badge tone="accent">
          <Sparkles className="h-3 w-3" strokeWidth={2} aria-hidden />
          Proposition
        </Badge>
        <span className="text-note text-muted dark:text-dark-muted">
          {proposal.items.length} produits
        </span>
      </div>

      <p className="text-body text-text2 dark:text-dark-text2">{proposal.rationale}</p>

      <ul className="space-y-1">
        {proposal.items.map((i) => (
          <li key={i.productId} className="flex justify-between gap-4 text-body">
            <span className="truncate text-primary dark:text-dark-text">{i.productName}</span>
            <span className="amount flex-shrink-0 text-text2 dark:text-dark-text2">
              {money(i.price)}
            </span>
          </li>
        ))}
        <li className="flex justify-between gap-4 border-t border-border pt-1 text-body dark:border-dark-border">
          <span className="text-muted dark:text-dark-muted">Pièce par pièce</span>
          <span className="amount text-muted line-through dark:text-dark-muted">
            {money(proposal.regularTotal)}
          </span>
        </li>
      </ul>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field
          label="Nom du lot"
          value={name}
          maxLength={120}
          onChange={(e) => setName(e.target.value)}
        />
        <Field
          label="Prix du lot"
          value={price}
          inputMode="decimal"
          suffix={<span className="pr-2 text-note font-bold text-muted dark:text-dark-muted">HTG</span>}
          onChange={(e) => setPrice(e.target.value)}
          hint={
            valid && saving > 0
              ? `Le client économise ${money(saving)}`
              : valid
                ? 'Ce prix ne remise rien.'
                : undefined
          }
          error={valid ? undefined : 'Un nom et un prix sont nécessaires.'}
        />
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <Button
          variant="accent"
          disabled={!valid || busy}
          onClick={() => onAccept(name.trim(), parsed)}
        >
          Accepter ce lot
        </Button>
        <button
          type="button"
          onClick={onDismiss}
          className="pressable min-h-touch text-body text-muted underline underline-offset-4 dark:text-dark-muted"
        >
          Écarter
        </button>
      </div>
    </Card>
  );
}

// ── Un lot du catalogue ─────────────────────────────────────────────────────

function BundleCard({
  bundle, busy, onToggle, onDelete,
}: {
  bundle: BundleRow;
  busy: boolean;
  onToggle: () => void;
  onDelete: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const saving = useMemo(
    () => Math.max(0, bundle.regularTotal - bundle.price),
    [bundle.regularTotal, bundle.price],
  );

  return (
    <Card className="space-y-3 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-body font-semibold text-primary dark:text-dark-text">{bundle.name}</p>
            <Badge tone={bundle.isActive ? 'success' : 'neutral'}>
              {bundle.isActive ? 'En vitrine' : 'Hors vitrine'}
            </Badge>
            {bundle.source === 'ai' && <Badge tone="accent">PilotAI</Badge>}
            {!bundle.inStock && <Badge tone="warning">Une pièce épuisée</Badge>}
          </div>
          <p className="mt-1 truncate text-note text-muted dark:text-dark-muted">
            {bundle.items.map((i) => i.productName).join(' + ')}
          </p>
        </div>

        <div className="flex-shrink-0 text-right">
          <p className="amount text-amount font-semibold text-primary dark:text-dark-text">
            {money(bundle.price)}
          </p>
          {saving > 0 && (
            <p className="amount text-note text-muted line-through dark:text-dark-muted">
              {money(bundle.regularTotal)}
            </p>
          )}
        </div>
      </div>

      {bundle.isActive && !bundle.inStock && (
        <p className="flex items-start gap-2 rounded-control bg-warning-sub px-3 py-2 text-note text-warning">
          <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" strokeWidth={1.8} aria-hidden />
          Une des pièces est épuisée : ce lot est visible mais ne pourra pas être commandé.
        </p>
      )}

      <div className="flex flex-wrap items-center gap-4">
        <Button
          variant={bundle.isActive ? 'quiet' : 'accent'}
          size="sm"
          disabled={busy}
          onClick={onToggle}
          icon={
            bundle.isActive
              ? <EyeOff className="h-4 w-4" strokeWidth={1.8} aria-hidden />
              : <TrendingUp className="h-4 w-4" strokeWidth={1.8} aria-hidden />
          }
        >
          {bundle.isActive ? 'Retirer de la vitrine' : 'Mettre en vitrine'}
        </Button>

        {confirming ? (
          <div className="flex items-center gap-3">
            <Button variant="danger" size="sm" disabled={busy} onClick={onDelete}>
              Supprimer « {bundle.name} »
            </Button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className="pressable min-h-touch text-body text-muted underline underline-offset-4 dark:text-dark-muted"
            >
              Annuler
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setConfirming(true)}
            className="pressable inline-flex min-h-touch items-center gap-2 text-body text-muted underline underline-offset-4 dark:text-dark-muted"
          >
            <Trash2 className="h-4 w-4" strokeWidth={1.8} aria-hidden />
            Supprimer
          </button>
        )}
      </div>
    </Card>
  );
}
