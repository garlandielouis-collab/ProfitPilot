'use client';

// ─────────────────────────────────────────────────────────────────────────────
// L'inscription à la lettre d'information
//
// Une adresse, un bouton, et une confirmation honnête.
//
// Ce que ce formulaire NE fait PAS : promettre une remise en échange de
// l'adresse, apparaître en fenêtre modale au bout de trois secondes, ou
// réapparaître à chaque visite. Le §28 dit « éviter les dark patterns » et cite
// nommément les popups agressifs.
//
// L'adresse part dans `product_stock_notifications` ? Non — elle part dans la
// table des clients, sans commande, avec un consentement marqué. C'est la même
// personne que celle qui achètera peut-être demain, et le marchand n'a pas
// besoin de deux carnets d'adresses.
// ─────────────────────────────────────────────────────────────────────────────

import { useState } from 'react';
import { Check } from 'lucide-react';
import { subscribeToStore } from '../../../app/actions/store-content';
import type { StoreView } from '../types';
import { unwrap, screenMessage  } from '../../../lib/actionResult';

export function NewsletterForm({ store }: { store: StoreView }) {
  const [email, setEmail]   = useState('');
  const [state, setState]   = useState<'idle' | 'sending' | 'done' | 'error'>('idle');
  const [message, setMessage] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setState('sending');
    try {
      unwrap(await subscribeToStore(store.slug, email.trim()));
      setState('done');
    } catch (err) {
      setState('error');
      setMessage(screenMessage(err, "L'inscription n'a pas abouti."));
    }
  }

  if (state === 'done') {
    return (
      <p className="mt-5 flex items-center justify-center gap-2 text-[14px] font-medium text-[var(--st-ink)]">
        <Check className="h-4 w-4" style={{ color: 'var(--st-accent)' }} strokeWidth={2.4} aria-hidden />
        {/* Rien n'envoie encore de lettre : on confirme ce qui est vrai, l'adresse
            est enregistrée chez la boutique — pas une promesse d'envoi. */}
        C'est noté : la boutique a bien reçu votre adresse.
      </p>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="mt-5 flex flex-col gap-2 sm:flex-row">
      <input
        type="email"
        required
        autoComplete="email"
        placeholder="Votre adresse e-mail"
        aria-label="Votre adresse e-mail"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className="min-h-[48px] flex-1 rounded-[8px] border bg-[var(--st-surface)] px-4 text-[15px] text-[var(--st-ink)] outline-none focus:border-[var(--st-accent)]"
        style={{ borderColor: 'var(--st-border)' }}
      />
      <button
        type="submit"
        disabled={state === 'sending'}
        className="flex min-h-[48px] items-center justify-center rounded-[8px] px-6 text-[15px] font-semibold transition hover:brightness-95 disabled:opacity-60"
        style={{ background: 'var(--st-accent)', color: 'var(--st-accent-ink)' }}
      >
        {state === 'sending' ? 'Envoi…' : 'Je m\'inscris'}
      </button>

      {state === 'error' && (
        <p role="alert" className="text-[13px] text-[#8C2F26] sm:absolute sm:mt-14">
          {message}
        </p>
      )}
    </form>
  );
}
