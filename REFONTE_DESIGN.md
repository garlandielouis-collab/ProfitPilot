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
| Tailles de police distinctes | 14 | 4 (+1 héro) | **4 rôles aux valeurs du §12** (`note` 12 · `body` 14 · `card` 16 · `screen` 24) + le héro à 32 ; les variantes montants reprennent la taille du titre |
| Textes sous 11 px | 184 | 0 sous 12 px | **0** — aucune taille brute ne subsiste dans le code |
| Graisses | 6 | 2 | **2** — 400 / 600, plus `font-hero` (700) réservé au montant héro. *Les six noms retombaient tous sur 400/700 : une seule graisse lourde, corrigée vague 6* |
| Rayons de bordure | 7 | 2–3 | **3 + 1** (`inner` 4 · `control` 8 · `surface` 12 · `pill`), **en échelle emboîtée** ; aucun rayon brut. *Les alias `lg`/`xl`/`2xl` valaient tous 12 : pas d'échelle, corrigé vague 6* |
| Niveaux d'ombre | 6 | 1–2 | **2** (`card`, `pop`), à la recette du §24 : marine, X 0, blur = 2×Y, spread négatif. Deux valeurs brutes restent, sur la page d'accueil publique |
| Espacements hors grille de 8 | ≈ 600 | 0 | **0** — les quatre crans fautifs de Tailwind sont redéfinis sur la grille |
| Entrées de navigation | 25 | 5 max | **4 + une action centrale**, le reste dans « Plus » |
| Couleurs des boutons de paiement | 5 saturées | 1 accent | **1 composant**, sélection par contraste |
| Cibles tactiles sous 44 px | 51 (mesurées, vague 6) | 0 | **0** |
| Icônes dessinées sous 16 px | 17 | 0 | **0** (2 chevrons à 12, exception du §9) |
| Paires figure/fond sous AA | 1 (`success`) | 0 | **0** — les 19 paires mesurées |
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
| 5.2 | Le texte grossit, plancher 12 px | **fait** — par les alias de l'échelle |
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
| 3 | Typographie | Bloquant | ✅ 4 tailles (12/14/16/24 + 32), 2 graisses, plancher 12 px |
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
  *Tranchée le 15/09/2026* : `lib/plans.ts` ne l'a jamais annoncée — rien à
  retirer. `api_access` reste dans les droits d'Elit (l'en sortir montrerait
  « passez à Elit » à un abonné Elit). C'est l'indice de navigation qui a
  changé : il promettait « Brancher un autre outil » et menait à une liste
  d'attente ; il dit « En préparation — demander un accès ».

### La troisième rechute, et les deux écrans introuvables (15/09/2026)

- **`/checkout`, la carte Visa.** Une troisième carte de paiement s'affichait,
  sélectionnable, qui menait à un formulaire grisé et à un bouton « Bientôt
  disponible » impossible à presser. Le marchand qui paie son abonnement par
  carte la choisissait, traversait deux écrans, et ressortait sans avoir payé —
  au moment précis où il avait décidé de donner de l'argent. Deux méthodes
  restent : les deux qui encaissent vraiment.

