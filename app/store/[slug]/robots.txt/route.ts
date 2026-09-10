// ─────────────────────────────────────────────────────────────────────────────
// robots.txt d'une vitrine
//
// Une boutique non publiée ne doit pas être indexée. Sans ce fichier, un
// marchand qui prépare sa vitrine pendant deux semaines la voit apparaître dans
// Google à moitié faite — et l'y voit encore longtemps après l'avoir finie.
// ─────────────────────────────────────────────────────────────────────────────

import { headers } from 'next/headers';
import { loadStore } from '../../../../lib/storefrontData';
import { storePublicUrl } from '../../../../lib/storeTheme';

export const runtime = 'nodejs';
export const revalidate = 3600;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const store = await loadStore(slug);

  // `loadStore` ne renvoie que les vitrines actives : pas de vitrine ici
  // signifie soit inexistante, soit non publiée. Dans les deux cas, on ferme.
  if (!store) {
    return new Response('User-agent: *\nDisallow: /\n', {
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }

  const h = await headers();
  const storeHost = h.get('x-pp-store-host');
  const ownHost   = Boolean(storeHost) && h.get('x-pp-store-slug') === slug;

  const origin = ownHost
    ? `${storeHost!.startsWith('localhost') ? 'http' : 'https'}://${storeHost}`
    : (process.env.NEXT_PUBLIC_APP_URL ?? storePublicUrl(store));
  const base = ownHost ? '' : `/store/${slug}`;

  const body =
    'User-agent: *\n' +
    'Allow: /\n' +
    // Le panier et le paiement n'ont rien à faire dans un index : ce sont des
    // pages d'état, vides pour un robot.
    `Disallow: ${base}/cart\n` +
    `Disallow: ${base}/checkout\n` +
    `Disallow: ${base}/confirmation\n` +
    '\n' +
    `Sitemap: ${origin}${base}/sitemap.xml\n`;

  return new Response(body, {
    headers: {
      'Content-Type':  'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=0, s-maxage=3600',
    },
  });
}
