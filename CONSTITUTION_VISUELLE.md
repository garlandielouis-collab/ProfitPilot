# Constitution visuelle de ProfitPilot

*Une page. Ce qui n'y figure pas n'existe pas.*

> « Écris la constitution visuelle de ProfitPilot sur une page : 1 police,
> 2 graisses, 4 tailles, 3 couleurs, 2 rayons, 1 ombre, 6 espacements. Toute
> exception exige une justification écrite dans la PR. »
> — *Masterclass UI, leçon 5*

Ce document est court exprès. Il n'explique pas pourquoi — `tailwind.config.ts`
et `theme.config.ts` le font, en commentaire, à côté de chaque valeur. Il dit ce
qui est autorisé. **Une valeur absente de ces tableaux ne rentre pas dans le
code sans une ligne de justification dans la description de la PR.**

---

## 1. Une police

**Inter**, une seule famille, pour tout : titres, corps, chiffres, boutons.
`font-sans`, `font-display` et `font-amount` pointent tous les trois dessus —
les titres se distinguent par la taille et la graisse, jamais par une deuxième
police (§10).

Les montants portent la classe `.amount` : chasse fixe (`tabular-nums`), pour
que « 1 250 HTG » et « 8 880 HTG » occupent la même largeur, que les colonnes
s'alignent et que la carte ne saute plus quand le chiffre grandit.

## 2. Deux graisses

| Token | Valeur | Usage |
|---|---|---|
| `font-normal` | 400 | tout le contenu |
| `font-semibold` | 600 | titres, montants, libellés de boutons |
| `font-hero` | 700 | **le montant héro, une fois par écran** |

Aucune graisse fine. En plein soleil sur un écran bon marché, un *light*
disparaît littéralement — c'est de l'accessibilité, pas du goût (§11).

`font-bold`, `font-extrabold` et `font-black` sont des alias hérités : ils
rendent 600. Le 700 ne s'obtient que par son nom, `font-hero`, pour qu'on ne
puisse plus l'écrire par distraction.

## 3. Quatre tailles, plus une héro

| Token | px | Interligne | Usage |
|---|---|---|---|
| `text-note` | 12 | 16 | métadonnées : dates, unités, mentions |
| `text-body` | 14 | 20 | corps : lignes de liste, descriptions |
| `text-card` | 16 | 24 | contenu important : montants de liste, libellés de boutons |
| `text-screen` | 24 | 32 | titre d'écran |
| `text-amount` | 24 | 28 | un montant — la taille du titre, l'interligne resserré |
| `text-amount-lg` | 32 | 36 | **le montant héro** |

Ce sont les quatre nombres du §12, pas une fourchette : 12 pour les
métadonnées, 14 pour le corps, 16 pour le contenu important, 24 pour le titre
d'écran, plus 32 pour l'unique montant héro. Les variantes montants **reprennent
la taille du titre** — quatre tailles, pas quatre plus deux pour les chiffres.

Plancher du produit : **12 px**. Les deux seuls refuges SOUS 12 que le §12
concède — labels d'onglets et pastille de notification — ne sont pas utilisés.

Interlignes : la règle du §13 (1,3 à 1,4 × la taille), arrondie au multiple de 4
pour que le rythme vertical retombe sur la grille. Le corps de 14 prend 20, la
valeur que le cours donne lui-même en exemple.

Les tailles `3xl` à `6xl` existent **pour les pages publiques uniquement**
(accueil, prix). Dans le produit, un écran a un titre, en 24.

Quand le texte ne rentre pas, on raccourcit le texte ou on redistribue l'écran.
On ne rétrécit pas la police.

## 4. Trois couleurs, et une grammaire

| Rôle | Token | Valeur | Ce que la couleur dit |
|---|---|---|---|
| Accent — 10 % | `accent` | `#50C878` | l'argent qui entre, l'action principale |
| Structure — 30 % | `primary` | `#001F3F` | navigation, texte, sélection, en-têtes |
| Neutres — 60 % | `surface`, `border`, `text*` | teinte 210° | tout le reste |

**Une couleur, une fonction (§17) :**

| Token | Valeur | Signification, et rien d'autre |
|---|---|---|
| `accent` | `#50C878` | argent entrant, action principale |
| `warning` | `#B45309` | échéance qui approche, stock bas |
| `danger` | `#B23A2F` | créance en retard, erreur, perte |
| `success` | `#0B7F54` | confirmation, objectif tenu |
| `info` | `#1D4ED8` | information non actionnable |

