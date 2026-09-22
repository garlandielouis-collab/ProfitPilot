// ─────────────────────────────────────────────────────────────────────────────
// La cadence des routes appareil
//
// En mémoire, comme `app/api/store/track/route.ts` — et avec la même limite
// assumée : sur Vercel, chaque instance a son compteur, donc la limite réelle est
// « N par minute PAR INSTANCE ». Ce n'est pas une défense contre un attaquant
// distribué ; c'est un garde-fou contre une boucle de synchronisation mal écrite,
// qui est le cas réellement probable. Une limite partagée demanderait un Redis
// que ce projet n'a pas.
//
// Un compteur par ROUTE (`bucket`) : un téléphone qui bat toutes les minutes ne
// doit pas consommer le quota de ses envois de reçus.
// ─────────────────────────────────────────────────────────────────────────────

const WINDOW_MS = 60_000;
const buckets = new Map<string, Map<string, { count: number; resetAt: number }>>();

export function overRate(bucket: string, key: string, max: number): boolean {
  const now = Date.now();
  let hits = buckets.get(bucket);
  if (!hits) { hits = new Map(); buckets.set(bucket, hits); }

  const entry = hits.get(key);
  if (!entry || entry.resetAt <= now) {
    hits.set(key, { count: 1, resetAt: now + WINDOW_MS });
    // Un ménage opportuniste : sans lui, la carte grossit indéfiniment sur une
    // instance longue-durée.
    if (hits.size > 5_000) {
      for (const [k, v] of hits) if (v.resetAt <= now) hits.delete(k);
    }
    return false;
  }

  entry.count += 1;
  return entry.count > max;
}

/** La clé de cadence : le jeton s'il y en a un, l'adresse sinon. */
export function rateKeyFor(headers: Headers, token: string | null): string {
  // Pas l'inverse : plusieurs appareils d'un même commerce peuvent sortir par la
  // même adresse (un routeur partagé, très courant), et les compter ensemble les
  // ferait s'étrangler l'un l'autre.
  return token ?? (headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'inconnu');
}
