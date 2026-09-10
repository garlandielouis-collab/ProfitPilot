// ─────────────────────────────────────────────────────────────────────────────
// Les sections qui donnent du corps à une marque
//
//   Compte à rebours   une offre qui se termine vraiment, pas un chronomètre
//                      qui se réarme à chaque visite
//   Vidéo              ce qu'aucune photo ne montre : le geste, l'usage, la
//                      matière en mouvement
//   Partenaires        les marques distribuées, les enseignes qui référencent
//   Équipe             qui vous recevra — une prestation s'achète à quelqu'un
//
// Les quatre sont vides par défaut, et une section vide n'existe pas. Aucun
// logo, aucun visage, aucune date ne sont proposés : ce sont les quatre
// contenus qu'on ne peut pas suggérer sans mentir sur qui travaille ici et avec
// qui.
// ─────────────────────────────────────────────────────────────────────────────

import { Users } from 'lucide-react';
import { Section, SectionHeader } from './Shell';
import { Countdown } from '../blocks/Countdown';
import { VideoEmbed } from '../blocks/VideoEmbed';
import { StoreImage } from '../blocks/StoreImage';
import { sectionTitle } from '../../../lib/storeSections';
import { templateArt } from '../../../lib/storeArt';
import type { SectionProps } from './types';

// ── Compte à rebours ────────────────────────────────────────────────────────

/**
 * La bande d'urgence.
 *
 * Elle n'a pas d'enveloppe de section : c'est une bande pleine largeur, et lui
 * poser le rythme vertical du gabarit la transformerait en encart perdu au
 * milieu du blanc. Le composant décide seul de disparaître à l'échéance — et il
 * ne rend rien côté serveur, sans quoi le temps restant serait celui du build.
 */
export function CountdownSection({ store }: SectionProps) {
  return <Countdown urgency={store.theme.urgency} />;
}

// ── Vidéo ───────────────────────────────────────────────────────────────────

export function VideoSection({ store, section, design }: SectionProps) {
  const v = store.theme.video;
  if (!v.enabled || !v.url) return null;

  const title = sectionTitle(section, store.templateId);

  return (
    <Section design={design} label={title || 'Vidéo'}>
      <SectionHeader design={design} title={title} eyebrow="En mouvement" description={v.body.trim() || undefined} />
      <div className="mx-auto max-w-3xl">
        <VideoEmbed url={v.url} title={title || store.name} poster={templateArt(store.templateId, 'band')} />
      </div>
    </Section>
  );
}

// ── Ils nous font confiance ─────────────────────────────────────────────────

/**
 * Les partenaires, logo quand il y en a un, nom sinon.
 *
 * Un logo manquant ne laisse pas un cadre vide : le nom écrit reste une
 * information. C'est la même règle que partout — on n'affiche pas un trou en
 * attendant une image.
 */
export function PartnersSection({ store, section, design }: SectionProps) {
  const p = store.theme.partners;
  if (!p.enabled) return null;

  const items = p.items.filter((i) => i.name.trim());
  if (items.length === 0) return null;

  const title = sectionTitle(section, store.templateId);

  return (
    <Section design={design} tone="surface-2" label={title}>
      <SectionHeader design={design} title={title} eyebrow="Références" align="center" />
      <ul className="flex flex-wrap items-center justify-center gap-x-10 gap-y-6">
        {items.map((item, i) => (
          <li key={`${item.name}-${i}`} className="flex items-center">
            {item.logoUrl ? (
              <span className="relative block h-10 w-28 opacity-80 transition hover:opacity-100">
                <StoreImage
                  src={item.logoUrl}
                  alt={item.name}
                  sizes="112px"
                  className="object-contain"
                />
              </span>
            ) : (
              <span className="text-[15px] font-semibold text-[var(--st-ink-2)]">{item.name}</span>
            )}
          </li>
        ))}
      </ul>
    </Section>
  );
}

// ── L'équipe ────────────────────────────────────────────────────────────────

export function TeamSection({ store, section, design }: SectionProps) {
  const t = store.theme.team;
  if (!t.enabled) return null;

  const members = t.members.filter((m) => m.name.trim());
  if (members.length === 0) return null;

  const title = sectionTitle(section, store.templateId);

  return (
    <Section design={design} label={title}>
      <SectionHeader design={design} title={title} eyebrow="La maison" />
      <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {members.map((member, i) => (
          <li key={`${member.name}-${i}`} className="flex flex-col items-center text-center">
            <span
              className="relative block h-24 w-24 overflow-hidden rounded-full"
              style={{ background: 'var(--st-surface-2)' }}
            >
              {member.photoUrl ? (
                <StoreImage src={member.photoUrl} alt={member.name} sizes="96px" className="object-cover" />
              ) : (
                <span className="flex h-full w-full items-center justify-center">
                  <Users className="h-8 w-8 text-[var(--st-ink-3)]" strokeWidth={1.4} aria-hidden />
                </span>
              )}
            </span>
            <p className="mt-3 text-[15px] font-semibold text-[var(--st-ink)]">{member.name}</p>
            {member.role.trim() && (
              <p className="mt-0.5 text-[13px] text-[var(--st-ink-2)]">{member.role}</p>
            )}
          </li>
        ))}
      </ul>
    </Section>
  );
}