Conséquences directes, écrites une fois pour éviter la discussion à chaque PR :
un bouton **Efase** ne peut pas être émeraude ; une pastille de stock bas ne
peut pas être rouge — le rouge est réservé à l'argent en danger ; le rouge est
**brique**, désaturé, et ne prend jamais un aplat plein à côté d'un aplat
émeraude (§16).

**Jamais de noir pur.** `text-black` et `bg-black` sont redirigés vers le
marine — y compris les voiles de modale, ce que le §30 demande justement. Les
gris du texte sont teintés marine (210°), jamais les gris neutres du framework :
posés à côté du marine, ils tirent vers le violet (§15).

**Un seul aplat d'accent par écran.** S'il y en a deux, l'un des deux ment sur
son importance (§21).

## 5. Trois rayons, en échelle descendante

| Token | px | Usage |
|---|---|---|
| `rounded-surface` | 12 | cartes, feuilles, modales |
| `rounded-control` | 8 | boutons, champs, badges |
| `rounded-inner` | 4 | ce qui est posé **dans** un contrôle : photo, vignette |
| `rounded-pill` | ∞ | pastilles rondes |

La règle qui compte : **un élément arrondi dans un élément arrondi prend un
rayon plus petit** — 12 contient 8 qui contient 4. Jamais égal, jamais l'inverse.
Deux rayons identiques emboîtés font un liseré qui s'épaissit dans les angles,
et c'est précisément ce qui « fait cheap » (§23).

## 6. Deux ombres, la recette du §24

| Token | Valeur | Usage |
|---|---|---|
| `shadow-card` | `0 4px 8px -2px rgba(0,31,63,.10)` | une carte posée |
| `shadow-pop` | `0 8px 16px -4px rgba(0,31,63,.18)` | ce qui flotte : feuille, modale |

Couleur = la marque assombrie, jamais du noir. X = 0. **Blur = 2 × Y.** Spread
légèrement négatif, pour que l'ombre ne bave pas sous l'objet.

**Ombre OU bordure fine, jamais les deux** : ensemble, elles font une ligne
floue. Sur les écrans denses de gestion, la bordure gagne.

## 7. Six espacements

`4 · 8 · 16 · 24 · 32 · 48`