- **`/boutique/stats` n'était liée nulle part.** Écran complet et juste
  (l'entonnoir du §30), zéro lien entrant dans tout le dépôt : ni la
  navigation, ni le tableau de bord, ni aucune des cinq entrées du module
  boutique. Devenu le second onglet de « Lancement », qui est la porte du
  module (§43) : « où en suis-je ? » puis « qu'est-ce que ça donne ? ».

- **`/employees` non plus.** Une seconde page « Équipe », sans entrée de menu,
  qui listait les mêmes personnes sous un autre nom, dans un style d'avant la
  refonte (couleurs littérales, `confirm()`, aucune traduction), et les
  invitait par un **second chemin** qui consommait un siège sans page
  d'acceptation. Fusionnée dans `/employes` : la fiche RH et l'accès à
  l'application sont deux faits sur la même personne, jamais deux écrans.

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

### Deux corrections d'offre, après coup

**Pilot AI.** Le registre laissait un « avant-goût » de trois questions à
Esansyel (`ai_taster`), et `/ai-assistant` n'était pas dans `ROUTE_FEATURE` —
choix d'implémentation, pas décision produit. Il ne tenait pas : la route
`/api/ai/chat` exige depuis toujours un abonnement actif parmi
`plansWithFeature('ai_assistant')`. L'écran s'ouvrait donc en grand pour un
marchand d'Esansyel, et sa première question revenait en 403. Pilot AI commence
maintenant à Kwasans, à l'écran comme au serveur, et le verrou explique à partir
de quelle offre l'assistant répond.

**Le parrainage.** « Un marchand inscrit avec votre code, et les Rapports vous
sont offerts trente jours. » Il a fallu une idée nouvelle : un droit peut venir
d'ailleurs que de l'offre.

- `feature_grants` porte un droit temporaire, POSÉ PAR-DESSUS l'offre. Écrire
  le cadeau dans `subscriptions` aurait fait passer le marchand pour un abonné
  Kwasans auprès de la facturation, des relances et de la page de prix — un
  cadeau qui ment sur ce qu'il est finit par se facturer à quelqu'un.
- `hasFeature()` (serveur) et `canUse()` (écran) lisent l'offre **et** les
  droits. Sans les deux, l'écran verrouille une page que le serveur laisse
  passer.
- La récompense s'écrit avec la clé de service : elle appartient au parrain, pas
  au filleul qui la déclenche. `grant_feature_days()` fait le calcul de
  l'échéance dans la base — deux filleuls inscrits en même temps donnent deux
  mois, pas un.
- L'écran verrouillé des Rapports propose la deuxième porte : celui qui n'a pas
  les 2 500 gourdes ce mois-ci connaît souvent quelqu'un qui cherche la même
  chose.

**Le parrainage, deuxième étage — l'échelle.** La version précédente payait
l'INSCRIPTION d'un filleul par un mois de Rapports. Une inscription ne coûte
rien à fabriquer : la récompense la plus chère était accrochée au barreau le
moins cher. Trois barreaux, désormais, du moins cher au plus cher.

- **Inscrit** — +10 questions à l'assistant et +10 fiches produits (jusqu'à
  +50). `quota_grants` DÉPLACE UN MUR là où `feature_grants` ouvre une porte :
  l'un répond « combien ? », l'autre « oui ou non ? ». Le paquet de questions
  ouvre aussi `ai_assistant` trois mois — un avant-goût qu'on ne peut pas
  goûter n'en est pas un — et reste borné par les questions elles-mêmes.
- **Actif** — sept jours d'une capacité de l'étage AU-DESSUS, après sept jours
  et cinq ventes réelles. `auto_reminders` était le choix évident pour un
  parrain Kwasans ; aucun écran ne l'interroge, l'offrir n'aurait rien ouvert.
  C'est `advanced_analytics` qui est servi : elle se voit le jour même.
- **Payant** — le seul barreau qui coûte de l'argent, et le seul qui exige un
  encaissement constaté. Il donne le mois de Rapports ET un bon de réduction
  sur l'offre du dessus (`upgrade_credits`), jamais sur celle qu'il paie déjà.

Deux règles tiennent le reste. Le montant dû se calcule **au serveur**, à partir
des bons réellement détenus : `createPendingPayment()` recevait `amountHtg` du
navigateur, ce qui devenait une faille dès qu'un prix pouvait légitimement
baisser. Et les bons sont **retenus** au devis, **consommés** à l'approbation :
un paiement MonCash reste en attente jusqu'à ce qu'un humain le constate, et un
bon brûlé sur un virement qui n'arrive jamais est un cadeau repris.

Le compteur de questions (`ai_usage`) et le plafond du catalogue existent enfin.
Ils étaient écrits dans `planFeatures.ts` depuis le premier jour et personne ne
les lisait : la page de prix promettait « 30 questions par mois » et « jusqu'à
50 produits » sans que rien ne les tienne. Un « +10 » posé au-dessus d'un
plafond qui n'existe pas n'est pas une récompense, c'est une phrase.


