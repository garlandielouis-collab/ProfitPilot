// ─────────────────────────────────────────────────────────────────────────────
// L'application Android — une coque Capacitor autour de l'application web
//
// Option B de l'audit de la phase 0 : le code web reste le seul code de
// l'interface. La coque l'affiche, et lui donne ce que le navigateur ne sait
// pas faire (le Bluetooth Classic des imprimantes, phase 4).
//
// ── Pourquoi l'application HÉBERGÉE et pas des fichiers embarqués ──────────
//
// L'application repose sur 260 actions serveur Next.js : elle ne peut pas être
// exportée en fichiers statiques sans être réécrite. La coque charge donc
// l'adresse publique. Conséquence heureuse : une correction déployée sur
// Vercel arrive dans l'application sans republier sur le Play Store.
//
// La documentation de Capacitor dit de `server.url` : « This is not intended
// for use in production. » C'est le risque n°4 de l'audit, assumé et à
// valider en phase 1 (démarrage, hors ligne, examen du Play Store). Le repli,
// s'il le faut : embarquer un noyau local minimal (connexion, vente hors ligne).
//
// L'adresse se change sans toucher au code : `CAP_SERVER_URL` au moment du
// `cap sync` — par exemple l'aperçu Vercel d'une branche pour la tester sur
// un téléphone avant de la fusionner.
// ─────────────────────────────────────────────────────────────────────────────

import type { CapacitorConfig } from '@capacitor/cli';

const SERVER = (process.env.CAP_SERVER_URL || 'https://profitpilot-ten.vercel.app').replace(/\/$/, '');

const config: CapacitorConfig = {
  // Définitif dès la première publication sur le Play Store : à confirmer
  // avant la phase 6 (voir mobile/README.md).
  appId: 'ht.profitpilot.app',
  appName: 'ProfitPilot',
  // Les fichiers embarqués : seulement la page « pas de réseau ». Tout le
  // reste vient du serveur.
  webDir: 'mobile/www',
  // Le marqueur qui permet à l'application web de savoir qu'elle tourne dans
  // la coque (lib/native.ts), y compris côté serveur.
  appendUserAgent: 'ProfitPilotApp/1',
  backgroundColor: '#FFFFFF',
  server: {
    // On ouvre sur l'accueil du marchand, pas sur la page marketing : le
    // proxy renvoie à la connexion s'il n'y a pas de session.
    url: `${SERVER}/dashboard`,
    androidScheme: 'https',
    // Réseau absent au démarrage : une page locale en kreyòl plutôt que
    // l'erreur brute de la WebView.
    errorPath: 'offline.html',
  },
  android: {
    path: 'mobile/android',
    // Next 16 vise Chrome 111 et plus. En dessous, l'application s'ouvrirait
    // en page blanche ; Capacitor affiche à la place une demande de mise à
    // jour de la WebView (Android System WebView, sur le Play Store).
    minWebViewVersion: 111,
  },
  plugins: {
    SystemBars: {
      // Les variables `--safe-area-inset-*` sont injectées : la barre du bas
      // ne passe jamais sous les boutons système (bord à bord, Android 15+).
      insetsHandling: 'css',
      style: 'DEFAULT',
    },
  },
};

export default config;
