'use client';

// ─────────────────────────────────────────────────────────────────────────────
// « Prévenez-moi quand c'est disponible » (§25)
//
// Un produit épuisé est la seule page d'une boutique où le visiteur est
// convaincu et où le marchand n'a rien à vendre. Sans ce champ, ce visiteur
// part et ne revient pas ; avec lui, le marchand récupère une demande — et
// surtout la preuve qu'il doit se réapprovisionner.
//
// Le formulaire ne demande qu'une adresse. Ni nom, ni téléphone, ni quantité :
// chaque champ supplémentaire fait perdre une partie de ceux qui auraient
// laissé la seule chose utile.
// ─────────────────────────────────────────────────────────────────────────────

import { useState } from 'react';
import { Check } from 'lucide-react';
import { notifyWhenAvailable } from '../../../app/actions/store-content';
import { unwrap, screenMessage  } from '../../../lib/actionResult';

export function NotifyWhenAvailable({
  businessId, productId,
}: {
  businessId: string;
  productId:  string;
}) {
  const [email, setEmail] = useState('');
  const [state, setState] = useState<'idle' | 'sending' | 'done' | 'error'>('idle');
  const [message, setMessage] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setState('sending');
    try {
      unwrap(await notifyWhenAvailable(businessId, productId, email.trim()));
      setState('done');
    } catch (err) {
      setState('error');
      setMessage(screenMessage(err, "L'inscription n'a pas abouti."));
    }
  }

  if (state === 'done') {
    return (
      <p className="mt-3 flex items-center gap-2 text-[13px] text-[var(--st-ink-2)]">
        <Check className="h-4 w-4" style={{ color: 'var(--st-accent)' }} strokeWidth={2.4} aria-hidden />
        C'est noté. Nous vous écrirons dès le retour en stock.
      </p>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="mt-3 flex flex-col gap-2 sm:flex-row">
      <input
        type="email"
        required
        autoComplete="email"
        placeholder="Votre adresse e-mail"
        aria-label="Votre adresse e-mail"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className="min-h-[44px] flex-1 rounded-[8px] border bg-[var(--st-surface)] px-3 text-[14px] text-[var(--st-ink)] outline-none focus:border-[var(--st-accent)]"
        style={{ borderColor: 'var(--st-border)' }}
      />
      <button
        type="submit"
        disabled={state === 'sending'}
        className="flex min-h-[44px] items-center justify-center rounded-[8px] border px-5 text-[14px] font-semibold text-[var(--st-ink)] transition hover:bg-[var(--st-surface)] disabled:opacity-60"
        style={{ borderColor: 'var(--st-ink)' }}
      >
        {state === 'sending' ? 'Envoi…' : 'Me prévenir'}
      </button>

      {state === 'error' && (
        <p role="alert" className="text-[12px] text-[#8C2F26]">{message}</p>
      )}
    </form>
  );
}