## Vague 6 — la masterclass UI, les leçons que la configuration masquait

Nouveau document de référence : **« Masterclass UI → ProfitPilot »**, trente-deux
leçons chiffrées. Il recouvre largement l'audit précédent, mais il est plus
prescriptif sur cinq points — et c'est exactement là que le code se révélait
encore en écart. La constitution demandée par son §5 existe désormais :
**`CONSTITUTION_VISUELLE.md`**, une page, tableau de contraste inclus.

Le fil de cette vague est le même que celui de la vague 5, poussé d'un cran :
*ce qu'une configuration rattrape à distance, et ce qu'elle masque*. La vague 5
avait trouvé ce qu'une classe ne peut pas atteindre — un émoji, un interrupteur
qui ne commande rien. Celle-ci trouve pire : **des tokens justes, servis à
plat**, qui donnent l'apparence d'un système sans en produire l'effet.

### Trois systèmes qui existaient sans fonctionner

| Système | Ce que la configuration disait | Ce que l'écran rendait |
|---|---|---|
| **§11 · deux graisses** | `normal 400`, `semibold 700` | `semibold`, `bold`, `extrabold` et `black` valaient **tous 700**. 1 151 classes, **une seule graisse lourde**. « Si tout est en gras, rien n'est en gras » : le piège du §11, écrit dans le fichier de tokens. Désormais 400 / 600, et le 700 devient `font-hero` — un token nommé, porté par le seul montant héro. |
| **§23 · trois rayons** | `control 8`, `surface 12`, `pill` | Les alias hérités `lg`, `xl` et `2xl` retombaient **tous sur 12**. La carte, le bouton qu'elle contient et la pastille posée dessus portaient le même rayon : l'échelle descendante que le §23 exige n'existait nulle part. Rétablie dans les alias — **12 contient 8 contient 4** — plus le token `rounded-inner` qui manquait. |
| **§24 · deux ombres** | deux tokens, adoptés partout | Teintées **anthracite** (15,23,42) — le gris neutre que le §15 chasse par ailleurs — et sans géométrie : 1/2, puis 4/12, puis 16/40. La recette du §24 est maintenant tenue à la lettre : couleur = la marque assombrie, X = 0, **blur = 2 × Y**, spread légèrement négatif. |

### Les variables CSS, restées hors palette

La vague 5 avait ramené 1 179 couleurs littérales sur les tokens — dans les
**classes Tailwind**. Les **variables CSS** de `globals.css` n'avaient pas été
touchées, et 534 usages les lisaient :

- `--color-danger` valait encore **`#DC2626`**, le rouge vif. Le code portait
  donc **deux rouges** : la brique `#B23A2F` dans les classes, le vif dans les
  variables. « Une couleur, une fonction » (§17) ne survit pas à deux valeurs
  pour la même fonction — l'œil voit deux alertes là où il n'y en a qu'une.
- Les sept neutres (`--color-text`, `--color-muted`, `--color-border`…) étaient
  restés sur les gris de Tailwind, alors que la famille `slate-*` avait été
  redirigée vers la teinte marine. Deux gris différents pour le même rôle, l'un
  teinté, l'autre non, et le second tirant vers le violet à côté du premier.

### Le bloc d'impression, dernier refuge des valeurs littérales

`@media print` portait encore treize couleurs Tailwind écrites en dur —
`#12B981`, `#EF4444`, `#94A3B8`… Les sélecteurs gardent leur nom (ce sont les
classes des composants de rapport) ; la couleur rendue rentre dans la palette.

Deux raisons, et la seconde pèse plus que la première. Un même bilan ne peut pas
être vert `#0B7F54` à l'écran et vert `#12B981` sur le papier. Et `#94A3B8` sur
blanc donne **2,7:1** : à l'écran c'est déjà une faute, sur une feuille sortie
d'une imprimante presque vide c'est illisible — or cette feuille-là est celle
que le marchand pose sur le bureau de son banquier.

