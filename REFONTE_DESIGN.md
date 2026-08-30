# Refonte de l'interface — conformité à l'audit

Suivi d'exécution de **« ProfitPilot — Du débutant au senior »** (audit de design,
août 2026). Les sections ci-dessous suivent celles du document, pas seulement
son plan d'action : le plan (§8) ne couvre pas tout ce que les §3 à §6
prescrivent.

Ce fichier existe pour une raison simple : le chantier se fait sur plusieurs
sessions, et rien dans le code ne dit à lui seul où l'on s'est arrêté.

---

## §1.1 — Les neuf mesures, refaites

| Mesure | Avant | Règle senior | Aujourd'hui |
|---|---|---|---|
| Tailles de police distinctes | 14 | 4 | **4 rôles** (`note` 13 · `body` 15 · `card` 17 · `screen` 22) + variante montants |
| Textes sous 11 px | 184 | 0 sous 13 px | **0** — aucune taille brute ne subsiste dans le code |
| Graisses | 6 | 2 | **2** — les six noms Tailwind sont repliés sur 400/700 |
| Rayons de bordure | 7 | 2–3 | **3** (`control` 8 · `surface` 12 · `pill`) ; aucun rayon brut |
| Niveaux d'ombre | 6 | 1–2 | **2** (`card`, `pop`) ; deux valeurs brutes restent, toutes deux sur la page d'accueil publique |
| Espacements hors grille de 8 | ≈ 600 | 0 | **0** — les quatre crans fautifs de Tailwind sont redéfinis sur la grille |
| Entrées de navigation | 25 | 5 max | **4 + une action centrale**, le reste dans « Plus » |
| Couleurs des boutons de paiement | 5 saturées | 1 accent | **1 composant**, sélection par contraste |
| Fichier du tableau de bord | ≈ 1 780 l. + fausses données | découpé, états vides | **493 lignes**, huit sections, deux états vides |

La méthode qui a rendu tout cela tenable mérite d'être retenue : plutôt que de
reprendre 600 classes à la main — 600 occasions de se tromper — les crans
fautifs, les familles de couleurs hors palette et les tailles orphelines sont
**redéfinis une seule fois** dans `tailwind.config.ts` et `theme.config.ts`. Les
écrans hérités retombent sur le système sans avoir été touchés.

---

## §3 — Les huit erreurs classiques

| # | Erreur | État |
|---|---|---|
| 3.1 | Flux utilisateur incomplet | **corrigée** — états vides du premier jour ; file d'attente hors ligne ; et le chemin « mot de passe oublié », qui n'existait pas du tout |
| 3.2 | Abus d'effets visuels | **corrigée** — 2 ombres en tokens, dégradés retirés des surfaces de données |
| 3.3 | Espacement improvisé | **corrigée** — grille de 8 imposée par la configuration |
| 3.4 | Composants incohérents | **corrigée** — 3 rayons, `PaymentPicker` unique, `Button` hérité aligné sur le bouton du système |
| 3.5 | Icônes mal choisies | **corrigée** — lucide seul, contour, épaisseur constante, chaque icône libellée. **Plus un seul émoji rendu dans le produit** ; il en reste dans la page d'accueil publique (illustrations) et dans les trois pages de diagnostic |
| 3.6 | Éléments redondants | **corrigée** — en-têtes qui se répétaient supprimées ; le chevron de « Plus » survit, il annonce un départ vers une autre page |
| 3.7 | Retour interactif absent | **corrigée** — enfoncé / chargement / confirmation dans `ds/Button`, **et la pastille d'onglet** quand l'effet se produit ailleurs |
| 3.8 | Graphiques surdessinés | **corrigée** — `ds/PeriodBars` : barres plates, axe chiffré, une barre par période, valeur exacte au toucher |

### La purge des fausses données (§3.1, le point le plus grave)

Le tableau de bord n'était pas le seul à inventer des chiffres. Cinq autres
endroits en fabriquaient, et deux les rendaient imprimables :

- **`/rapports`** — quatre états financiers complets inventés (1 285 400 HTG de
  ventes, 245 800 HTG en banque) dès qu'une période ne renvoyait rien, avec un
  badge « Données démo » pour toute précaution. Ces états **s'imprimaient** :
  un marchand pouvait sortir un PDF A4 « qualité comptable » de chiffres qui
  n'étaient pas les siens et le porter à sa banque. Ils sont désormais `null`
  tant qu'ils n'existent pas — pas zéro, `null` : un bilan à zéro reste un
  bilan. `hasAnyData` distingue le compte neuf de l'exercice sans activité.
