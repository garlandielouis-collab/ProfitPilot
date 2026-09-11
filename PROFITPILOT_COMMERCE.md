# ProfitPilot Commerce — architecture et journal des phases

Référence du module e-commerce. Ce qui est fait, comment c'est cadré, ce qui
reste. Mis à jour à chaque phase (§50 du cahier des charges).

---

## 1. Le principe qui tient tout

**Une boutique n'est pas une entité. C'est une entreprise qui a une vitrine.**

```
businesses (le locataire)
   └── store_settings          1 ligne par business_id — slug, gabarit, thème, domaine
         ├── store_templates   catalogue de référence, en lecture seule
         └── store_payment_credentials   identifiants de passerelle, hors de portée
   ├── products                is_published_to_store, enhanced_image_url, gallery_urls
   ├── orders → order_items    → sales → sale_items → inventory_movements
   └── ai_asset_jobs           Studio photo, vue v_ai_asset_jobs sans le jeton
```

Il n'y a **pas** de table `stores`, et il ne doit pas y en avoir. Le cahier des
charges en suggérait une ; la créer portée par `user_id` casserait le
multi-entreprise — un compte qui tient deux commerces n'aurait qu'une vitrine.

**Toute donnée de commerce est cadrée par `business_id`.** Sans exception depuis
le 4 septembre 2026, y compris `products` (voir §3 du journal).

---

## 2. Les frontières

| | qui écrit | par quel client |
|---|---|---|
| Vitrine publique (`/store/[slug]`) | personne | clé **service**, lecture seule, cache par étiquettes |
| Tunnel d'achat | l'acheteur | fonctions SQL `create_store_order` / `confirm_store_order` |
| Éditeur (`/boutique`, `/boutique/builder`) | le marchand | clé service après `assertFeature` + `requirePermission` |
| Passerelles (`/api/store/payment/*`) | le fournisseur | clé service, après vérification chez le fournisseur |

Le navigateur n'envoie **jamais** un prix, un total, ni un nom de produit. Il
envoie `{ product_id, quantity }`. Tout le reste est relu en base.

---

## 3. Journal des phases

### Phase 0 — Réparation (4 septembre 2026)

Trois régressions actives, introduites par la livraison du Store Builder.

**Le tunnel d'achat était invisible.** Panier, checkout et confirmation
consommaient `var(--store-primary)`, une variable CSS que plus personne ne
déclarait depuis que le layout pose `--st-*`. Boutons transparents, texte blanc.
Les trois pages sont passées au moteur de gabarits : couleurs du marchand, liens
relatifs à `store.base` (donc corrects sur un domaine personnalisé), cibles
tactiles à 44 px.

**Les domaines personnalisés ne résolvaient jamais.** `proxy.ts` interrogeait
`store_settings` avec la clé anon, qui n'a aucun GRANT dessus : PostgREST
répondait `42501 permission denied`, le `catch` avalait l'échec. Remplacé par
`resolve_store_domain()`, une fonction `SECURITY DEFINER` qui ne rend qu'un slug.

**Le Premium ne tenait que côté navigateur.** `components/nav.tsx` masquait
`/boutique` ; aucune action serveur ne vérifiait l'offre. `assertFeature('online_store')`
posé sur l'éditeur, les réglages, la publication de produits, le domaine et le
Studio IA.

> Une exception délibérée : `updateOrderStatus` n'est **pas** verrouillée. Une
> commande déjà passée est de l'argent déjà engagé par un vrai client. La
> boutique cesse d'en prendre de nouvelles ; elle ne prend pas les anciennes en
> otage.

### Phase 1 — Intégrité (4 septembre 2026)

**Les identifiants de passerelle étaient lisibles par tout compte connecté.**
`store_settings` portait `payment_credentials` **et** la politique
`ss_public_read USING (is_active = TRUE)` **et** un `GRANT ALL … TO authenticated`.
N'importe quel marchand pouvait lire les clés MonCash de tous les autres.
Déplacés dans `store_payment_credentials` : RLS active, aucune politique, aucun
GRANT hors `service_role`. Vers l'écran de réglages, le secret part masqué et le
masque renvoyé signifie « ne change pas ».

