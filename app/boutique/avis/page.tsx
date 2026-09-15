'use client';

// ─────────────────────────────────────────────────────────────────────────────
// Les avis clients — relire, publier, refuser (§27)
//
// ── Pourquoi cet écran existe ───────────────────────────────────────────────
//
// Un avis déposé arrive en `pending`, et `v_product_ratings` ne compte que les
// `published`. Sans cet écran, la chaîne s'arrête ici : un client note, la note
// n'atteint jamais la fiche, et le marchand se demande pourquoi ses étoiles ne
// s'affichent pas. C'était le cas jusqu'à aujourd'hui — la table était vide aux
// deux bouts, faute du formulaire d'un côté et de cette page de l'autre.
//
// ── Ce que l'écran dit en premier ───────────────────────────────────────────
//
// Ce qui attend. Pas un tableau de bord, pas une moyenne, pas un graphique : la
// seule question que le marchand se pose en ouvrant cette page est « est-ce que
// quelqu'un attend que je le lise ». Les avis publiés et refusés sont en
// dessous, consultables, parce qu'on revient parfois sur une décision — jamais
// au-dessus, parce qu'ils ne demandent rien.
//
// ── La limite, affichée au marchand et pas seulement documentée ─────────────
//
// Le bandeau le dit en toutes lettres : on refuse un propos, on ne fabrique pas
// un éloge. Ce n'est pas une précaution juridique, c'est la raison pour laquelle
// la note de ses fiches vaut quelque chose aux yeux de ses clients — et c'est
// garanti par la base, qui n'accorde aucune politique d'INSERT sur `reviews`.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useState, useTransition } from 'react';
import Link from 'next/link';
import {
  AlertTriangle, Check, EyeOff, MessageSquare, RotateCcw, ShieldCheck, Star,
} from 'lucide-react';

import {
  getModerationState, moderateReview,
  type ModerationReview, type ModerationState,
} from '../../actions/reviews';
import { Button } from '../../../components/ds/Button';
import { Card } from '../../../components/ds/Surface';
import { Badge, type BadgeTone } from '../../../components/ds/Badge';
import { FirstRun } from '../../../components/ds/EmptyState';
import { unwrap, screenMessage  } from '../../../lib/actionResult';

const STATUS_TONE: Record<ModerationReview['status'], BadgeTone> = {
  pending:   'warning',
  published: 'success',
  rejected:  'neutral',
};

const STATUS_LABEL: Record<ModerationReview['status'], string> = {
  pending:   'En attente',
  published: 'Publié',
  rejected:  'Refusé',
};

/** La note, en cinq marques. Le nombre est répété pour les lecteurs d'écran. */
function Stars({ value }: { value: number }) {
  return (
    <span className="inline-flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          className="h-4 w-4"
          strokeWidth={1.6}
          aria-hidden
          fill={n <= value ? 'currentColor' : 'none'}
          style={{ color: n <= value ? 'var(--color-warning, #D97706)' : 'var(--color-border, #CBD5E1)' }}
        />
      ))}
      <span className="sr-only">{value} sur 5</span>
    </span>
  );
}

function dateFr(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('fr-HT', {
      day: 'numeric', month: 'long', year: 'numeric',
    });
  } catch {
    return '';
  }
}