- **`/customers`** — cinq clients inventés, conservés même quand la requête échouait.
- **`/employes`** — cinq salariés fictifs, postes et salaires compris.
- **`ExpensesPage`** — cinq dépenses et trois fournisseurs, sur un écran
  intitulé « Suivi des sorties de trésorerie ».
- **`CockpitWelcome`** — l'accueil du premier jour annonçait 1 285 400 G de
  chiffre d'affaires et un « Parfum Prestige » pesant 42 % de la marge, à un
  compte vide depuis trente secondes.
- **`/onboarding`** — « J'ai détecté une hausse de marge de 15 % » est devenu
  une promesse au futur.

**Ce qui reste volontairement** : la démonstration d'avant inscription et la
maquette de la page d'accueil publique. Ce sont des illustrations produit,
montrées à quelqu'un qui n'a pas encore de compte.

### Le comportement hors connexion (§3.1, §9.8)

`lib/offlineQueue.ts` garde la vente sur le téléphone quand le réseau manque ;
`components/offline/OfflineSalesSync.tsx` la rejoue en série dès qu'il revient,
avec une bannière visible tant qu'il reste quelque chose en attente. Un
`client_ref` par vente garantit qu'un rejeu ne crée pas de doublon même si la
requête initiale était en fait passée.

---

## §4 — Les systèmes correctifs

| Système | État |
|---|---|
| 4.1 · 60/30/10 | **en place** — `theme.config.ts` ; l'accent ne sort que sur l'action principale |
| 4.2 · Rouge et vert réservés | **en place** — les familles hors palette (rose, violet, cyan…) sont redéfinies vers warning / danger / success / info / neutre |
| 4.3 · 4 tailles, 2 graisses, chasse fixe | **en place** — `fontSize` et `fontWeight` redéfinis hors `extend` |
| 4.4 · Grille de 8 points | **en place** — `spacing` corrige les crans fautifs à la source |
| 4.5 · Hiérarchie, proximité, contraste | **en place** — une dominante par écran, groupes par l'espace, `ds/Field` distingue libellé et placeholder par le contraste |

---

## §5 — Le mobile

| # | Point | État |
|---|---|---|
| 5.1 | 25 entrées → 5 + page « Plus » | **fait** — `nav.tsx`, `BottomBar`, `Sidebar`, `/plus` |
| 5.2 | Le texte grossit, plancher 13 px | **fait** — par les alias de l'échelle |
| 5.3 | Une direction de défilement par section | **fait** — tableau de bord en pile verticale |
| 5.4 | **Les quatre briques nommées dans le code** | **fait** — `Card`, `Money`/`Stat`, `EmptyState`, et **`Field`** qui manquait : chaque écran redessinait son champ |
| 5.5 | Pas de cartes imbriquées | **fait** — `Section` groupe par l'espace, `Card` reste au niveau de la donnée |
| 5.6 | Un écran, une tâche, un fichier | **fait** — 1 852 → 493 lignes |
| 5.7 | Feuilles inférieures | **fait** — `ds/BottomSheet`, montée dans le corps du document |
| 5.8 | Gestes : balayage retour, appui long | **fait** — `ScreenTransition`, appui long sur les créances |
| 5.9 | Cibles tactiles 44 px | **fait** — `min-h-touch` dans le système ; les icônes sont dessinées en 16–24 px dans des cibles de 44 |
| 5.10 | Les deux états vides | **fait** — `FirstRun` et `NoResult` |

---

## §6 — Junior contre senior, les trois écrans

### 6.1 · L'écran de connexion — refait

| Ligne du tableau | Ce qui a changé |
|---|---|
| **Couleur** | Le bouton était marine comme tout le reste : l'écran n'avait **aucun** point d'accent, donc rien ne guidait. « Se connecter » est le seul élément émeraude. |
| **Hiérarchie** | Libellés distincts des placeholders par le contraste (`ds/Field`). L'action est un bouton plein ; « Pas de compte ? » et « Mot de passe oublié ? » sont en texte. |
| **Proximité** | Le bloc logo + titre + sous-titre est verrouillé à espacement constant, puis 24 px avant le formulaire. Le logo ne flotte plus à mi-distance. |
| **Contexte haïtien** | **Connexion par numéro en premier**, +509 prérempli, clavier numérique ; l'e-mail en option secondaire. Message de réseau clair, distinct du « serveur injoignable ». |