**La synchronisation commande → vente n'avait jamais fonctionné.**
`confirmOrderAsSale` écrivait `sales.client_name` (colonne inexistante) et
`sale_items.total_price` (c'est `line_total`), et poussait `'cash'` dans
`payment_method_type`, un enum qui ne connaît que `'Cash'`. PostgREST renvoyait
une erreur, le code faisait `if (!sale) return;`. Aucune commande de boutique n'a
jamais produit de vente, de mouvement de stock ni de ligne de rapport.

**Le prix venait du client.** `createStoreOrder` acceptait `unit_price` depuis le
navigateur. Les routes de paiement passaient `orderData.total` à la passerelle.

**Le stock se décrémentait hors transaction**, par lire-puis-écrire : deux
confirmations simultanées perdaient un décrément.

**`order_number` venait d'un `COUNT(*)`** : deux commandes simultanées, même
numéro, violation d'unicité, commande perdue.

Tout cela vit maintenant dans deux fonctions SQL, une transaction chacune :

- `create_store_order()` — relit prix, stock et publication depuis `products`,
  valide le mode de livraison et le mode de paiement contre les réglages,
  attribue le numéro par compteur (`store_order_counters`), crée client,
  commande et lignes.
- `confirm_store_order()` — verrouille chaque produit (`FOR UPDATE`, ordre stable
  pour éviter les interblocages), vérifie et décrémente le stock, écrit le
  mouvement d'inventaire, crée la vente et ses lignes, rattache. Idempotente par
  `orders.sale_id`.

**Les portes ouvertes du parcours invité.** `orders_public_insert`,
`order_items_public_insert`, `customers_public_insert`,
`addresses_public_insert` étaient toutes `WITH CHECK (TRUE)` : tout compte
connecté pouvait écrire dans l'entreprise d'un autre. Supprimées — le tunnel
écrit par la clé service, qui ne passe pas par RLS. Les politiques restantes
acceptent désormais les **membres**, pas seulement le propriétaire.

**L'écran de confirmation était énumérable.** Il s'adressait par
`?order=ORD-2026-00012&biz=<uuid>`, et les numéros sont séquentiels : décrémenter
le numéro donnait les commandes des autres clients — nom, courriel, téléphone,
adresse. Il s'adresse maintenant par l'identifiant de la commande, un UUID.

**La migration `20260702_online_store.sql` était destructrice.** Elle contenait
`DROP TABLE customers CASCADE` et `DROP TABLE orders CASCADE`. Rendue idempotente ;
comportement inchangé sur une base neuve.

### Phase 2 — Convergence du catalogue (4 septembre 2026)

`products` portait `user_id` **et** `business_id`, et l'application lisait tantôt
l'un tantôt l'autre : rapports, sauvegarde et digest filtraient par entreprise
pendant que catalogue, inventaire, rentabilité et vitrine filtraient par
utilisateur. Un produit créé par un employé était invisible du catalogue du
propriétaire et de la boutique ; le stock valorisé des rapports ne comptait que
les fiches du propriétaire.

`business_id` est désormais la clé de cadrage, partout. Orphelins rattachés,
déclencheur `trg_products_default_business` pour les insertions qui l'oublieraient,
colonne passée `NOT NULL`. `user_id` reste écrit : c'est « qui a créé la fiche »,
plus une clé d'accès.

Le plafond de fiches de l'offre se compte aussi par entreprise — compté par
`user_id`, il laissait passer les fiches créées par un employé.

### Phase 3 — Les gabarits métier et l'éditeur de vitrine (8 septembre 2026)

**Cinq sections déclarées n'existaient pas.** `SECTION_KEYS` annonçait `stats`,
`process`, `gallery`, `order_form` et `cta_band` ; les préréglages des six
gabarits métier les plaçaient dans l'ordre de leur page ; le registre de rendu
n'en connaissait aucune. Le fichier ne compilait pas (`Record<SectionKey, …>`
incomplet), donc rien ne se déployait. Elles sont écrites
(`components/store/sections/TradeSections.tsx`) et enregistrées.

**La direction artistique des six métiers n'atteignait pas les composants.**
`lib/storeDesign.ts` décrivait pour chacun sa bannière, sa carte, son en-tête et
la forme de ses rayons ; les composants n'en lisaient rien :

- Les bannières `feature`, `social` et `pro` retombaient toutes sur la
  composition immersive — six gabarits, une seule bannière.
- Les peaux de carte `service`, `wholesale` et `social` n'existaient pas. La
  prestation affichait « Ajouter au panier », que le §34 interdit.
- `design.categories` n'était lu nulle part : la forme des rayons se DÉDUISAIT
  de la bannière et de la carte. Les médaillons ronds et les onglets n'étaient
  donc jamais rendus.
- `design.navCta` et `design.headerDark` n'étaient lus nulle part non plus :
  ni bouton « Prendre rendez-vous », ni numéro dans l'en-tête, ni aplat sombre.
- `design.showRating` n'était lu nulle part : la note figurait sur la seule
  carte `beauty`, en dur.

Tout cela lit maintenant le profil. L'en-tête sombre ne repeint aucun enfant :
il redéfinit `--st-ink` et compagnie pour lui seul.

