'use client';

// ─────────────────────────────────────────────────────────────────────────────
// La demande de commande sur mesure
//
// Le gâteau de trente parts pour samedi, le buffet d'un mariage, le lot de
// trente poulets à livrer au marché : trois commandes qu'aucun panier ne sait
// prendre, parce qu'il leur manque une date, un nombre de parts ou un poids.
//
// Ce formulaire n'encaisse rien et ne crée aucune commande. Il ouvre WhatsApp
// avec le message déjà écrit — ce qui est exactement la façon dont ces
// commandes se passent réellement en Haïti. Prétendre le contraire, ce serait
// promettre à l'acheteur qu'il a commandé alors que le marchand n'a rien reçu.
//
// Trois champs, pas six. Chaque champ ajouté est un acheteur perdu, et le
// marchand posera de toute façon ses questions dans la conversation qui suit.
// ─────────────────────────────────────────────────────────────────────────────

import { useState } from 'react';
import { MessageCircle } from 'lucide-react';
import { buildWhatsAppLink } from '../../../lib/whatsappReport';
import type { StoreView } from '../types';

export function OrderRequestForm({
  store, phone, ctaLabel, askDate,
}: {
  store:    StoreView;
  /** Le numéro qui reçoit la demande. Résolu côté serveur : jamais vide ici. */
  phone:    string;
  ctaLabel: string;
  askDate:  boolean;
}) {
  const [name,    setName]    = useState('');
  const [contact, setContact] = useState('');
  const [date,    setDate]    = useState('');
  const [time,    setTime]    = useState('');
  const [details, setDetails] = useState('');

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const lines: string[] = [
      `Bonjour ${store.name}, je souhaite passer une commande.`,
      '',
    ];
    if (name.trim())    lines.push(`Nom : ${name.trim()}`);
    if (contact.trim()) lines.push(`Téléphone : ${contact.trim()}`);
    if (askDate && date) {
      // La date part telle que le marchand la lit, pas en ISO : « 2026-09-14 »
      // dans un fil WhatsApp se relit mal, et une commande mal relue se rate.
      const readable = new Date(`${date}T00:00:00`).toLocaleDateString('fr-HT', {
        weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
      });
      lines.push(`Date souhaitée : ${readable}${time ? ` à ${time}` : ''}`);
    }
    if (details.trim()) {
      lines.push('');
      lines.push(details.trim());
    }
    lines.push('');
    lines.push(store.origin);

    // Ouvert par un geste de l'utilisateur, donc jamais bloqué par le
    // navigateur — et dans un onglet séparé, pour que la vitrine reste
    // ouverte derrière : l'acheteur revient souvent préciser quelque chose.
    window.open(buildWhatsAppLink(phone, lines.join('\n')), '_blank', 'noopener,noreferrer');
  }

  const field =
    'min-h-[48px] w-full rounded-[8px] border bg-[var(--st-surface)] px-4 text-[15px] text-[var(--st-ink)] outline-none focus:border-[var(--st-accent)]';

  return (
    <form onSubmit={handleSubmit} className="mt-8 flex flex-col gap-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] font-medium text-[var(--st-ink-2)]">Votre nom</span>
          <input
            required
            autoComplete="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={field}
            style={{ borderColor: 'var(--st-border)' }}
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] font-medium text-[var(--st-ink-2)]">Votre téléphone</span>
          <input
            required
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            value={contact}
            onChange={(e) => setContact(e.target.value)}
            className={field}
            style={{ borderColor: 'var(--st-border)' }}
          />
        </label>
      </div>

      {askDate && (
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1.5">
            <span className="text-[13px] font-medium text-[var(--st-ink-2)]">Pour quelle date</span>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className={field}
              style={{ borderColor: 'var(--st-border)' }}
            />
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-[13px] font-medium text-[var(--st-ink-2)]">À quelle heure</span>
            <input
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              className={field}
              style={{ borderColor: 'var(--st-border)' }}
            />
          </label>
        </div>
      )}

      <label className="flex flex-col gap-1.5">
        <span className="text-[13px] font-medium text-[var(--st-ink-2)]">Votre demande</span>
        <textarea
          required
          rows={4}
          value={details}
          onChange={(e) => setDetails(e.target.value)}
          placeholder="Ce que vous voulez commander, la quantité, les précisions utiles."
          className="w-full rounded-[8px] border bg-[var(--st-surface)] px-4 py-3 text-[15px] leading-relaxed text-[var(--st-ink)] outline-none focus:border-[var(--st-accent)]"
          style={{ borderColor: 'var(--st-border)' }}
        />
      </label>

      <button
        type="submit"
        className="flex min-h-[52px] items-center justify-center gap-2 px-7 text-[15px] font-semibold transition hover:brightness-95"
        style={{
          background:   'var(--st-accent)',
          color:        'var(--st-accent-ink)',
          borderRadius: 'var(--st-radius-btn)',
        }}
      >
        <MessageCircle className="h-4 w-4" strokeWidth={2.2} aria-hidden />
        {ctaLabel}
      </button>

      {/* L'acheteur doit savoir où il atterrit avant de cliquer : un bouton qui
          quitte le site sans le dire est perçu comme une erreur, et il revient
          en arrière au lieu d'envoyer sa demande. */}
      <p className="text-[12px] leading-relaxed text-[var(--st-ink-3)]">
        Votre demande s'ouvre dans WhatsApp, déjà rédigée. Vous l'envoyez vous-même.
      </p>
    </form>
  );
}
