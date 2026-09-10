// ─────────────────────────────────────────────────────────────────────────────
// Le pied de vitrine
//
// Composant serveur : rien ici ne dépend de l'état du navigateur, donc rien ici
// ne part dans le bundle du visiteur.
//
// Il ne montre que ce que le marchand a réellement renseigné. Un pied de page
// avec « Facebook · Instagram · TikTok » dont deux liens sur trois pointent vers
// le vide donne exactement l'impression qu'on cherche à éviter : une boutique
// montée à la hâte.
// ─────────────────────────────────────────────────────────────────────────────

import Link from 'next/link';
import { Mail, MapPin, Phone, Instagram, Facebook, MessageCircle } from 'lucide-react';
import { collectionHref } from '../../lib/storeTheme';
import type { StoreCategory, StoreView } from './types';

function normalizeSocial(value: string, base: string): string | null {
  const v = value.trim();
  if (!v) return null;
  if (/^https?:\/\//i.test(v)) return v;
  return `${base}${v.replace(/^@/, '')}`;
}

export function StorefrontFooter({
  store, categories = [],
}: {
  store: StoreView;
  /** Les rayons, pour que le pied de page serve aussi de plan du site (§31). */
  categories?: StoreCategory[];
}) {
  const { social } = store.theme;

  const socials = [
    { href: normalizeSocial(social.instagram, 'https://instagram.com/'), Icon: Instagram, label: 'Instagram' },
    { href: normalizeSocial(social.facebook,  'https://facebook.com/'),  Icon: Facebook,  label: 'Facebook' },
    { href: normalizeSocial(social.tiktok,    'https://tiktok.com/@'),   Icon: MessageCircle, label: 'TikTok' },
  ].filter((s): s is { href: string; Icon: typeof Instagram; label: string } => Boolean(s.href));

  const contacts = [
    store.contactPhone   ? { Icon: Phone,  text: store.contactPhone,   href: `tel:${store.contactPhone.replace(/\s/g, '')}` } : null,
    store.contactEmail   ? { Icon: Mail,   text: store.contactEmail,   href: `mailto:${store.contactEmail}` } : null,
    store.contactAddress ? { Icon: MapPin, text: store.contactAddress, href: null } : null,
  ].filter(Boolean) as Array<{ Icon: typeof Phone; text: string; href: string | null }>;

  return (
    <footer
      id="contact"
      className="mt-16 border-t"
      style={{ borderColor: 'var(--st-border)', background: 'var(--st-surface-2)' }}
    >
      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
          <div className="max-w-sm lg:col-span-2">
            <p
              className="text-[18px] font-semibold text-[var(--st-ink)]"
              style={{ fontFamily: 'var(--st-font-heading)' }}
            >
              {store.name}
            </p>
            {store.tagline && (
              <p className="mt-2 text-[14px] leading-relaxed text-[var(--st-ink-2)]">
                {store.tagline}
              </p>
            )}

            {socials.length > 0 && (
              <div className="mt-6 flex gap-2">
                {socials.map(({ href, Icon, label }) => (
                  <a
                    key={label}
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={label}
                    className="flex h-11 w-11 items-center justify-center rounded-[8px] border text-[var(--st-ink-2)] transition hover:text-[var(--st-ink)]"
                    style={{ borderColor: 'var(--st-border)' }}
                  >
                    <Icon className="h-4 w-4" strokeWidth={1.7} aria-hidden />
                  </a>
                ))}
              </div>
            )}
          </div>

          {categories.length > 0 && (
            <nav aria-label="Rayons">
              <p className="text-[13px] font-semibold uppercase tracking-wide text-[var(--st-ink-3)]">
                La boutique
              </p>
              <ul className="mt-4 flex flex-col gap-2">
                <li>
                  <Link
                    href={`${store.base}/products`}
                    className="flex min-h-[44px] items-center text-[14px] text-[var(--st-ink-2)] transition hover:text-[var(--st-ink)]"
                  >
                    Tous les produits
                  </Link>
                </li>
                {categories.slice(0, 6).map((c) => (
                  <li key={c.id}>
                    <Link
                      href={collectionHref(store.base, c)}
                      className="flex min-h-[44px] items-center text-[14px] text-[var(--st-ink-2)] transition hover:text-[var(--st-ink)]"
                    >
                      {c.name}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          )}

          {contacts.length > 0 && (
            <div>
              <p className="text-[13px] font-semibold uppercase tracking-wide text-[var(--st-ink-3)]">
                Nous joindre
              </p>
              <ul className="mt-4 flex flex-col gap-3">
                {contacts.map(({ Icon, text, href }) => (
                  <li key={text} className="flex items-start gap-2 text-[14px] text-[var(--st-ink-2)]">
                    <Icon className="mt-0.5 h-4 w-4 flex-shrink-0" strokeWidth={1.7} aria-hidden />
                    {href ? (
                      <a href={href} className="flex min-h-[44px] items-center hover:text-[var(--st-ink)]">{text}</a>
                    ) : (
                      <span>{text}</span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div
          className="mt-10 flex flex-col gap-2 border-t pt-6 text-[12px] text-[var(--st-ink-3)] sm:flex-row sm:items-center sm:justify-between"
          style={{ borderColor: 'var(--st-border)' }}
        >
          <p>© {new Date().getFullYear()} {store.name}</p>
          <Link href="https://profitpilot.app" className="hover:text-[var(--st-ink-2)]">
            Propulsé par ProfitPilot
          </Link>
        </div>
      </div>
    </footer>
  );
}