function ReviewCard({
  review, onModerate, busy,
}: {
  review: ModerationReview;
  onModerate: (id: string, status: 'published' | 'rejected' | 'pending') => void;
  busy: boolean;
}) {
  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-body font-semibold text-primary dark:text-dark-text">
            {review.productName}
          </p>
          <p className="mt-0.5 text-note text-muted dark:text-dark-muted">
            {review.authorName}
            {review.orderNumber && <> · commande {review.orderNumber}</>}
            {' · '}{dateFr(review.createdAt)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Stars value={review.rating} />
          <Badge tone={STATUS_TONE[review.status]}>{STATUS_LABEL[review.status]}</Badge>
        </div>
      </div>

      {review.body ? (
        <p className="mt-3 whitespace-pre-line text-body text-text2 dark:text-dark-text2">
          {review.body}
        </p>
      ) : (
        // Une note sans commentaire est un avis complet : c'est la note qui
        // alimente les étoiles de la fiche. Le dire évite que le marchand
        // attende un texte qui ne viendra pas.
        <p className="mt-3 text-note italic text-muted dark:text-dark-muted">
          Note seule, sans commentaire écrit.
        </p>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        {review.status !== 'published' && (
          <Button
            size="sm"
            onClick={() => onModerate(review.id, 'published')}
            disabled={busy}
          >
            <Check className="h-4 w-4" aria-hidden />
            Publier
          </Button>
        )}

        {review.status !== 'rejected' && (
          <Button
            size="sm"
            variant="quiet"
            onClick={() => onModerate(review.id, 'rejected')}
            disabled={busy}
          >
            <EyeOff className="h-4 w-4" aria-hidden />
            {review.status === 'published' ? 'Dépublier' : 'Refuser'}
          </Button>
        )}

        {review.status !== 'pending' && (
          <Button
            size="sm"
            variant="quiet"
            onClick={() => onModerate(review.id, 'pending')}
            disabled={busy}
          >
            <RotateCcw className="h-4 w-4" aria-hidden />
            Remettre en attente
          </Button>
        )}
      </div>
    </Card>
  );
}

export default function AvisPage() {
  const [state, setState]   = useState<ModerationState | null>(null);
  const [error, setError]   = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const load = useCallback(async () => {
    try {
      setState(await getModerationState());
    } catch (e) {
      setError(screenMessage(e, 'Les avis n\'ont pas pu être chargés.'));
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const onModerate = useCallback(
    (id: string, status: 'published' | 'rejected' | 'pending') => {
      setBusyId(id);
      setError(null);
      startTransition(async () => {
        try {
          unwrap(await moderateReview(id, status));
          await load();
        } catch (e) {
          setError(screenMessage(e, "Le statut n'a pas pu être changé."));
        } finally {
          setBusyId(null);
        }
      });
    },
    [load],
  );

  if (!state && !error) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-pill border-2 border-border border-t-primary" />
      </div>
    );
  }

  const pending   = state?.pending   ?? [];
  const published = state?.published ?? [];
  const rejected  = state?.rejected  ?? [];
  const total     = pending.length + published.length + rejected.length;

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-8">
      <div className="mb-6">
        <h1 className="text-screen font-semibold text-primary dark:text-dark-text">
          Avis clients
        </h1>
        <p className="mt-1 text-body text-text2 dark:text-dark-text2">
          Les notes laissées par vos acheteurs. Un avis publié fait apparaître les
          étoiles sur la fiche du produit.
        </p>
      </div>

      <div className="mb-6 flex items-start gap-2 rounded-control bg-accent-sub px-3 py-3">
        <ShieldCheck className="mt-0.5 h-4 w-4 flex-shrink-0 text-success" aria-hidden />
        <p className="text-note text-primary dark:text-dark-text">
          Vous pouvez refuser un propos déplacé ou hors sujet. Vous ne pouvez pas
          écrire un avis, ni modifier une note ou un texte — c'est ce qui fait que
          vos étoiles valent quelque chose aux yeux de vos clients. Seul un client
          ayant réellement acheté le produit peut en déposer un.
        </p>
      </div>

      {error && (
        <div className="mb-6 flex items-start gap-2 rounded-control bg-danger-sub px-3 py-3">
          <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-danger" aria-hidden />
          <p className="text-body text-danger">{error}</p>
        </div>
      )}

      {total === 0 ? (
        <FirstRun
          illustration={<MessageSquare className="h-8 w-8 text-muted" strokeWidth={1.5} aria-hidden />}
          title="Aucun avis pour le moment"
          hint={
            "Vos clients peuvent noter un produit juste après leur commande, et reçoivent "
            + "une invitation par courriel trois jours après la livraison. Le premier avis "
            + "arrivera ici pour que vous le relisiez avant publication."
          }
        />
      ) : (
        <div className="flex flex-col gap-8">
          <section aria-labelledby="attente">
            <h2
              id="attente"
              className="mb-3 text-card font-bold text-primary dark:text-dark-text"
            >
              À relire{pending.length > 0 && <> · {pending.length}</>}
            </h2>
            {pending.length === 0 ? (
              <p className="text-body text-muted dark:text-dark-muted">
                Rien n'attend votre relecture.
              </p>
            ) : (
              <div className="flex flex-col gap-3">
                {pending.map((r) => (
                  <ReviewCard
                    key={r.id} review={r} onModerate={onModerate}
                    busy={busyId === r.id}
                  />
                ))}
              </div>
            )}
          </section>

          {published.length > 0 && (
            <section aria-labelledby="publies">
              <h2
                id="publies"
                className="mb-3 text-card font-bold text-primary dark:text-dark-text"
              >
                Publiés · {published.length}
              </h2>
              <div className="flex flex-col gap-3">
                {published.map((r) => (
                  <ReviewCard
                    key={r.id} review={r} onModerate={onModerate}
                    busy={busyId === r.id}
                  />
                ))}
              </div>
            </section>
          )}

          {rejected.length > 0 && (
            <section aria-labelledby="refuses">
              <h2
                id="refuses"
                className="mb-3 text-card font-bold text-primary dark:text-dark-text"
              >
                Refusés · {rejected.length}
              </h2>
              <p className="mb-3 text-note text-muted dark:text-dark-muted">
                Ils ne sont pas supprimés et n'apparaissent nulle part. Vous pouvez
                revenir sur la décision.
              </p>
              <div className="flex flex-col gap-3">
                {rejected.map((r) => (
                  <ReviewCard
                    key={r.id} review={r} onModerate={onModerate}
                    busy={busyId === r.id}
                  />
                ))}
              </div>
            </section>
          )}
        </div>
      )}

      <p className="mt-8 text-note text-muted dark:text-dark-muted">
        Les étoiles n'apparaissent sur une fiche qu'à partir du premier avis publié.{' '}
        <Link href="/boutique/builder" className="underline">
          Ouvrir l'éditeur de vitrine
        </Link>
      </p>
    </div>
  );
}