**Le vocabulaire par gabarit ne s'appliquait pas.** `defaultSectionTitle(key,
templateId)` sait qu'un traiteur a une « carte » et un artisan des
« créations », mais les quatorze appels à `sectionTitle(section)` omettaient le
gabarit. Toutes les vitrines disaient « Nos produits ».

**Le marchand ne pouvait rien saisir.** Le thème porte le contenu de quinze
sections ; l'éditeur ne réglait que les couleurs, la typographie, le catalogue
et WhatsApp. Un marchand qui choisissait « Prestataire de services » obtenait
une page dont la moitié des sections ne s'affichaient pas — la règle du moteur
étant « rien à saisir, rien d'affiché » — et concluait que le gabarit était
cassé. Deux onglets s'ajoutent : **Contenu** (les blocs dans l'ordre de SA page,
ceux que son gabarit n'affiche pas relégués en bas) et **Sections** (ordre,
activation, titre, nombre d'articles).

**`store_sections` n'était jamais écrite.** La table existait depuis
`20260905_commerce_catalog.sql` et la vitrine la lisait ; aucune action ne
l'alimentait. `saveSections` l'écrit en un `upsert`, position = index dans la
liste — jamais un nombre venu du navigateur, qui donnerait deux sections à la
même position et un ordre qui change tout seul entre deux visites.

### Phase 4 — Les gabarits de marque, le registre et son catalogue (9 septembre 2026)

**Huit gabarits de marque en ligne (§35).** Le métier dit ce qu'on vend ; la
marque dit comment on le vend. `wellness`, `skincare`, `animalerie`,
`magazine`, `sport`, `maker`, `naturel`, `monoproduit` s'adressent à un
catalogue court vendu par le discours : une promesse, une preuve, un
argumentaire. Aucun d'eux n'invente une composition : ils reprennent les
bannières et les cartes des six métiers. Ce qui les distingue, c'est l'ORDRE de
la page — `naturel` met vos chiffres là où les autres mettent les avis,
`monoproduit` n'a pas de bannière parce que l'article EST la page — la palette
(`brandPresetFor`) et le vocabulaire (`defaultSectionTitle` : « Tous nos
soins », « Tous nos programmes », « Toute la collection »).

**Trois listes disaient chacune ce qu'était un gabarit.** Le nom vivait dans
l'éditeur, l'ordre des sections dans `storeSections`, la direction artistique
dans `storeDesign` — et rien ne garantissait qu'ils parlent des mêmes gabarits.
`components/store/templates/registry.ts` fait désormais autorité : les
22 gabarits, leur nom, leur promesse, leur famille, leurs rayons, ce qu'ils
apportent, leur vignette. Dix-neuf sont proposés ; `luxe`, `modern` et
`flash` restent rendus mais ne sont plus offerts à la création — des vitrines
en production les portent, et les retirer changerait leur identité du jour au
lendemain sans que personne l'ait demandé. `resolveTemplate` ne lève jamais et
retombe sur « modern » : `template_id` est du texte libre côté base.

**Dix-neuf cartes à la file seraient un catalogue, pas un choix.** `family` les
range en trois groupes que l'éditeur titre, et chaque carte porte sa vignette,
ses rayons, ce que le gabarit met sur la page dans son ordre, et le lien « Voir
ma boutique dans ce gabarit » (`/apercu/[template]`) — la vignette dit à quoi
cela ressemble, l'aperçu dit ce que CE marchand obtiendra avec SON catalogue.

**Cinq gabarits se choisissaient à l'aveugle.** Quatorze ont une maquette
photographique ; `retail`, `fashion`, `beauty`, `tech` et `food` n'en avaient
aucune, et l'éditeur posait trois aplats de leur palette à la place — honnête,
mais muet sur un tiers de la liste. `scripts/gabarits-vignettes.js` les dessine
en aplats à partir de `designFor`, `presetFor` et `brandPresetFor` : une
vignette ne peut donc pas mentir sur la page qu'elle annonce, et se regénère
avec le gabarit. Elles ne portent aucun texte — pas un nom, pas un prix, pas une
note : la règle « aucune donnée fictive » vaut aussi pour une maquette. Les
19 gabarits proposés ont maintenant une vignette ; seuls les trois historiques
gardent le repli sur la palette, parce que le marchand qui en porte un le voit
quand même, sélectionné, dans son éditeur.

**`store_templates` annonçait le contraire du produit.** La table avait été
semée avec `luxe`, `modern` et `flash` — exactement les trois gabarits retirés
— et ignorait les 19 réellement offerts. Aucune ligne de code ne la lit
aujourd'hui, mais c'est la référence PUBLIQUE du catalogue (`GRANT SELECT … TO
anon`) : une table de référence qui contredit le produit donnera une réponse
fausse sans prévenir le jour où quelque chose la lira.
`scripts/gabarits-catalogue.js` la regénère depuis le registre —
`20260915_store_templates_catalogue.sql` ajoute `family`, insère les 22 lignes
et désactive les trois historiques sans les supprimer, puisqu'une vitrine porte
leur identifiant et qu'aucune clé étrangère ne le garantit. **Règle : le
registre change, la migration se regénère.**

### Phase 5 — Ce qui manquait pour que ce soit un vrai site (9 septembre 2026)

**Une vitrine ne répondait à aucune question d'avant-achat.** Vingt-deux
sections savaient vendre — bannière, rayons, sélections, avis, histoire — et
aucune ne savait répondre. « Combien coûte la livraison chez moi », « est-ce que
vous prenez MonCash », « vous ouvrez à quelle heure », « je fais quelle taille »,
« qu'est-ce qu'il y a dedans » : cinq questions qui arrêtent la main au moment de
commander, et dont aucune n'avait sa place sur la page. Le marchand y répond dix
fois par jour sur WhatsApp — et perd les acheteurs qui n'écrivent pas, sans
jamais savoir qu'ils sont passés.

Neuf sections s'ajoutent (§36), portant le catalogue de 22 à 31 :

| Section | Ce qu'elle répond | D'où vient son contenu |
|---|---|---|
| Livraison & retours | le prix et le délai, avant la caisse | `store_settings.shipping_modes` + une note |
| Comment payer | les modes que la caisse acceptera | `store_settings.payment_methods` + une note |
| Nous joindre | les horaires, le téléphone, WhatsApp | réglages de la boutique + horaires saisis |
| Compte à rebours | jusqu'à quand l'offre tient | `theme.urgency`, déjà au schéma, jamais rendu |
| Vidéo | ce qu'une photo ne montre pas | un lien YouTube, Vimeo ou Facebook |
| Ils nous font confiance | avec qui vous travaillez | saisi |
| Guide des tailles | quelle taille commander | un tableau saisi en lignes |
| Composition | ce qu'il y a dedans | saisi |
| L'équipe | à qui on achète | saisi |

Les deux premières ne se saisissent pas : elles lisent les modes RÉELS de la
boutique. Les retaper dans l'éditeur créerait deux vérités — le jour où le
marchand change son tarif de livraison dans ses réglages, sa page d'accueil
continuerait d'annoncer l'ancien. `StoreView` porte donc `shippingModes` et
`paymentMethods`, deux listes qui descendaient déjà dans le navigateur à l'étape
du paiement.

Les sept autres sont vides par défaut, donc absentes : la règle « rien à saisir,
rien d'affiché » ne bouge pas. Aucun horaire, aucune mesure, aucun ingrédient
n'est proposé — ce sont des engagements que le client viendra réclamer au
marchand.

Aucune migration : `section_key` est du texte libre et le contenu vit dans le
thème, en JSON.

**Une vitrine neuve n'avait aucune image.** Pas de bannière, rien derrière
l'histoire, rien sous la bande d'appel, des rayons sans photo : la page tombait
sur des aplats de couleur, et une page d'aplats ressemble à un gabarit vide, pas
à une boutique. `scripts/gabarits-art.js` dessine pour chacun des 22 gabarits
quatre images — bannière, bande, histoire, vignette de rayon — à partir de sa
palette, de sa direction artistique et d'un MOTIF choisi pour ce qu'il vend :
une trame pour le prestataire, des vagues pour l'artisan, un éventail pour la
marque de sport. 88 images, 0,6 Mo au total.

Elles sont ABSTRAITES, et cela ne se négocie pas : aucune ne montre une
boutique, un atelier, un plat, un visage ni un lieu, et jamais un produit. Une
photo de vitrine posée par défaut donnerait à voir un commerce qui n'est pas
celui du marchand — au même titre qu'un chiffre d'affaires inventé sur son
tableau de bord. Et le catalogue reste le seul endroit de la page où une image
engage un achat.

Elles ne passent jamais devant le marchand : bannière saisie → bannière de la
boutique → image du gabarit. Le jour où il téléverse sa photo, elle prend la
place (`lib/storeArt.ts`).

**« Meilleures ventes » affichait les photos de tous les produits.** Ce n'était
pas un défaut de calcul — `v_store_bestsellers` ne compte que des ventes
réelles, sur 90 jours. C'est de l'arithmétique : une boutique de six fiches dont
chacune s'est vendue une fois a six meilleures ventes, et la rangée affichait le
catalogue entier, juste au-dessus du catalogue. Le visiteur n'y lit pas « ces
six-là se vendent bien », il y lit « cette page se répète ».

Une rangée calculée ne montre donc plus que la moitié du catalogue visible, et
disparaît en dessous de trois articles. Elle revient d'elle-même quand la
boutique grandit. La règle ne touche pas « Mis en avant » : cocher six fiches sur
six est un choix du marchand, pas un effet de bord.

**Les maquettes oubliaient la note.** Trois des cinq gabarits de rayon réservent
une place aux avis sur chaque carte (`design.showRating`) ; les vignettes
dessinées la veille n'en montraient aucune. Elles la montrent — cinq marques
identiques et aucun nombre : une maquette qui remplirait quatre étoiles sur cinq
annoncerait une note, alors que la carte n'affiche rien tant qu'aucun client n'a
noté. Les vignettes portent aussi, désormais, l'image réelle du gabarit derrière
leur bannière : ce qu'elles annoncent est ce que le marchand obtiendra.

### Phase 6 — Les pages profondes (9 septembre 2026)

**La page d'accueil savait trente et une choses ; le reste du site était celui
d'avant.** Cinq phases avaient reconstruit la vitrine — gabarits, sections,
direction artistique, images, vocabulaire par métier — et s'étaient arrêtées à
l'accueil. Le catalogue, la fiche produit et le tunnel de commande, c'est-à-dire
les trois écrans où l'achat se décide réellement, n'avaient rien reçu. Un
visiteur traversait donc deux sites : une boutique soignée jusqu'au premier clic
sur un produit, puis un formulaire.

#### Le catalogue filtrait sur deux choses et se vidait sur un clic

`getStoreFacets` lit les attributs réellement saisis sur les fiches — taille,
couleur, capacité — et n'en retient que ceux qui ont plus d'une valeur, un
attribut à valeur unique ne filtrant rien. Elle existait depuis l'origine et
**n'était appelée par personne** : la page n'offrait que le rayon et le tri.
Toute la matière du §15 était en base, inutilisée. Les filtres se dérivent
maintenant du catalogue au lieu d'être déclarés — on ne demande pas au marchand
d'annoncer que ses produits ont une taille, on le constate.

Le rayon cachait plus grave. Une catégorie arrive tantôt comme identifiant
(`category_id`, un UUID), tantôt comme libellé, selon l'ancienneté de la fiche —
c'est la dette de `products.category` en texte libre, réconciliée en base
(`fn_products_sync_category_label`, 20260905) mais pas dans les lectures.
L'ancien filtre comparait le paramètre au seul libellé : **sur toute boutique
dont les produits portent un `category_id`, cliquer un rayon depuis l'accueil
ouvrait un catalogue vide.** `matchesCategory` compare aux deux.

Le filtrage passe côté navigateur. Chaque clic déclenchait un aller-retour
serveur : sur une connexion irrégulière, changer de rayon prenait plusieurs
secondes pendant lesquelles la page restait figée sans rien dire. La liste est
déjà en mémoire ; l'URL se met à jour derrière, pour rester partageable et pour
que le retour arrière fonctionne.

#### La fiche produit perdait la vente qu'elle venait de faire

Quatre défauts, dont deux coûtaient des commandes :

- **L'ajout au panier renvoyait vers `/cart`.** On quittait la fiche, on perdait
  les produits similaires, et la deuxième vente ne se faisait pas. Le tiroir
  s'ouvre à la place, la page reste.
- **Le prix affiché ne suivait pas la quantité.** « Ajouter au panier —
  1 250 HTG » pour trois unités est un chiffre faux sur l'écran d'un logiciel de
  gestion. Le bouton porte le total réel.
- **Les déclinaisons n'apparaissaient nulle part** alors qu'elles étaient en
  base et servaient déjà de filtres au catalogue.
- **La galerie était une image carrée rognée et quatre vignettes** — ni zoom, ni
  navigation. Sur un objet qu'on ne peut pas toucher, c'est la moitié de
  l'argument de vente qui manque.

La barre d'achat colle en bas dès que le bouton principal sort de l'écran : sur
une fiche longue, l'acheteur convaincu par la description devait remonter pour
acheter. Et le geste d'achat suit le profil du gabarit, pas la page :
`design.checkout.buyNow` pose un « Acheter maintenant » là où l'achat est un
réflexe, et nulle part ailleurs — sur une prestation il y a un rendez-vous à
prendre, sur un lot de bétail un prix à demander.

**La fiche reprend les sections de la boutique** (`pdpSectionsFor`) : composition
sous un cosmétique, guide des tailles sous un vêtement, questions fréquentes
partout. Trois règles la tiennent :

1. L'état du marchand est respecté — une section qu'il a désactivée pour son
   accueil ne réapparaît pas ici, et le titre qu'il a choisi la suit. C'est
   l'intérêt de reprendre `resolveSections` au lieu de fabriquer une liste.
2. L'ORDRE est celui du gabarit, pas celui de l'accueil : sous un article, la
   composition vient avant les questions fréquentes.
3. Une seule lecture de plus sur la page. Ces sections lisent le THÈME, pas le
   catalogue ; leur remplir des données produits ferait payer six lectures à
   chaque fiche ouverte pour des listes dont aucune ne se sert.

Les gabarits historiques retombent sur les questions fréquentes seules : leurs
fiches n'ont jamais rien porté d'autre, et leur en ajouter d'un coup changerait
la page d'un marchand qui n'a rien demandé.

#### Le checkout descendait les réglages de la boutique dans le navigateur

La page appelait `getStoreBySlug(slug)` **depuis le client**, ce qui faisait
descendre la ligne `store_settings` entière — à l'époque où elle portait encore
`payment_credentials`. Elle se scinde : `page.tsx` lit sur le serveur et passe
trois choses au composant client, les modes de paiement, les modes de livraison
et l'identifiant de l'entreprise. La page passe de 223 lignes à 58, le reste
partant dans `CheckoutClient.tsx`.

Le tunnel s'adapte ensuite à ce que le métier vend (§6), toujours par le profil
et jamais par un `if (gabarit === …)` : une date de LIVRAISON pour un pâtissier,
un CRÉNEAU pour un prestataire — les deux questions ne se répondent pas de la
même façon et le marchand ne lit pas la même chose sur sa commande ; un champ de
personnalisation pour un artisan ; une demande de prix pour une quantité
supérieure chez un grossiste ; la conversation WhatsApp proposée AVANT le
formulaire là où la vente se fait ainsi.

**Rien de tout cela ne touche au montant.** Ces réponses partent dans les NOTES
de la commande. Un prix calculé à partir d'une case cochée serait un prix que la
caisse ne confirmerait pas — et le total débité reste celui que le serveur relit
en base, pas celui du panier.

#### La présentation de la boutique se rédige, et elle a un prix

`draftStorePresentation` écrit la section « Présentation & services » à partir
des faits RÉELS de la boutique — ses modes de paiement, ses modes de livraison,
son gabarit — et suit la règle du Studio : **générer et appliquer sont deux
gestes.** Le texte revient au navigateur, le marchand le corrige, et c'est
« Enregistrer le contenu » qui écrit. Une présentation publiée d'autorité sur la
page d'accueil serait la pire des écritures automatiques : c'est le premier texte
que ses clients liront.

C'est un aller-retour chez le fournisseur, donc un crédit — le même prix qu'une
fiche produit. La grille vit en base pour qu'un tarif se change sans
redéploiement, ce qui veut dire que le code ne la connaît pas : sans
`20260916_store_presentation_credit.sql`, `ai_credit_spend` ne trouve pas
l'action et `spendCredits` laisse passer sans débiter. **La rédaction est donc
GRATUITE tant que cette migration n'est pas jouée.** Rien ne casse — c'est le bon
sens de l'erreur — mais ce n'est pas l'intention.

### Phase 7 — Une vitrine neuve n'était pas vide, elle était muette (9 septembre 2026)

**Le moteur avait une règle juste qui produisait un mauvais résultat.** « Rien à
saisir, rien d'affiché » protège d'un vrai danger : une section qui invente un
texte le fait signer par le marchand. Mais appliquée à une vitrine neuve, dont
le `theme_config` est un objet vide, elle donnait ceci — relevé sur une boutique
réelle, préréglage `modern`, six produits :

| | |
|---|---|
| Sections prévues par le gabarit | 14 |
| Sections réellement rendues | **5** |

Bannière, rayons, meilleures ventes, catalogue, modes de paiement. Les neuf
autres attendaient un texte que **rien ne demandait au marchand d'écrire**. Il ne
les voyait pas, ne savait donc pas qu'elles existaient, et ne les remplissait
jamais. La règle se retournait contre celui qu'elle protégeait.

C'est aussi ce que l'écran de lancement ne disait pas : ses onze critères
mesurent le catalogue, le SEO, le paiement, la livraison et l'identité —
**aucun ne regarde le contenu de la page d'accueil**. Une boutique pouvait
afficher une bonne note en servant cinq sections.

#### Le contenu de démarrage

`lib/storeContent.ts` donne à chaque gabarit le texte qu'une boutique de ce
métier écrirait, dans la voix de ce métier : six voix pour les six métiers du
§34, une septième pour les marques en ligne du §35, et la carte des vingt-deux
gabarits par-dessus. **254 sections de texte sur 254** ont désormais un contenu.

Ce qui reste muet ne peut pas être rempli par du texte : « Mis en avant »,
« Nouveautés », « Bundles » et les rangées de rayons lisent le CATALOGUE du
marchand. Y écrire quelque chose reviendrait à inventer des produits, ce qui
n'est pas la même chose qu'écrire une phrase de présentation.

#### La règle de substitution, et le piège qu'elle évite

Le contenu du gabarit ne passe jamais devant celui du marchand :

| État de la section | Ce qui s'affiche |
|---|---|
| le marchand a écrit quelque chose | le sien, intégralement |
| le marchand l'a explicitement coupée | rien — la coupure est respectée |
| elle est restée au défaut | le texte du gabarit |

« A écrit quelque chose » se mesure **par différence avec le schéma**, jamais par
présence de clé. Le piège est là et il est sérieux : `saveContent` réenregistre
le thème ENTIER à chaque sauvegarde, donc toutes les clés existent dès le premier
« Enregistrer ». Une substitution fondée sur la présence aurait donc disparu au
premier enregistrement — la page se serait vidée d'un coup, sans que rien ne
l'explique, et le marchand aurait conclu qu'il avait cassé quelque chose.

La substitution vit dans `parseThemeConfig`, pas chez ses appelants : ils sont
trois — la vitrine (`buildStorefrontContext`), la fiche et l'aperçu
(`toStoreView`), l'éditeur — et ils doivent par construction voir la même page.
Un éditeur qui montrerait autre chose que la vitrine serait pire qu'un éditeur
vide. `storeContent` n'importe de `storeTheme` que des TYPES, et reçoit le schéma
par défaut en argument : sans cela, les deux modules formeraient un cycle.

#### Ce que ce contenu s'interdit, et les deux réserves

Aucun chiffre d'activité. Pas de chiffre d'affaires, pas de stock, pas de nombre
de commandes, pas de note moyenne — ces nombres appartiennent au marchand, et
c'est la règle qui tient tout le produit. Ce qui est écrit est du DISCOURS : une
promesse, une explication, une question fréquente et sa réponse.

Deux réserves, dites franchement, parce qu'aucune ligne de code ne peut les lever
à la place du marchand :

- **`socialProof`** porte des avis signés de prénoms. Ce sont des exemples de
  mise en page, pas des clients.
- **`stats`** porte des délais — « 48 h », « 7j/7 ». Ce sont des engagements : un
  marchand qui livre en cinq jours doit corriger la ligne.

Les deux sont réunies dans `DEMO_SECTIONS` et se coupent d'un seul geste. Le
choix de les laisser allumées par défaut est un choix de produit, pas une
omission.

#### `modern` était le plus pauvre des vingt-deux, et le plus vu

`resolveTemplateId` retombe sur `modern` pour tout `template_id` vide ou inconnu.
C'est donc le gabarit que le plus grand nombre de marchands voient **sans l'avoir
choisi** — et il avait la composition la plus effacée du lot : bannière en carte,
rayons en pastilles de texte, aucune note sur les cartes, aucun achat en un
geste.

Il prend la grammaire du commerce de détail (§01) :

| | Avant | Après |
|---|---|---|
| Sections | 14 | **20** — arrivages, promotion, galerie, guide des tailles, contact, réseaux |
| Bannière | `card` | `split` — discours à gauche, photographie à droite (§3) |
| Rayons | `chips` | `tiles` — le §5 demande une image, pas une icône |
| Note sur les cartes | non | oui — sur les fiches réellement notées (§6) |
| Achat en un geste | non | oui — « Acheter maintenant » (§6 de la fiche) |
| Grille | 3 colonnes | 4 |

**Résultat mesuré sur la même boutique réelle, sans qu'une ligne ne soit écrite
en base : 5 sections rendues → 16.** Les quatre qui restent muettes attendent des
produits mis en avant, des nouveautés de moins de trente jours, un bundle et des
comptes de réseaux sociaux.

#### Trois gabarits se choisissaient encore sur un aplat

Les 19 gabarits proposés ont une vignette depuis la phase 4 ; les trois
historiques gardaient le repli en trois aplats de leur palette. C'était
défendable tant qu'on ne les proposait plus — sauf que `modern` est celui que
reçoit toute vitrine sans gabarit choisi. Le marchand le plus susceptible
d'ouvrir le sélecteur était donc précisément celui à qui l'on montrait un
rectangle de couleur à la place de sa page.

`node scripts/gabarits-vignettes.js luxe modern flash` les dessine depuis
`designFor`, `presetFor` et `brandPresetFor`, comme les dix-neuf autres. Les
22 gabarits ont maintenant leur vignette, et `registry.ts` les déclare — la
migration `20260915` a été regénérée derrière, selon la règle : le registre
change, la migration suit.

**À ne pas confondre avec la bannière.** Les 22 gabarits avaient déjà leur
photographie de bannière (`public/gabarits/photo/<id>-hero.webp` et
`-story.webp`, servies en 200) : `templateArt` ne rend jamais `null` et la
bannière ne tombe donc jamais sur un aplat. Ce qui manquait était la vignette du
SÉLECTEUR, pas l'image de la page.

#### La galerie ne pouvait pas se remplir de texte

`gallery` attend des images, pas des phrases. Elle reprend donc les quatre
compositions DESSINÉES du gabarit, comme le font déjà la bannière, la bande
d'appel et les vignettes de rayon (`lib/storeArt.ts`). Elles sont abstraites, et
c'est la condition : une photographie de boutique posée par défaut montrerait un
commerce qui n'est pas celui du marchand. La première image qu'il téléverse les
remplace toutes.

### Phase 8 — La boucle des avis, fermée aux deux bouts (9 septembre 2026)

**Le constat de la phase 7 était plus grave qu'un affichage manquant.** Les notes
ne s'affichaient sur aucune fiche, et la cause n'était ni le rendu ni le cadrage :
`reviews` était vide, et ne pouvait pas être autre chose que vide.

| Maillon | État avant |
|---|---|
| Lecture — `v_product_ratings` → `loadRatings` → cartes et fiche | complète |
| Écriture — `submitReview`, gardée par achat vérifié | écrite, **zéro appelant** |
| Publication — `status` passe de `pending` à `published` | **aucun écran** |

Deux surfaces manquaient. Les deux sont livrées.

#### Le formulaire, sur la page de confirmation

C'est le seul moment où le client est à la fois attentif et chez nous : il vient
de payer, la page est ouverte, rien d'autre ne lui est demandé. Un bloc par
produit, une note en cinq étoiles, un commentaire facultatif.

Le commentaire est facultatif **délibérément** : c'est la NOTE qui alimente
`v_product_ratings`, donc les étoiles. Exiger une phrase ferait tomber le taux de
réponse pour une donnée qui n'entre dans aucun calcul.

Les étoiles sont cinq `input[type=radio]` dans un `fieldset` légendé, pas des
icônes cliquables : elles se parcourent à la flèche et s'annoncent « 4 sur 5 ».
Chaque produit a son propre bouton — un échec sur l'un n'efface pas ce qui a été
écrit sur les autres.

#### La relance, trois jours après livraison

`lib/reviewRequestSweep.ts`, branchée sur le cron quotidien. Trois jours après
LIVRAISON, pas après commande : demander son avis à quelqu'un qui n'a rien reçu
fait noter l'attente.

Trois garde-fous, et le deuxième est le plus important :

1. **Une seule relance par commande.** `orders.review_email_sent_at` est posée
   **avant** l'envoi, pas après. Le risque est asymétrique : marquer après, c'est
   risquer de renvoyer la même demande chaque nuit ; marquer avant, c'est risquer
   de ne jamais relancer ce client. Un avis manquant est un manque ; une relance
   quotidienne est un harcèlement, et elle brûle l'adresse d'expédition pour
   toutes les boutiques du produit.
2. **Une fenêtre haute de trente jours.** Le rattrapage de la migration remplit
   `delivered_at` sur TOUT l'historique. Sans borne haute, la première nuit après
   la migration enverrait une demande pour chaque commande livrée depuis
   l'ouverture de la boutique — des clients de l'an dernier recevant « donnez
   votre avis » et concluant que le commerçant s'est fait pirater.
3. **Cent envois par nuit au maximum.** Le cron a soixante secondes et fait un
   appel réseau par courriel ; sans plafond, une grosse journée de livraisons
   ferait expirer la route et emporterait les quatre autres balayages.

Le courriel ne vend rien. Aucun code promotionnel, aucune nouveauté : un message
qui demande un service et vend dans le même souffle n'obtient ni l'un ni l'autre.

#### Le jeton, pour ne pas demander ce qu'on sait déjà

`submitReview` exigeait l'adresse de la commande. Bonne garde pour un formulaire
ouvert, absurde sur les deux nouvelles surfaces : le client vient de taper son
adresse à la caisse, et un courriel ne peut pas demander l'adresse à laquelle il
a été envoyé.

`lib/reviewToken.ts` signe un jeton (HMAC-SHA256, quinze jours) pour une
commande. Il ne prouve qu'une chose : ce serveur l'a fabriqué pour cette
commande, et il n'a pas expiré. Ce n'est **pas** une élévation de droit — on ne
l'obtient qu'en chargeant la page de confirmation, ce qui demande l'UUID de la
commande, ou en recevant le courriel, ce qui demande la boîte du client. Les deux
preuves exactes que l'adresse établissait.

Il remplace UNE question, pas le contrôle : la commande doit exister, le produit
doit y figurer, et `UNIQUE (order_id, product_id)` reste la barrière contre le
second avis. La condition est écrite en liste blanche — `if (!byEmail && !byToken)`
— parce qu'une condition formulée à l'envers laisserait passer les deux champs
vides. Le lien du courriel, lui, ne porte aucun jeton : il porte l'UUID, qui est
déjà la preuve.

#### La modération, sans laquelle les deux premières ne servent à rien

`/boutique/avis` : ce qui attend la relecture en premier, les publiés et les
refusés en dessous. Publier, refuser, dépublier, remettre en attente.

La limite est **affichée au marchand**, pas seulement documentée : il refuse un
propos, il ne fabrique pas un éloge. Et ce n'est pas cet écran qui le garantit —
c'est la base. `reviews` n'a aucune politique d'INSERT, donc RLS refuse toute
création par un membre ; `moderateReview` n'écrit que `status` et
`published_at`, jamais la note ni le texte. Un avis dont le commerçant pourrait
corriger la formulation n'est plus l'avis de son client.

Le cadrage par `business_id` est dans la clause `eq` bien que l'identifiant
suffise à désigner la ligne : la clé service ne passe pas par RLS, donc un
marchand pourrait sinon modérer l'avis d'une autre boutique avec un identifiant
deviné.

La publication invalide le cache de la vitrine (`revalidateStore`) — sans quoi
l'étoile n'apparaîtrait qu'à l'expiration du cache, et le marchand cliquerait une
seconde fois en croyant le bouton cassé.

---

## 4. Ce qui reste

Par ordre de ce qui bloque le plus le marchand. Les lignes barrées ont été
livrées ; elles restent lisibles parce que le cahier des charges les numérote et
qu'un tableau où les lignes disparaissent ne dit plus quelle phase a tenu quoi.

| Phase | Contenu | §  |
|---|---|---|
| 3 | ~~`order_status_history`, `payment_transactions`~~ (20260906). Restent **`shipping_methods`** — les modes de livraison sont encore un JSON sur `store_settings` — et la **réservation de stock à expiration**, sans laquelle deux paniers vendent la même pièce | 23, 25 |
| 4 | ~~`store_sections`~~ (phase 3) · ~~réconciliation `products.category`~~ (20260905) · ~~filtres dynamiques~~ (phase 6) | 20 |
| 5 | ~~Coupons, avis réels, moteur de recommandation~~ (20260906, phase 6) | 26, 27, 28 |
| 6 | ~~Descriptions IA, crédits IA (`ai_credit_ledger`), merchandising, bundles~~ (20260906, 20260907) | 16-18, 39 |
| 7 | ~~`store_analytics_events` et l'entonnoir~~ (20260906, `storeInsights`) | 30 |
| 8 | ~~Onboarding en 10 étapes, Store Health Score~~ (`/boutique/lancement`) | 44, 45 |

Le tableau est vide de tout ce qui bloquait la VENTE. Ce qui reste sur la
ligne 3 ne bloque personne aujourd'hui : les deux défauts se déclarent quand le
volume monte, et c'est la raison de les traiter avant qu'il monte.

### Dettes connues, non traitées ici

- **Double écriture de `inventory_movements`** quand l'entreprise a un entrepôt
  par défaut : le déclencheur `trg_sale_item_stock` (20260526) écrit une ligne,
  et le code applicatif une autre. Vrai pour `app/actions/sales.ts` depuis
  toujours ; `confirm_store_order` reproduit sciemment le même comportement
  plutôt que d'en inventer un second. À trancher avec la réservation de stock.
- **`lib/validations.ts`** accepte `Bank`, `Cheque`, `Transfer` comme modes de
  paiement ; l'enum `payment_method_type` connaît `Virement` et `Chèque`. Une
  vente au comptoir avec l'un de ces trois modes échoue. C'est le même défaut de
  vocabulaire que la phase 1, resté sur le chemin du comptoir.
- **Le Store Health Score ne regarde pas la page d'accueil.** Ses onze critères
  (`lib/storeHealth.ts`) mesurent le catalogue, le SEO, le paiement, la
  livraison et l'identité. Aucun ne compte les sections remplies, aucun ne
  signale qu'une vitrine porte l'un des trois gabarits retirés. C'est ce qui a
  laissé le défaut de la phase 7 invisible aussi longtemps : l'écran censé
  répondre « qu'est-ce qui manque à ma boutique » ne posait pas la question.
- **`saveNetlifyToken`** écrit dans des colonnes `netlify_token`,
  `netlify_site_id` et `netlify_site_url` qui n'existent sur aucune migration du
  dépôt. Le `as any` fait taire TypeScript ; PostgREST, lui, refuse.

**Réglées depuis :** `getStoreCategories` comptait tous les produits, y compris
non publiés — en mode « sélection », une catégorie s'affichait avec zéro produit
visible ; elle prend maintenant `onlyPublished`. Et `products.category` en texte
libre, qui rendait les filtres dynamiques impossibles, est réconcilié par
`fn_products_sync_category_label` en base et par `matchesCategory` en lecture.

---

## 5. Appliquer les migrations

Dans cet ordre, **avant** de déployer le code de ces phases :

| Fichier | Ce qui casse sans elle |
|---|---|
| `20260903_store_builder.sql` | `template_id`, `theme_config`, `custom_domain` sur `store_settings`, la table `store_templates` et `is_published_to_store` — rien de la vitrine n'existe sans elle |
| `20260904_commerce_integrity.sql` | l'intégrité du commerce — c'est le socle, tout le reste s'appuie dessus |
| `20260905_commerce_catalog.sql` | `store_sections`, les rangées calculées, la synchronisation du libellé de rayon |
| `20260906_commerce_conversion.sql` | avis, coupons, entonnoir, crédits IA, historique de statut |
| `20260907_commerce_ai_copy.sql` | les bundles |
| `20260908_commerce_launch.sql` | `create_store_order` / `confirm_store_order` dans leur version courante |
| `20260915_store_templates_catalogue.sql` | rien à l'écran — mais la table publique annonce trois gabarits retirés comme seuls gabarits actifs |
| `20260916_store_presentation_credit.sql` | rien à l'écran — mais la rédaction de la présentation reste **gratuite**, `ai_credit_spend` ne trouvant pas l'action |
| `20260917_review_requests.sql` | la relance d'avis ne part jamais : `orders.delivered_at` et `review_email_sent_at` n'existent pas, le balayage nocturne sort à vide. Le formulaire après achat, lui, fonctionne sans elle |

Les deux dernières ne bloquent aucun écran, et c'est exactement ce qui les rend
faciles à oublier : personne ne verra d'erreur. Une table de référence qui
contredit le produit et une action facturée qui ne débite pas donneront toutes
deux une réponse fausse sans prévenir.

Il n'existe aucun moyen automatisé dans ce dépôt (ni `psql`, ni chaîne de
connexion, et `/api/migrate` vise un endpoint qui n'existe pas) :
Supabase → SQL Editor → coller → Run.

Vérifier ensuite :

```bash
node scripts/verification/pp_schema.js   # store_payment_credentials, store_order_counters présentes
node scripts/verification/pp_chk.js      # « produits sans entreprise » doit valoir 0
```
