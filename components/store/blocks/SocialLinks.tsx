// ─────────────────────────────────────────────────────────────────────────────
// Les réseaux du marchand
//
// Une seule liste, lue par le pied de page et par « Nous joindre ». Elles la
// construisaient chacune de leur côté, et elles ne disaient pas la même chose :
// le pied montrait trois réseaux, la section de contact en montrait un autre,
// et TikTok y portait l'icône d'une bulle de conversation — celle que lucide
// donne aux messages, faute d'avoir la marque.
//
// ── Pourquoi trois logos sont dessinés ici ─────────────────────────────────
//
// lucide n'a ni TikTok, ni YouTube, ni WhatsApp : ce sont des marques déposées,
// pas des pictogrammes. Une bulle de conversation à la place de WhatsApp n'est
// pas une approximation acceptable — le visiteur cherche un logo qu'il connaît
// par cœur, et il ne reconnaît pas celui-là. Les trois glyphes sont donc tracés
// ici, pleins, comme des marques se dessinent.
//
// Instagram et Facebook restent à lucide, en trait. Le mélange est voulu et
// c'est la convention du web : une marque se reconnaît à sa silhouette pleine,
// un pictogramme se lit en trait. Les cinq tiennent la même surface optique.
//
// ── Rien d'affiché qui ne soit rempli ──────────────────────────────────────
//
// Un réseau non saisi n'est pas une icône grise : c'est une icône absente. Une
// rangée de cinq logos dont trois ne mènent nulle part donne exactement
// l'impression qu'on cherche à éviter.
// ─────────────────────────────────────────────────────────────────────────────

import { Instagram, Facebook } from 'lucide-react';
import type { StoreView } from '../types';

type Glyph = React.ComponentType<{ className?: string }>;

/** Le logo TikTok : la croche et son décalage. */
const TikTok: Glyph = ({ className }) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
    <path d="M16.5 3h-2.7v12.1a2.4 2.4 0 1 1-1.9-2.35V10a5.3 5.3 0 1 0 4.6 5.25V8.9a6.2 6.2 0 0 0 3.6 1.15V7.3a3.5 3.5 0 0 1-3.6-3.3V3Z" />
  </svg>
);

/** Le logo YouTube : le rectangle arrondi et sa flèche de lecture. */
const YouTube: Glyph = ({ className }) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
    <path d="M21.6 7.2a2.5 2.5 0 0 0-1.75-1.77C18.28 5 12 5 12 5s-6.28 0-7.85.43A2.5 2.5 0 0 0 2.4 7.2 26 26 0 0 0 2 12a26 26 0 0 0 .4 4.8 2.5 2.5 0 0 0 1.75 1.77C5.72 19 12 19 12 19s6.28 0 7.85-.43a2.5 2.5 0 0 0 1.75-1.77A26 26 0 0 0 22 12a26 26 0 0 0-.4-4.8ZM10.2 14.85v-5.7L15 12l-4.8 2.85Z" />
  </svg>
);

/** Le logo WhatsApp : le combiné dans sa bulle. */
const WhatsApp: Glyph = ({ className }) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
    <path d="M12.04 2a9.9 9.9 0 0 0-8.5 14.95L2 22l5.2-1.5A9.9 9.9 0 1 0 12.04 2Zm0 1.8a8.1 8.1 0 1 1-4.1 15.08l-.3-.17-3.08.89.9-3-.2-.31A8.1 8.1 0 0 1 12.04 3.8Zm-3.2 4.1c-.16 0-.42.06-.64.3-.22.24-.85.83-.85 2.02 0 1.2.87 2.35.99 2.51.12.16 1.7 2.72 4.22 3.7 2.09.82 2.52.66 2.97.62.46-.04 1.47-.6 1.68-1.19.2-.58.2-1.08.14-1.18-.06-.1-.22-.16-.46-.28-.24-.12-1.43-.7-1.65-.79-.22-.08-.38-.12-.54.12-.16.24-.62.78-.76.94-.14.16-.28.18-.52.06-.24-.12-1.02-.37-1.94-1.2-.72-.63-1.2-1.42-1.34-1.66-.14-.24-.02-.37.1-.49.11-.11.24-.28.36-.42.12-.14.16-.24.24-.4.08-.16.04-.3-.02-.42-.06-.12-.53-1.32-.73-1.8-.19-.47-.38-.4-.53-.41h-.45Z" />
  </svg>
);

export type SocialLink = { href: string; label: string; Glyph: Glyph };

/**
 * L'adresse d'un réseau, telle que le marchand l'a tapée.
 *
 * Il tape aussi bien « @lalou » qu'une adresse complète : les deux doivent
 * mener au même endroit, sans qu'on lui demande laquelle il a en tête. Pour
 * WhatsApp, il tape souvent son numéro — les espaces et le « + » se retirent,
 * parce que wa.me ne veut que des chiffres.
 */
function normalize(value: string, base: string): string | null {
  const v = value.trim();
  if (!v) return null;
  if (/^https?:\/\//i.test(v)) return v;
  if (base.includes('wa.me')) {
    const digits = v.replace(/[^\d]/g, '');
    return digits ? `${base}${digits}` : null;
  }
  return `${base}${v.replace(/^@/, '')}`;
}

/** Les réseaux réellement saisis, dans l'ordre où on les reconnaît. */
export function socialLinks(store: StoreView): SocialLink[] {
  const s = store.theme.social;
  return [
    { href: normalize(s.instagram, 'https://instagram.com/'), label: 'Instagram', Glyph: Instagram },
    { href: normalize(s.facebook,  'https://facebook.com/'),  label: 'Facebook',  Glyph: Facebook },
    { href: normalize(s.tiktok,    'https://tiktok.com/@'),   label: 'TikTok',    Glyph: TikTok },
    { href: normalize(s.youtube,   'https://youtube.com/@'),  label: 'YouTube',   Glyph: YouTube },
    { href: normalize(s.whatsapp,  'https://wa.me/'),         label: 'WhatsApp',  Glyph: WhatsApp },
  ].filter((l): l is SocialLink => Boolean(l.href));
}

/**
 * La rangée de logos.
 *
 * `bare` est l'allure de la maquette : le logo seul, sans cadre, posé sur le
 * fond sombre du pied de page. `boxed` garde le carré bordé, qui tient mieux
 * sur un fond clair où un glyphe isolé flotte.
 *
 * Dans les deux cas la cible fait 44 pixels (§12) : c'est le cadre qui
 * disparaît, jamais la surface qu'on vise avec le pouce.
 */
export function SocialRow({
  store, look = 'boxed', className,
}: {
  store: StoreView;
  look?: 'boxed' | 'bare';
  className?: string;
}) {
  const links = socialLinks(store);
  if (links.length === 0) return null;

  const bare = look === 'bare';

  return (
    <ul className={`flex flex-wrap items-center ${bare ? 'gap-1' : 'gap-2'} ${className ?? ''}`}>
      {links.map(({ href, label, Glyph }) => (
        <li key={label}>
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={label}
            className={`flex h-11 w-11 items-center justify-center text-[var(--st-ink-2)] transition hover:text-[var(--st-ink)] ${
              bare ? '' : 'border hover:border-[var(--st-ink-2)]'
            }`}
            style={bare ? undefined : { borderColor: 'var(--st-border)', borderRadius: 'var(--st-radius-btn)' }}
          >
            <Glyph className="h-[18px] w-[18px]" />
          </a>
        </li>
      ))}
    </ul>
  );
}
