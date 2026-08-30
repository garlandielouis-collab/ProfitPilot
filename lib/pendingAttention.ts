'use client';

// ─────────────────────────────────────────────────────────────────────────────
// La pastille sur l'onglet — le troisième état du retour interactif (§3.7)
//
// « Trois états obligatoires sur toute action qui écrit des données : enfoncé,
//   chargement, confirmation (coche + mise à jour visible du solde ou de la
//   liste, ET PASTILLE SUR L'ONGLET CONCERNÉ QUAND L'EFFET SE PRODUIT AILLEURS
//   — comme un point sur l'onglet « Créances » quand une vente à crédit vient
//   d'être créée). »
//
// C'est le cas que la coche seule ne couvre pas. Le marchand vend à crédit
// depuis l'écran de vente ; la conséquence — quelqu'un lui doit de l'argent —
// apparaît sur un AUTRE écran, qu'il ne regarde pas à cet instant. Sans la
// pastille, la créance existe sans que personne ne l'ait vue naître.
//
// Le point s'éteint quand le marchand ouvre l'écran concerné : il a vu, la
// pastille a fini son travail. Une pastille qui ne s'éteint jamais devient un
// décor, et on cesse de la lire.
//
// Le stockage est local au téléphone, volontairement : c'est un « vous n'avez
// pas encore regardé », pas une donnée du commerce. Rien à synchroniser.
// ─────────────────────────────────────────────────────────────────────────────

const KEY = 'pp_attention';
const EVENT = 'pp:attention';

/** Les écrans qui peuvent réclamer un regard depuis un autre écran. */
export type AttentionKey = 'receivables';

function read(): Record<string, boolean> {
  if (typeof window === 'undefined') return {};
  try {
    return JSON.parse(window.localStorage.getItem(KEY) ?? '{}') as Record<string, boolean>;
  } catch {
    // Navigation privée, stockage plein, données corrompues : une pastille
    // manquante n'a jamais empêché personne de travailler.
    return {};
  }
}

function write(state: Record<string, boolean>): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(state));
  } catch { /* voir ci-dessus */ }
  window.dispatchEvent(new Event(EVENT));
}

/** Quelque chose vient de se produire sur cet écran-là. */
export function flagAttention(key: AttentionKey): void {
  if (typeof window === 'undefined') return;
  const state = read();
  if (state[key]) return;
  state[key] = true;
  write(state);
}

/** Le marchand vient d'ouvrir l'écran : la pastille a fini son travail. */
export function clearAttention(key: AttentionKey): void {
  if (typeof window === 'undefined') return;
  const state = read();
  if (!state[key]) return;
  delete state[key];
  write(state);
}

export function hasAttention(key: AttentionKey): boolean {
  return read()[key] === true;
}

/** S'abonne aux changements — y compris depuis un autre onglet du navigateur. */
export function subscribeAttention(listener: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  window.addEventListener(EVENT, listener);
  window.addEventListener('storage', listener);
  return () => {
    window.removeEventListener(EVENT, listener);
    window.removeEventListener('storage', listener);
  };
}