Le chemin « mot de passe oublié » n'existait pas — ni lien, ni page. Deux écrans
ont été créés (`/auth/forgot-password`, `/auth/reset-password`) et ajoutés aux
routes publiques du proxy, sans quoi le lien aurait renvoyé vers la connexion.

**Comment marche la connexion par numéro.** Le mot de passe reste la preuve ; le
téléphone n'est qu'un identifiant — celui que le marchand connaît par cœur, là
où son adresse e-mail est souvent une formalité créée le jour de l'inscription.
La résolution « numéro → compte » se fait dans une action serveur
(`app/actions/phoneAuth.ts`) et **seulement après vérification du mot de passe** :
sans cela, on essaierait les numéros un à un pour récolter des adresses.

> **À faire tourner** : la migration `supabase/migrations/20260829_user_phones.sql`.
> Tant qu'elle n'est pas appliquée, la connexion par numéro répond franchement
> « indisponible pour le moment, utilisez votre e-mail » — elle ne fait pas
> douter le marchand de son propre numéro. L'e-mail continue de fonctionner.

Le numéro est demandé à l'inscription. Quand la confirmation par e-mail est
active, l'inscription ne pose pas de session : le numéro attend dans les
métadonnées et se rattache à la première connexion réussie.

### 6.2 · Le tableau de bord — refait

L'en-tête s'efface, la santé du jour vient en premier, les graphiques sont
neutres sauf la période en cours, et les fausses données ont laissé la place à
l'état vide de premier accueil.

### 6.3 · Les créances — refait

Trois zones sans un seul trait, montants en marine et chasse fixe, rouge
réservé au retard, et l'appui long qui ouvre les actions rapides.

---

## §7 — Les six moments chorégraphiés

| # | Moment | État |
|---|---|---|
| 1 | La vente enregistrée | **fait** — `.pp-fly`, `.pp-check` |
| 2 | La créance soldée | **fait** — `.pp-settled` |
| 3 | Le score de santé | **fait** — `.pp-gauge` |
| 4 | L'alerte de taux | **fait** — `.pp-drop`, une seule fois par jour |
| 5 | L'objectif mensuel atteint | **fait** — `GoalReached`, une fois par mois |
| 6 | Le passage d'un écran à l'autre | **fait** — `ScreenTransition` (balayage retour, parallaxe 35 %), `#pp-app` qui recule sous les feuilles, `BottomBar` qui s'efface en saisie |

Toutes respectent le budget : `transform` et `opacity` seulement, durées de
150–300 ms pour les transitions, 600–800 ms pour les moments, interruptibles, et
le réglage « réduire les animations » du téléphone fait autorité.

---

## §9 — La liste de contrôle

| # | Contrôle | Seuil | État |
|---|---|---|---|
| 1 | Le texte | Bloquant | ✅ passe de micro-copie complète |
| 2 | Aucune donnée fictive | Bloquant | ⚠️ deux rechutes trouvées **après** la purge, et corrigées : un jeu de contrôles fictifs et un identifiant fabriqué (vague 5) |
| 3 | Typographie | Bloquant | ✅ 4 tailles, 2 graisses, plancher 13 px |
| 4 | Couleurs | Bloquant | ✅ 60/30/10, dégradés retirés des données |
| 5 | Espacement | Bloquant | ✅ grille de 8 |
| 6 | Composants | Bloquant | ✅ tokens, plus de composant dupliqué divergent |
| 7 | Cibles tactiles | Bloquant | ✅ 44 px, barre à 5 entrées |
| 8 | Retour interactif · hors connexion | Bloquant | ✅ trois états + file d'attente et synchronisation visible |
| 9 | Graphiques | Bloquant | ✅ `PeriodBars` partout, y compris les statistiques boutique |
| 10 | Redondances | Fort | ✅ |
| 11 | Séquence | Fort | ✅ les six moments |
| 12 | **Test des conditions réelles** | Bloquant | ❌ **non fait — voir ci-dessous** |

