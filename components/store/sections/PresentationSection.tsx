// ─────────────────────────────────────────────────────────────────────────────
// La présentation : qui vous êtes, et ce que vous faites
//
// C'était le trou le plus visible de nos vitrines. Une page pouvait montrer
// trente produits sans jamais dire ce que la maison fait, pour qui, et ce qu'on
// gagne à acheter là plutôt qu'ailleurs. « Notre histoire » ne le dit pas : elle
// raconte le passé, et un visiteur qui hésite ne cherche pas une biographie, il
// cherche une réponse.
//
// ── Ce que la mise en page fait, et pourquoi elle est faite ainsi ──────────
//
// Une PROMESSE en grand à gauche, TROIS OU QUATRE POINTS à droite. C'est la
// composition d'une page de marque, et elle tient pour une raison simple : on
// lit la promesse, et si elle accroche on descend dans les points ; si elle
// n'accroche pas, on est déjà passé au catalogue sans avoir perdu dix secondes
// dans un pavé de texte.
//
// Les points sont NUMÉROTÉS. Un chiffre transforme une liste en méthode : trois
// paragraphes côte à côte se lisent comme trois phrases interchangeables,
// « 01 · 02 · 03 » se lit comme une façon de travailler. Le numéro est dessiné
// dans la couleur d'accent et le titre juste dessous, séparés par un filet —
// c'est la grammaire éditoriale du reste de la vitrine, pas une invention
// locale.
//
// ── Ce qui n'est jamais écrit à la place du marchand ───────────────────────
//
// Rien. La section est vide par défaut, donc absente. Le texte se rédige — à la
// main, ou par l'IA de l'éditeur, qui part des faits réels de la boutique
// (§16) : ses rayons, ses modes de livraison, ses moyens de paiement. Aucune
// ancienneté, aucun nombre de clients, aucune certification ne sortent de nulle
// part : ce sont les phrases qu'un client viendra réclamer au marchand.
// ─────────────────────────────────────────────────────────────────────────────

import Link from 'next/link';
import { Section } from './Shell';
import { storeLink } from './storeLink';
import { FadeIn } from '../blocks/FadeIn';
import { sectionTitle } from '../../../lib/storeSections';
import type { SectionProps } from './types';

export function PresentationSection({ store, section, design }: SectionProps) {
  const p = store.theme.presentation;
  if (!p.enabled) return null;

  const items = p.items.filter((i) => i.title.trim());
  const intro = p.intro.trim();
  if (!intro && items.length === 0) return null;

  const title = sectionTitle(section, store.templateId);
  const cta   = p.ctaLabel.trim();

  // Deux colonnes quand il y a de quoi les remplir des deux côtés. Une promesse
  // seule, ou des points seuls, se posent au centre : une colonne vide à côté
  // d'une colonne pleine se lit comme une page cassée.
  const twoColumns = Boolean(intro) && items.length > 0;

  const body = (
    <Section design={design} tone="surface-2" label={title}>
      <div className={twoColumns ? 'grid gap-12 md:grid-cols-2 md:gap-16' : 'mx-auto max-w-3xl text-center'}>

        {(intro || title) && (
          <div className={twoColumns ? 'md:sticky md:top-24 md:self-start' : ''}>
            {design.type.eyebrow && (
              <p
                className="mb-3 text-[11px] font-semibold uppercase text-[var(--st-ink-3)]"
                style={{ letterSpacing: '0.18em' }}
              >
                La maison
              </p>
            )}

            <h2
              className="text-[var(--st-ink)]"
              style={{
                fontFamily:    'var(--st-font-heading)',
                fontSize:      'var(--st-h2)',
                fontWeight:    design.type.upper ? 500 : 600,
                lineHeight:    1.15,
                letterSpacing: 'var(--st-tracking)',
                textTransform: design.type.upper ? 'uppercase' : undefined,
              }}
            >
              {title}
            </h2>

            {/* `whitespace-pre-line` : le marchand écrit dans une zone de texte,
                ses retours à la ligne sont son découpage. */}
            {intro && (
              <p className="mt-5 whitespace-pre-line text-[16px] leading-relaxed text-[var(--st-ink-2)]">
                {intro}
              </p>
            )}

            {cta && (
              <Link
                href={storeLink(p.ctaHref, store.base)}
                className="mt-8 inline-flex min-h-[52px] items-center justify-center px-7 text-[15px] font-semibold transition hover:brightness-95"
                style={{
                  background:   'var(--st-accent)',
                  color:        'var(--st-accent-ink)',
                  borderRadius: 'var(--st-radius-btn)',
                }}
              >
                {cta}
              </Link>
            )}
          </div>
        )}

        {items.length > 0 && (
          <ul
            className={[
              'grid gap-x-8 gap-y-9',
              twoColumns ? 'sm:grid-cols-2' : 'mt-10 text-left sm:grid-cols-2 lg:grid-cols-4',
            ].join(' ')}
          >
            {items.map((item, i) => (
              <li key={`${item.title}-${i}`}>
                <p
                  className="text-[13px] font-semibold tabular-nums text-[var(--st-accent)]"
                  style={{ letterSpacing: '0.12em' }}
                >
                  {String(i + 1).padStart(2, '0')}
                </p>
                <span
                  className="mt-3 mb-4 block h-px w-10"
                  style={{ background: 'var(--st-border)' }}
                  aria-hidden
                />
                <p
                  className="text-[16px] font-semibold text-[var(--st-ink)]"
                  style={{ fontFamily: 'var(--st-font-heading)' }}
                >
                  {item.title}
                </p>
                {item.body.trim() && (
                  <p className="mt-2 text-[14px] leading-relaxed text-[var(--st-ink-2)]">
                    {item.body}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </Section>
  );

  return design.reveal ? <FadeIn>{body}</FadeIn> : body;
}