### La seule paire de la palette qui échouait au contraste

Le §31 exige de passer chaque paire figure/fond dans un vérificateur. Fait, les
dix-neuf : **le vert de confirmation `#0E9F6E` ne donnait que 3,4:1** sur blanc
et 3,0:1 sur son propre fond clair — sous le plancher AA de 4,5.

« En dessous → on ajuste la saturation ou la luminosité de l'une des deux. »
Teinte (158°) et saturation (84 %) conservées à l'identique, luminosité
descendue de 34 à 27 : **`#0B7F54`**, soit 5,0:1 et 4,5:1. La couleur portait le
message « l'argent est rentré » — celui qu'un marchand lit au comptoir, en plein
soleil, avant de rendre la monnaie.

Les dix-huit autres paires passent, dont le bouton principal à 7,8:1 (AAA). Le
tableau complet est dans `CONSTITUTION_VISUELLE.md`.

### Les cibles tactiles, mesurées et non plus estimées

Le §6 ne se négocie pas non plus : *zéro élément tactile sous 44 × 44*. Un
premier comptage par les classes en annonçait 112 — il était faux. Après la
refonte de l'échelle d'espacement, `py-2.5` vaut 12 px et donne déjà 46 px de
haut : compter les classes, c'est mesurer l'ancien barème.

Le comptage refait sur les **hauteurs calculées** (padding résolu sur la grille
+ interligne réel du rôle typographique) en trouve **51**, dans 30 fichiers. Les
plus petites faisaient 26 px — une croix de fermeture de modale à `py-1`.

Les 51 sont reprises selon le §7 : **on agrandit la zone, pas le dessin.**
`min-h-touch min-w-touch`, plus une mise en page souple là où l'icône se serait
collée dans l'angle de sa nouvelle zone. Aucun dessin d'icône n'a grossi.

Et dans l'autre sens, dix-sept icônes étaient dessinées à **12 px**, sous le
plancher de 16 du §7 (`Lock`, `Trash2`, `AlertTriangle`…). Remontées à 16. Les
deux chevrons restent à 12 : le §9 les nomme explicitement comme des indices
visuels, et c'est la ligne entière qui est tactile, pas le chevron.

### Vérifié

- `tsc --noEmit` passe.
- La configuration est **rendue par Tailwind**, pas seulement compilée : `font-hero`
  sort à 700 et `font-bold` à 600 ; `min-h-touch` à 2,75rem et `min-w-touch`
  aussi (Tailwind 3.4 fait bien hériter l'échelle d'espacement à `minHeight` et
  `minWidth` — sans quoi tout le système de cibles était muet) ; `rounded-xl`
  sort à 8 et `rounded-2xl` à 12, donc l'échelle emboîtée existe pour de bon.
- Nouveau comptage des cibles : **0 sous 44 px**.

### L'échelle typographique, alignée sur les valeurs du §12

L'échelle tenait **13 / 15 / 17 / 22 + 32** là où la masterclass demande
**12 / 14 / 16 / 24 + 32**. Le compromis se défendait — plancher relevé d'un
point pour le plein soleil, titre abaissé de deux — et il respectait le NOMBRE
de tailles. Mais il ne respectait aucune de leurs VALEURS, et le §12 ne donne
pas une fourchette : il donne quatre nombres. Une échelle inventée, même
raisonnable, reste un jugement personnel — précisément ce que « UI is not art »
(§5) demande de retirer du travail. Décision prise : aligner.

Ce que le passage change vraiment, et qui n'est pas ce qu'on croit : le corps
descend de 15 à 14 et les mentions de 13 à 12, mais **le titre d'écran monte de
22 à 24**. L'écart entre la plus petite et la plus grande taille passe de 9 à
12 points — la hiérarchie se lit **mieux**, pas moins bien. C'est le titre, pas
la mention, qui la porte.