---

## Vague 5 — les écrans secondaires (section « Compte »)

Les §1.1, §4 et §5 ont été tenus par la **configuration** : redéfinir les
échelles dans `tailwind.config.ts` fait retomber sur le système les 1 800
classes déjà écrites, sans toucher aux fichiers. C'est ce qui a rendu la refonte
faisable — et c'est aussi ce qui a masqué ce qu'une configuration ne peut pas
rattraper :

- un **émoji** n'est pas une classe : rien ne le remplace à distance ;
- une **couleur en valeur littérale** (`bg-[#001F3F]`) échappe à la palette et
  n'a pas de variante sombre ;
- un **composant redessiné à la main** (interrupteur, menu déroulant, boîte de
  dialogue) ne devient pas cohérent parce que le rayon a changé ;
- et surtout : **un contrôle qui ne commande rien** reste un mensonge, quel que
  soit son style.

### Les deux rechutes du contrôle bloquant n°2

La purge des fausses données avait traité les CHIFFRES. Deux écrans en
fabriquaient encore, autrement :

- **`/automation`** — six interrupteurs branchés sur un `useState` local, dont
  deux positionnés sur « actif » à l'ouverture. Le marchand pouvait croire que
  ses rappels de dettes partaient tout seuls ; rien ne partait, et un
  rafraîchissement remettait tout comme avant. L'écran ne montre plus que les
  **trois automatismes qui tournent réellement** (`vercel.json` → `/api/cron/*`),
  avec leur heure de passage, et ses interrupteurs écrivent pour de bon :
  `notification_preferences` pour deux d'entre eux, `businesses.weekly_digest_enabled`
  pour le troisième — un réglage qui existait en base, que le cron du dimanche
  lisait déjà, et qu'aucun écran ne permettait d'éteindre.
- **`/api-access`** — une clé d'API tirée au sort dans le navigateur
  (`'pp_live_sk_' + Math.random()…`), étiquetée « Live », avec bouton « Copier »,
  exemple `curl` et l'avertissement « ne partagez jamais cette clé ». Ni la table
  `api_keys`, ni le domaine `api.profitpilot.app`, ni les cinq points d'entrée
  `/v1/…` n'existent dans ce dépôt. L'écran dit désormais la vérité : l'accès est
  en préparation, et voici comment le demander.
  **Décision produit en attente** : tant que l'API n'existe pas, `api_access` ne
  devrait pas figurer parmi les arguments de vente de l'offre Elit
  (`lib/plans.ts`).

### Deux briques ajoutées au système

| Brique | Pourquoi |
|---|---|
| `ds/SelectField` | chaque écran redessinait son `<select>` — cinq hauteurs, quatre bordures, un chevron en SVG une fois sur deux. Le menu reste **natif** : celui du téléphone se manipule au pouce et connaît la langue de l'appareil. |
| `ds/Switch` | deux écrans redessinaient l'interrupteur, tous deux avec une cible de 24 px — la moitié des 44 px exigés (§5.9). État actif en **marine** et non en émeraude : douze interrupteurs verts, c'est douze actions principales, donc aucune (§4.1). |

### Les six écrans repris

| Écran | Ce qui a changé |
|---|---|
| `/activity` | 14 émojis → icônes lucide ; **10 couleurs de badges → 3** (créer, supprimer, archiver) ; tableau de 7 colonnes sur mobile → lignes en dessous de `md` ; boîte de dialogue → feuille inférieure ; JSON brut « avant/après » → une ligne par champ modifié ; bilingue ; « Switché » et « Reset » retirés |
| `/notifications` | 10 émojis et 10 fonds colorés → icônes lucide, ambre pour le stock, vert pour l'encaissé, gris pour le reste ; une dépense ne s'affiche plus en **rouge** ; le non-lu se marque par le contraste, plus par un fond bleu ; interrupteurs du système ; chaque réglage dit ce qu'il déclenche |
| `/automation` | voir ci-dessus — les contrôles commandent enfin quelque chose |
| `/api-access` | voir ci-dessus — plus de clé fabriquée |
| `/security` | émojis de navigateurs (🦊 pour Firefox) supprimés — le nom est écrit juste à côté ; icônes d'appareil en lucide ; rouge réduit à la seule action destructive ; bandeaux maison → `sonner` ; **« Si vous reconnaissez pas une connexion »** corrigé ; conseils réécrits, dont « personne de ProfitPilot ne vous demandera jamais votre mot de passe » |
| `/backup` | 15 émojis dont ✅ ❌ ⏳ en guise d'états → étiquettes qui portent un MOT ; barre de 3 compteurs qui doublait la liste → sous-titre d'écran ; 4 boutons de 28 px par ligne → feuille d'actions pleine largeur ; 2 boîtes de dialogue → feuilles ; « stockées de façon sécurisée et chiffrées » retiré, faute de pouvoir le tenir |

