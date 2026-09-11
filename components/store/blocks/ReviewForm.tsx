'use client';

// ─────────────────────────────────────────────────────────────────────────────
// Le dépôt d'avis, après achat
//
// ── Ce qu'il ne demande pas ────────────────────────────────────────────────
//
// Ni compte, ni mot de passe, ni adresse. Le jeton signé porté par la page
// prouve déjà que le porteur est le client (`lib/reviewToken.ts`). La seule
// chose qu'on demande est celle qu'on veut : la note.
//
// ── Pourquoi le commentaire est facultatif ─────────────────────────────────
//
// Une étoile se donne en un geste, une phrase demande d'y penser. Rendre le
// texte obligatoire ferait tomber le taux de réponse d'un facteur qu'on ne
// mesure même pas — la moitié des gens n'ont rien à écrire de plus que
// « content ». Or la NOTE est ce qui alimente `v_product_ratings`, donc les
// étoiles sur les fiches : c'est elle qui compte, et elle seule est requise.
//
// ── Un produit à la fois ───────────────────────────────────────────────────
//
// Une commande de six articles ne se note pas en un envoi. Chaque produit a son
// bloc, son état et son bouton : celui qui veut noter un seul article le fait,
// et un échec sur l'un n'efface pas ce qui a été écrit sur les autres. Le
// serveur reçoit un avis par produit, ce qui est aussi la forme de la
// contrainte `UNIQUE (order_id, product_id)`.
//
// ── L'étoile est un bouton radio ───────────────────────────────────────────
//
// Pas un `div` avec un `onClick`. Cinq radios dans un `fieldset` légendé se
// parcourent à la flèche, s'annoncent « 4 sur 5 » au lecteur d'écran et se
// soumettent au clavier — trois choses qu'une rangée d'icônes cliquables ne
// fait pas. Les cibles font 44 px, comme tout ce qui se touche dans ce produit.
// ─────────────────────────────────────────────────────────────────────────────

import { useState } from 'react';
import { Star, Check, Loader2 } from 'lucide-react';
import { submitReview } from '../../../app/actions/store-content';
import { StoreImage } from './StoreImage';

type Item = {
  productId:   string;
  productName: string;
  productImage: string | null;
};

/** L'état d'un bloc. `done` ne revient jamais en arrière : l'avis est déposé. */
type Status = 'idle' | 'sending' | 'done';

