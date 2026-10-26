# ProfitPilot — l'application Android

Option B de l'audit (phase 0, 26/10/2026) : une **coque Capacitor** autour de
l'application web. L'interface reste le code web de ce dépôt ; la coque l'affiche
et lui donnera ce que le navigateur ne sait pas faire (Bluetooth Classic des
imprimantes, phase 4). La version web continue de fonctionner, inchangée.

## Comment c'est fait

| Élément | Où |
|---|---|
| Configuration de la coque | `capacitor.config.ts` (racine) |
| Projet Android | `mobile/android/` (généré par Capacitor, à garder dans git) |
| Page « pas de réseau » | `mobile/www/offline.html` |
| Icônes et écran de démarrage | générés depuis `public/profitpilot-logo.png` par `npm run mobile:icons` |
| Pont avec la coque (retour, liens, mesure) | `components/native/NativeBridge.tsx`, `lib/native.ts`, `lib/backStack.ts` |
| Build de l'APK | `.github/workflows/android-apk.yml` (GitHub Actions) |

La coque **charge l'application hébergée** (`server.url`) : les 260 actions
serveur Next.js empêchent un export statique. Une correction déployée sur Vercel
arrive donc dans l'application sans republier sur le Play Store. La documentation
de Capacitor dit de ce mode « not intended for use in production » : c'est le
risque n°4 de l'audit, à valider sur téléphone pendant cette phase.

L'adresse chargée se choisit par `CAP_SERVER_URL` (par défaut la production,
`https://profitpilot-ten.vercel.app`). Pour essayer une branche sur téléphone,
pointer la coque vers l'aperçu Vercel de la branche.

## Commandes

```bash
npm run mobile:sync    # écrit mobile/www/app-url.js puis `cap sync android`
npm run mobile:icons   # régénère icônes et logo de démarrage
```

Ni Java ni le SDK Android ne sont nécessaires sur le poste : l'APK se construit
sur GitHub.

## Obtenir l'APK de test

1. Pousser la branche `claude/app-mobile-capacitor` (le workflow part tout seul
   quand `mobile/`, `capacitor.config.ts` ou les scripts changent), ou lancer
   « APK Android (test) » à la main depuis l'onglet **Actions** de GitHub, avec
   éventuellement une autre adresse de serveur.
2. Télécharger l'artefact `profitpilot-debug-apk` en bas de l'exécution. Sa
   taille est écrite dans le résumé.
3. Sur le téléphone : autoriser l'installation depuis cette source, ouvrir
   `app-debug.apk`. Ou, téléphone branché en USB avec le débogage activé :
   `adb install -r app-debug.apk`.

Cet APK est signé avec la clé de débogage de Gradle : il sert aux essais, pas au
Play Store (signature de production en phase 6).

## Mesurer

| Mesure | Comment |
|---|---|
| Taille de téléchargement | Résumé de l'exécution GitHub Actions (taille de l'APK) |
| Démarrage de l'activité | `adb shell am start -W -n ht.profitpilot.app/.MainActivity` → `TotalTime` |
| Premier affichage de l'interface | `adb logcat \| grep pp-startup` : la coque écrit une ligne JSON (`ttfbMs`, `fcpMs`, `domReadyMs`, `loadMs`, `jsTransferKB`) à chaque démarrage |
| Mémoire | `adb shell dumpsys meminfo ht.profitpilot.app` avant et après 30 minutes d'utilisation |
| Inspecter la page | Chrome sur l'ordinateur → `chrome://inspect` (WebView de l'application de débogage) |

Démarrage à froid : forcer l'arrêt (`adb shell am force-stop ht.profitpilot.app`)
avant chaque mesure. Faire 3 mesures et garder la médiane.

## Comportements de la coque (phase 1)

- **Retour Android** : une feuille ouverte (vente, dépense, crédit) se referme
  d'abord ; sur l'accueil, il faut deux retours en moins de 2 s pour sortir
  (« Peze retounen ankò pou soti ») ; ailleurs, retour à l'écran précédent.
- **Liens externes** (WhatsApp, appels) : ouverts dans l'application concernée.
- **Pas de réseau au démarrage** : page locale en kreyòl, nouvelle tentative
  automatique au retour du réseau. L'usage hors ligne complet est la phase 2.
- **WebView trop ancienne** (avant Chrome 111) : Capacitor demande de la mettre à
  jour au lieu d'afficher une page blanche.

## À décider avant la publication (phase 6)

- **Identifiant de l'application** : `ht.profitpilot.app`. Il devient définitif à
  la première publication sur le Play Store.
- **Clé de signature de production** et son lieu de conservation.
- **Paiement de l'abonnement** dans l'application (règles Google Play) : options à
  présenter avant de publier.