### La fin de la vague — tout le produit y est passé

Les écrans annoncés comme restants ont été repris dans la foulée.

**Les couleurs écrites en dur : 1 179 remplacements dans 74 fichiers.**
Un passage mécanique a ramené chaque valeur littérale sur son token — à rendu
identique, la substitution étant faite par table (`#001F3F` → `primary`,
`#50C878` → `accent`, `#0F172A` → `anthracite`, et ainsi de suite), et en
choisissant le token sombre quand la classe portait le préfixe `dark:`. Quatre
valeurs hors palette (deux rouges Tailwind d'origine) retombent sur `danger`.

Ce qui subsiste volontairement : le vert de WhatsApp (`#25D366` — il appartient
à WhatsApp) et les trois pastilles de la maquette de navigateur de la page
d'accueil.

**Les émojis : plus un seul rendu dans le produit.**

| Écran | Ce qui a été remplacé |
|---|---|
| `/customers` | ⭐ ⚠ 📞 ✉️ 📅 🔑 ✅ 📋 → `Star`, `Phone`, `Mail`, `CalendarDays`, `Hash`, `CheckCircle2`, `FileText` ; « ⭐ VIP » devient « Client fidèle » |
| `NewSaleForm` | 💵 📱 📲 💳 en tête des modes de paiement, 📦 sur les produits sans photo, ✓ ✕ ⏳ ⚠️ dans les libellés |
| `ExpensesPage` | 💵 💳 📱 dans deux menus déroulants et dans le tableau, 💼 💳 ⏳ sur les filtres rapides, 🏢 devant le fournisseur |
| `/dettes`, `NewPurchaseForm`, `/suppliers` | ✓ ⏳ collés aux libellés de statut |
| `/boutique` | six onglets dessinés par le clavier (⚙️ 🎨 💳 📋 👁️ 🚀) → `Settings`, `Palette`, `CreditCard`, `FileText`, `Eye`, `Rocket` ; ⭐ 🛒 📦 🔗 ✅ 🌐 💡 ⚠️ 📱 |
| `/rapports/comptabilite` | cinq onglets (📖 📒 ⚖️ 🏦 ✍️), 🤖 en avatar, 🗑️, et les ✓ / ⚠ collés aux verdicts d'équilibre |
| `/analytics` | 💰 📉 ✨ 🔮 🏆 📈 ⚠️ → `Wallet`, `TrendingDown`, `Sparkles`, `LineChart`, `Award`, `TrendingUp`, `AlertTriangle` |
| `/onboarding` | trente-deux, dont le 🤖 de Pilot AI en cinq tailles → `Bot` ; les six secteurs et les quatre objectifs prennent leur icône |
| `/employes` | 📞 ✉️ 🏢 📅 ⏳ 🔑 de la fiche employé |
| `NotificationBell` | le même jeu que `/notifications` : la cloche et sa liste ne peuvent pas montrer deux dessins pour un même événement |
| `CockpitWelcome`, `WelcomeAnimation`, `PilotAIGuide`, `PermissionGate`, `SuppliersModal`, `ReportActions`, `BalanceSheet`, `SaleInvoiceModal`, `InvoiceModal`, `QuickActionForm`, `/boutique/stats` | ✕ 👋 🚀 🤖 ✨ 📧 📱 📍 ⚖️ 🏛️ 💸 📈 ✓ ⚠ |
| La vitrine publique (`/store/[slug]`) | 🛒 📦 📋 🏠 🚚 💳 📝 🔒 ⭐ 🏷 🎉 ✅ ❌ — c'est l'écran que voient les CLIENTS du marchand |
| `/pricing`, `/checkout`, `/settings`, `/rapports`, `/entreprises`, `/blog`, `/faq`, `/guide`, `/auth/*` | 🔔 🚀 ★ ✦ 📅 🏢 ✉️ 💬 ✅ 🎉 ✓ |

**Un piège trouvé en chemin.** Dans `/rapports/comptabilite`, la couleur du
bandeau de confirmation était décidée par `saveMsg.startsWith('✓')` : retirer
l'émoji du message aurait teint en rouge, silencieusement, toutes les
confirmations. L'état est passé sur un booléen, ce qu'il aurait dû être.

**Ce qui garde ses émojis, volontairement** : la page d'accueil publique et sa
démonstration d'avant inscription (illustrations produit, jamais des icônes
d'interface), et les trois pages de diagnostic (`/debug`, `/migrate`,
`/cookies-debug`) qui ne sont pas des écrans de marchand.