function StarPicker({
  name, value, onChange, disabled,
}: {
  name:     string;
  value:    number;
  onChange: (n: number) => void;
  disabled: boolean;
}) {
  return (
    <fieldset className="border-0 p-0" disabled={disabled}>
      <legend className="sr-only">Votre note, de 1 à 5 étoiles</legend>
      <div className="flex items-center">
        {[1, 2, 3, 4, 5].map((n) => (
          <label
            key={n}
            className="flex h-11 w-11 cursor-pointer items-center justify-center"
            title={`${n} sur 5`}
          >
            <input
              type="radio"
              name={name}
              value={n}
              checked={value === n}
              onChange={() => onChange(n)}
              className="sr-only"
            />
            <Star
              className="h-7 w-7 transition-transform"
              strokeWidth={1.6}
              aria-hidden
              style={{
                fill:   n <= value ? 'var(--st-accent)' : 'transparent',
                color:  n <= value ? 'var(--st-accent)' : 'var(--st-ink-3)',
                transform: n <= value ? 'scale(1)' : 'scale(0.94)',
              }}
            />
            <span className="sr-only">{n} sur 5</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function ItemReview({ orderId, token, item }: { orderId: string; token: string; item: Item }) {
  const [rating, setRating] = useState(0);
  const [body,   setBody]   = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [error,  setError]  = useState<string | null>(null);

  async function send() {
    if (rating < 1) {
      setError('Choisissez une note avant d\'envoyer.');
      return;
    }
    setStatus('sending');
    setError(null);
    try {
      await submitReview({
        orderId,
        productId: item.productId,
        token,
        rating,
        body: body.trim() || undefined,
      });
      setStatus('done');
    } catch (e) {
      setStatus('idle');
      setError(e instanceof Error ? e.message : "Votre avis n'a pas pu être enregistré.");
    }
  }

  if (status === 'done') {
    return (
      <li
        className="flex items-center gap-3 p-4"
        style={{
          background:   'var(--st-surface)',
          border:       '1px solid var(--st-border)',
          borderRadius: 'var(--st-radius-card)',
        }}
      >
        <Check className="h-5 w-5 flex-shrink-0" style={{ color: 'var(--st-accent)' }} aria-hidden />
        <p className="text-[14px] text-[var(--st-ink-2)]">
          Merci — votre avis sur <strong className="text-[var(--st-ink)]">{item.productName}</strong>{' '}
          a été envoyé. Il apparaîtra sur la fiche une fois relu par le commerçant.
        </p>
      </li>
    );
  }

  const busy = status === 'sending';

  return (
    <li
      className="p-4"
      style={{
        background:   'var(--st-surface)',
        border:       '1px solid var(--st-border)',
        borderRadius: 'var(--st-radius-card)',
      }}
    >
      <div className="flex items-start gap-4">
        {item.productImage && (
          <div
            className="relative h-16 w-16 flex-shrink-0 overflow-hidden"
            style={{
              borderRadius: 'var(--st-radius-media)',
              background:   'var(--st-surface-2)',
            }}
          >
            <StoreImage
              src={item.productImage}
              alt=""
              sizes="64px"
              className="object-cover"
            />
          </div>
        )}

        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-semibold text-[var(--st-ink)]">{item.productName}</p>

          <div className="mt-1">
            <StarPicker
              name={`note-${item.productId}`}
              value={rating}
              onChange={(n) => { setRating(n); setError(null); }}
              disabled={busy}
            />
          </div>

          <label className="mt-2 block">
            <span className="sr-only">Votre commentaire sur {item.productName}, facultatif</span>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              disabled={busy}
              rows={2}
              maxLength={1000}
              placeholder="Un mot sur ce produit (facultatif)"
              className="w-full resize-y p-3 text-[14px] text-[var(--st-ink)]"
              style={{
                background:   'var(--st-surface-2)',
                border:       '1px solid var(--st-border)',
                borderRadius: 'var(--st-radius-input)',
              }}
            />
          </label>

          {error && (
            <p className="mt-2 text-[13px]" style={{ color: 'var(--st-danger, #B42318)' }} role="alert">
              {error}
            </p>
          )}

          <button
            type="button"
            onClick={send}
            disabled={busy}
            className="mt-2 inline-flex min-h-[44px] items-center gap-2 px-5 text-[14px] font-semibold disabled:opacity-60"
            style={{
              background:   'var(--st-accent)',
              color:        'var(--st-accent-ink)',
              borderRadius: 'var(--st-radius-btn)',
            }}
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
            {busy ? 'Envoi…' : 'Envoyer mon avis'}
          </button>
        </div>
      </div>
    </li>
  );
}

export function ReviewForm({
  orderId, token, items, alreadyReviewed,
}: {
  orderId: string;
  token:   string;
  items:   Item[];
  /** Les produits de cette commande déjà notés. */
  alreadyReviewed: string[];
}) {
  const done = new Set(alreadyReviewed);
  const todo = items.filter((i) => i.productId && !done.has(i.productId));

  // Tout est noté : on ne montre rien. Une section « vous avez déjà tout noté »
  // occuperait un écran pour ne rien apprendre à personne.
  if (todo.length === 0) return null;

  return (
    <section id="avis" className="mt-12 scroll-mt-24" aria-labelledby="avis-titre">
      <h2
        id="avis-titre"
        className="text-[20px] font-semibold text-[var(--st-ink)]"
        style={{ fontFamily: 'var(--st-font-heading)' }}
      >
        {todo.length > 1 ? 'Donnez votre avis' : 'Donnez votre avis'}
      </h2>
      <p className="mt-1 text-[14px] text-[var(--st-ink-2)]">
        Votre note aide les prochains acheteurs à choisir. Le commerçant la relit avant
        publication ; il peut refuser un propos déplacé, il ne peut pas en écrire un à
        votre place.
      </p>

      <ul className="mt-5 grid gap-3">
        {todo.map((item) => (
          <ItemReview key={item.productId} orderId={orderId} token={token} item={item} />
        ))}
      </ul>
    </section>
  );
}
