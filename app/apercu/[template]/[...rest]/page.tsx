// ─────────────────────────────────────────────────────────────────────────────
// Les pages que l'aperçu ne rend pas
//
// L'aperçu porte désormais ses propres liens (`/apercu/<gabarit>/…`), pour que
// la fiche produit s'ouvre dans le gabarit regardé. Il rend l'accueil et la
// fiche ; le catalogue, les collections, le panier, la caisse et « À propos »
// restent ceux de la boutique en ligne.
//
// Sans cette route, ces liens mèneraient à une 404 — une vitrine qui a l'air
// cassée au moment où le marchand décide d'en changer. Ils mènent donc à la
// page EN LIGNE correspondante, adresse comprise : le marchand voit qu'il a
// quitté l'aperçu, ce qui vaut mieux qu'une page qui prétendrait le contraire.
// ─────────────────────────────────────────────────────────────────────────────

import { redirect } from 'next/navigation';
import { openApercu } from '../openApercu';

type Props = {
  params:       Promise<{ template: string; rest: string[] }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function ApercuElsewhere({ params, searchParams }: Props) {
  const { template, rest } = await params;

  const opened = await openApercu(template);
  if (opened.kind === 'screen') return opened.node;

  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(await searchParams)) {
    if (Array.isArray(value)) value.forEach((v) => query.append(key, v));
    else if (value !== undefined) query.set(key, value);
  }

  const path = rest.map(encodeURIComponent).join('/');
  const qs   = query.toString();
  redirect(`${opened.liveBase}/${path}${qs ? `?${qs}` : ''}`);
}