---

## Le verrouillage par offre (hors audit)

Ajouté à la même session. Le registre des offres (`lib/planFeatures.ts`) était
complet, juste, et lu par presque personne : trois écrans sur vingt le
consultaient, et chacun avait recopié sa propre carte « Passer Expert » — trois
couleurs, trois formulations, le nom de l'offre écrit en dur.

- `components/nav.tsx` porte une table unique `ROUTE_FEATURE` : adresse →
  fonctionnalité exigée. La barre latérale, la page « Plus » et le verrou
  d'écran la lisent toutes les trois.
- `components/PlanLock.tsx` : un seul écran verrouillé (`PlanLockScreen`), une
  seule pastille de menu (`PlanTag`), un seul encart de carte (`PlanTeaser`).
  Posé une fois dans `AppShell`, il couvre les vingt destinations d'un coup.
- Une destination hors offre reste **visible** et porte le nom de l'offre qui
  l'ouvre : on n'achète pas ce qu'on n'a jamais vu.
- Le tableau de bord change vraiment d'une offre à l'autre : le score de santé
  et « À regarder » cèdent la place à un encart, **à la même place** — un écran
  qui se recompose sous l'œil fait croire à un bogue.

## Ce qui reste

**Le contrôle 12 ne peut pas être coché depuis un éditeur.** « Écran relu sur un
Android modeste, luminosité maximale simulée, d'une seule main. Ce qui ne se lit
pas debout dans une boutique ne se livre pas. » Le balayage retour, l'appui
long, la barre qui s'efface en saisie et la lisibilité en plein soleil se jugent
au doigt et à l'œil. C'est ce qui manque de plus important, et cela ne
s'écrit pas depuis un éditeur.

Puis, par ordre de poids :

1. **Le créole.** Le mécanisme existe partout (`t({ fr, ht })`) ; les tournures
   créoles méritent d'être relues par quelqu'un dont c'est la langue. La vague 5
   en a ajouté six écrans entiers.
2. **La décision produit sur `api_access`** : l'écran ne ment plus, mais l'offre
   Elit vend toujours un accès API qui n'existe pas (`lib/plans.ts`). Soit on le
   construit, soit on le retire des arguments de vente.
3. **La durée de l'essai, annoncée à deux endroits différents.**
   `/onboarding` promet « 72 heures d'essai gratuit », `hooks/useSubscription.ts`
   en accorde 720 (trente jours). Ce n'est pas un défaut d'affichage : c'est un
   chiffre de vente qui contredit le code. Il faut trancher lequel est le bon.
4. **Le mode sombre des écrans hérités.** Les couleurs sont désormais des
   tokens, ce qui était le préalable ; mais un `bg-white` sans `dark:` reste
   blanc dans le thème sombre. Le passage se fera écran par écran, à l'occasion
   de la prochaine reprise de chacun.

**Fait depuis** : `app/actions/financialReporting.ts` passe désormais par
`getBusinessContext()` — il prenait « la plus ancienne boutique du
propriétaire », donc le mauvais bilan pour un compte multi-entreprises.

---

## Avant chaque livraison

La liste de contrôle du §9 s'applique intégralement. Le point 2 est celui qui a
coûté le plus cher ici : *aucune donnée fictive — tout chiffre affiché appartient
au marchand.* Un écran qui invente un chiffre pour ne pas paraître vide est un
écran qui ment, et un logiciel de gestion qui ment une fois ne se rattrape pas.