| Distance | Valeur |
|---|---|
| micro (icône ↔ texte, deux lignes d'un même bloc) | 4 ou 8 |
| intérieur de carte | 16 |
| entre sous-groupes | 16 ou 24 |
| entre sections | 24 ou 32 |
| bords d'écran | 32 (16 en mode dense, mais partout) |

Les quatre crans hors grille de Tailwind (`0.5`, `1.5`, `2.5`, `3.5`) sont
redéfinis sur la grille dans la configuration : les classes déjà écrites
retombent dessus sans avoir été touchées.

La hiérarchie **est** une affaire de distances : petit à l'intérieur d'un
groupe, grand entre groupes. Espacer uniformément « pour faire aéré » supprime
la hiérarchie aussi sûrement que ne pas espacer du tout (§4).

**Le carré rouge, version développeur** : `components/dev/SpacingDebugger.tsx`.
`Maj + G`, ou `?grid=1` dans l'adresse. Rouge : la distance n'est pas un
multiple de 4 — c'est une faute, pas un choix. Ambre : multiple de 4 mais pas
de 8, donc à justifier. Il ne tourne qu'en développement (§2).

## 8. Trois hauteurs de cible

| Token | px | Usage |
|---|---|---|
| `min-h-touch` | 44 | **plancher absolu de tout ce qui se touche** |
| `min-h-action` | 48 | action secondaire |
| `min-h-hero` | 56 | l'action principale de l'écran |

L'icône se dessine en **16 à 24 px**, centrée dans une zone de 44 à 48. On
agrandit la zone, jamais le dessin (§7). Seule exception, nommée par le §9 : le
chevron d'une liste est un indice visuel de 8 à 12 px — et c'est la **ligne
entière** qui est tactile, pas le chevron.

Le badge n'est pas un bouton : il peut descendre à 32 de haut, précisément
parce qu'il ne se touche pas.

Une seule bibliothèque d'icônes : **lucide**, contour, épaisseur constante. Deux
icônes de sets différents se voient immédiatement, même très ressemblantes.

## 9. Les libellés

Le libellé dit l'action : **« Ankese 1 250 HTG »**, pas « Konfime ». **« Voye
rapèl WhatsApp »**, pas « Voye ». **« Dekonekte » / « Rete konekte »**, jamais
« Wi » / « Non » (§20).

Aucun bouton **OK**, **Valider**, **Suivant** ou **Wi** dans le produit.

## 10. Aucune donnée fictive

Tout chiffre affiché appartient au marchand. Une liste vide a un état vide
dessiné, jamais un jeu de démonstration (§27). C'est le contrôle qui a coûté le
plus cher jusqu'ici, et le seul dont un manquement ne se rattrape pas : un
logiciel de gestion qui ment une fois sur un chiffre ne se fait plus croire.

---

## Le tableau de contraste (§31)

« AA obtenu → c'est bon ; en dessous → on ajuste la saturation ou la luminosité
de l'une des deux. » Le contrôle ne se négocie pas. Ratios calculés, pas
estimés.

| Paire | Couleurs | Ratio | Verdict | Note |
|---|---|---|---|---|
| Texte principal | `#2A3846` sur `#FFFFFF` | **12,0:1** | AAA | corps, titres, montants |
| Texte secondaire | `#47596B` sur `#FFFFFF` | **7,2:1** | AAA | libellés, sous-titres |
| Mentions | `#607383` sur `#FFFFFF` | **4,9:1** | AA | dates, notes — **jamais un montant** |
| Texte principal sur carte | `#2A3846` sur `#F6F8FA` | **11,3:1** | AAA | |
| Mentions sur carte | `#607383` sur `#F6F8FA` | **4,6:1** | AA | |
| **Bouton principal** | `#001F3F` sur `#50C878` | **7,8:1** | AAA | marine sur émeraude — celui qui porte le montant |
| Bouton secondaire | `#001F3F` sur `#EAF7EF` | **15,0:1** | AAA | la paire du §21 : même teinte, luminosité montée |
| Bouton structurant | `#FFFFFF` sur `#001F3F` | **16,6:1** | AAA | marine plein |
| Émeraude assombrie | `#FFFFFF` sur `#1F7A47` | **5,3:1** | AA | les rares surfaces où le texte doit rester blanc |
| Retard, erreur | `#B23A2F` sur `#FFFFFF` | **5,9:1** | AA | rouge brique, en texte et bordure |
| Retard sur son fond | `#B23A2F` sur `#FBEEEC` | **5,2:1** | AA | pastille « An reta » |
| Alerte stock | `#B45309` sur `#FFFFFF` | **5,0:1** | AA | ambre désaturé |
| Alerte sur son fond | `#B45309` sur `#FDF3E4` | **4,6:1** | AA | |
| Confirmation | `#0B7F54` sur `#FFFFFF` | **5,0:1** | AA | succès ≠ accent |
| Confirmation sur son fond | `#0B7F54` sur `#E7F6F0` | **4,5:1** | AA | |
| Information | `#1D4ED8` sur `#FFFFFF` | **6,7:1** | AA | non actionnable |
| Texte principal (sombre) | `#EDF1F5` sur `#0E1822` | **15,8:1** | AAA | |
| Texte secondaire (sombre) | `#B4C1CE` sur `#0E1822` | **9,8:1** | AAA | |
| Mentions (sombre) | `#93A4B4` sur `#1B2836` | **5,9:1** | AA | |

**La paire rejetée.** Le blanc sur l'émeraude de marque donne **2,1:1** — très
en dessous du plancher. C'est ce que le code faisait, et c'était exactement le
bouton qui porte un montant, pour exactement le client qui lit dehors à midi. Le
§31 pose l'alternative : assombrir le fond, ou passer le texte en marine.
ProfitPilot choisit le marine — la couleur de marque reste intacte et le
contraste monte à 7,8:1.

**La paire corrigée.** Le vert de confirmation `#0E9F6E` ne donnait que 3,4:1,
et 3,0:1 sur son propre fond clair. Teinte (158°) et saturation (84 %)
conservées à l'identique, luminosité descendue de 34 à 27 : `#0B7F54`, soit
5,0:1 et 4,5:1. C'était la seule paire de la palette à échouer, et elle portait
le message « l'argent est rentré ».

Cible : **100 % AA**, et **AAA sur les montants d'argent**.

---

## Ce que la constitution ne peut pas signer

Le contrôle 12 de la liste de sortie — *« écran relu sur un Android modeste,
luminosité maximale, d'une seule main »* — ne se coche pas depuis un éditeur.
Aucun ratio calculé ne remplace le téléphone du client, dehors, à midi. C'est le
dernier contrôle, et le seul que ce fichier laisse ouvert.

---

*Toute exception à cette page exige une ligne de justification dans la PR.*
*À relire à chaque livraison, checklist en main.*