Les interlignes suivent la règle du §13 (1,3 à 1,4 × la taille), arrondis au
multiple de 4 pour que le rythme vertical retombe sur la grille du §1 :
12/16, 14/20, 16/24, 24/32. Le corps de 14 prend 20 — la valeur que le cours
donne lui-même en exemple.

Et les deux variantes montants **reprennent la taille du titre d'écran** (24)
au lieu d'introduire un 22 qui n'appartenait à personne : le §12 veut quatre
tailles, pas quatre plus deux pour les chiffres. Seul l'interligne se resserre,
parce qu'un montant tient sur une ligne.

**Le risque, vérifié.** Un bouton dont la hauteur vient de `padding + interligne`
vient de perdre 2 px : une échelle qui rétrécit peut faire repasser des cibles
sous les 44. Nouveau comptage sur les hauteurs calculées, barème d'interlignes
mis à jour : **0 bouton et 0 champ sous 44 px**. C'est le `min-h-touch` posé à
la vague 6 qui tient — un plancher dur ne bouge pas quand la typographie bouge,
là où un `py-2.5` bien dosé aurait cédé en silence.

*(`components/ui/input.tsx` reste à `h-10` : c'est un reste de gabarit shadcn,
importé par aucun écran, et ses classes ne sont même pas valides. Il n'a pas été
corrigé — il devrait être supprimé.)*

---

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
   en a ajouté six écrans entiers. Deux chaînes servaient du FRANÇAIS dans le
   champ `ht` — la bulle d'accueil de `/onboarding` et le robot de la page
   d'accueil — ; elles sont traduites, et c'est la relecture qui reste.
2. **Le mode sombre des écrans hérités.** Les couleurs sont désormais des
   tokens, ce qui était le préalable ; mais un `bg-white` sans `dark:` reste
   blanc dans le thème sombre. Le passage se fera écran par écran, à l'occasion
   de la prochaine reprise de chacun.

**La durée de l'essai, tranchée (22/09/2026).** Le produit en annonçait quatre :
72 heures à l'installation, sur l'écran d'essai terminé et dans la capsule du
copilote ; 14 jours dans le robot de la page d'accueil ; 3 jours « Premium »
— une offre qui n'existe pas — au pied de l'inscription ; 30 dans
`subscriptions`, la seule que le compte reçoive. C'est `TRIAL_DAYS`
(`lib/plans.ts`) qui gagne, parce que c'est elle que `lib/trial.ts` écrit en
base : les cinq endroits la lisent désormais, `TRIAL_HOURS` s'en déduit, et
`tests/trialDuration.test.ts` refuse qu'on en réécrive une à la main.

**La décision sur `api_access`, prise.** `lib/plans.ts` ne l'a jamais vendu — les
six lignes d'Elit parlent de boutiques, d'employés, de journal et de projection,
jamais d'API. Rien à retirer ; l'écran `/api-access` porte le raisonnement.

**Fait depuis** : `app/actions/financialReporting.ts` passe désormais par
`getBusinessContext()` — il prenait « la plus ancienne boutique du
propriétaire », donc le mauvais bilan pour un compte multi-entreprises.

**Chantier suivant, tenu ailleurs** : le tableau de bord ne fait plus le même
écran pour les trois offres. Trois compositions — `components/dashboard/`
`esansyel/`, `kwasans/`, `elit/` — sur un socle de briques partagées. Le suivi
vit dans **`DASHBOARDS_PAR_PLAN.md`**, parce qu'il suit un autre document que
l'audit de design. La ligne « fichier du tableau de bord » du §1.1 ci-dessus se
lit désormais : 100 lignes d'orchestration, treize briques, trois compositions.

---

## Avant chaque livraison

La liste de contrôle du §9 s'applique intégralement. Le point 2 est celui qui a
coûté le plus cher ici : *aucune donnée fictive — tout chiffre affiché appartient
au marchand.* Un écran qui invente un chiffre pour ne pas paraître vide est un
écran qui ment, et un logiciel de gestion qui ment une fois ne se rattrape pas.
