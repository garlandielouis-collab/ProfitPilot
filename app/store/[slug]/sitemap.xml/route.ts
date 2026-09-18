// ─────────────────────────────────────────────────────────────────────────────
// Le sitemap d'une vitrine
//
// Servi à /sitemap.xml sur le domaine du marchand — le middleware réécrit vers
// /store/<slug>/sitemap.xml — et à /store/<slug>/sitemap.xml depuis le domaine
// de l'application.
//
// Écrit en route handler plutôt qu'en `sitemap.ts` : dans un segment dynamique,
// le fichier de métadonnées demande `generateSitemaps` et une gymnastique de
// segmentation qui n'apporte rien ici. Une route rend le XML, point.
//
// Les URL sont construites sur l'hôte RÉELLEMENT demandé. Un sitemap qui
// annonce profitpilot.app/store/maboutique/... alors que la boutique vit sur
// maboutique.com fait indexer les mauvaises adresses, et le marchand se
// retrouve avec une vitrine dédoublée aux yeux de Google.
// ─────────────────────────────────────────────────────────────────────────────

import { headers } from 'next/headers';
import { loadStore, loadCatalog, loadCategories, loadReviews } from '../../../../lib/storefrontData';
import { collectionHref, parseThemeConfig, storePublicUrl } from '../../../../lib/storeTheme';
import { infoPagesFor } from '../../../../lib/storefrontPages';
import { toStoreView } from '../../../../components/store/types';
import { resolveTemplateId } from '../../../../components/store/templates/registry';

export const runtime = 'nodejs';
export const revalidate = 3600;

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const store = await loadStore(slug);

  if (!store) {
    return new Response('Not found', { status: 404 });
  }

  const h = await headers();
  const storeHost = h.get('x-pp-store-host');
  const storeSlug = h.get('x-pp-store-slug');
  const ownHost   = Boolean(storeHost) && storeSlug === slug;

  const origin = ownHost
    ? `${storeHost!.startsWith('localhost') ? 'http' : 'https'}://${storeHost}`
    : (process.env.NEXT_PUBLIC_APP_URL ?? storePublicUrl(store));
  const base = ownHost ? '' : `/store/${slug}`;

  const theme = parseThemeConfig(store.theme_config, {
    primary_color:   store.primary_color,
    secondary_color: store.secondary_color,
  });

  const onlyPublished = theme.catalog.mode === 'selected';

  const [products, categories, reviews] = await Promise.all([
    loadCatalog(store.business_id, { sort: 'newest', limit: 1000, onlyPublished }),
    loadCategories(store.business_id, onlyPublished),
    loadReviews(store.business_id),
  ]);

  // Les pages internes que cette vitrine porte réellement. La vue est montée
  // ici plutôt que les champs recopiés un à un : `toStoreView` sait déjà
  // normaliser les modes de livraison et les moyens de paiement, et deux
  // lectures du même thème qui divergent finiraient par annoncer au robot une
  // page que le site refuse.
  const infoPages = infoPagesFor({
    ...toStoreView(store, {
      base,
      origin,
      templateId: resolveTemplateId(store.template_id),
    }),
    hasReviews: reviews.length > 0,
  });

  type Entry = { loc: string; priority: string; changefreq: string; lastmod?: string };

  const entries: Entry[] = [
    { loc: `${origin}${base}`,           priority: '1.0', changefreq: 'daily'  },
    { loc: `${origin}${base}/products`,  priority: '0.9', changefreq: 'daily'  },
    // Les rayons. Ce sont les pages qu'un moteur de recherche relie à une
    // intention d'achat — « chaussures femme », « soins visage » — et elles
    // n'existaient pas : le catalogue n'était accessible que par un paramètre
    // d'URL, qu'aucun robot ne traite comme une page de rayon.
    ...categories.map((c) => ({
      loc:        `${origin}${collectionHref(base, c)}`,
      priority:   '0.8',
      changefreq: 'daily',
    })),
    // « À propos », « Livraison & retours », « FAQ » : ce sont les pages que
    // l'on cherche par le nom de la boutique plutôt que par un produit, et
    // celles qui disent à un moteur de recherche qu'il a devant lui un vrai
    // commerce. Elles passent avant les fiches pour cette raison.
    ...infoPages.map((page) => ({
      loc:        `${origin}${base}/${page.slug}`,
      priority:   '0.75',
      changefreq: 'monthly',
    })),
    ...products.map((p) => ({
      loc:        `${origin}${base}/products/${p.id}`,
      priority:   '0.7',
      changefreq: 'weekly',
      lastmod:    p.created_at,
    })),
  ];

  const xml =
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    entries
      .map((e) =>
        '  <url>\n' +
        `    <loc>${escapeXml(e.loc)}</loc>\n` +
        (e.lastmod
          ? `    <lastmod>${new Date(e.lastmod).toISOString().slice(0, 10)}</lastmod>\n`
          : '') +
        `    <changefreq>${e.changefreq}</changefreq>\n` +
        `    <priority>${e.priority}</priority>\n` +
        '  </url>',
      )
      .join('\n') +
    '\n</urlset>\n';

  return new Response(xml, {
    headers: {
      'Content-Type':  'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=0, s-maxage=3600, stale-while-revalidate=86400',
    },
  });
}
