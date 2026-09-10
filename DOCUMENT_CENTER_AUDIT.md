# ProfitPilot Business Document Center — Audit préalable

> Réponse au §85 du cahier des charges « PROFITPILOT — BUSINESS DOCUMENT & COMPLIANCE CENTER ».
> Écrit avant toute ligne de code, comme le §1 l'exige. Les sections 1 à 15 sont restées **telles qu'elles ont été validées** : elles décrivent ce qui était prévu, et c'est ce qui leur donne leur valeur relue six mois plus tard. Ce qui a été construit depuis se lit dans les blocs « ÉTAT » ci-dessous, phase par phase.
>
> Date : 7 septembre 2026 · Branche : `main` (propre)

---

## ÉTAT — Phase 0 livrée le 7 septembre 2026

La fondation est corrigée. Le code applicatif peut commencer.

### À appliquer dans cet ordre, séparément

| # | Fichier | Remarque |
|---|---|---|
| 1 | `supabase/migrations/20260910_member_role_reconciliation.sql` | **Seul dans son exécution.** PostgreSQL refuse d'employer une valeur d'énumération dans la transaction qui l'ajoute — la migration suivante utilise `manager` et `employee`. |
| 2 | `supabase/migrations/20260911_document_center_foundation.sql` | Catalogue, colonnes, `can_read_document()`, politiques, bucket privé. |

Chacune finit par une requête de vérification à lire dans la sortie du SQL Editor.

### Ce qui a été corrigé

**Une divergence non prévue par l'audit, découverte en écrivant la migration.** L'énumération Postgres `member_role_type` et le type TypeScript `Role` ne décrivaient pas les mêmes rôles :

- `manager` et `employee` existaient en TypeScript mais **pas** dans l'énumération — deux branches mortes de `ROLE_PERMISSIONS`, puisque la base refusait de les écrire ;
- `inventory_manager` existait en base mais **pas** en TypeScript — `ROLE_PERMISSIONS['inventory_manager']` valait `undefined`, donc `roleHasPermission()` renvoyait `false` pour tout. Un gestionnaire de stock ouvrait l'application sur une interface vide, sans explication.

Bâtir `can_read_document()` par-dessus deux vocabulaires divergents aurait produit des règles qui se contredisent. La base reçoit les deux rôles manquants ; le TypeScript reçoit le sien.

**Les trois défauts identifiés au §3 de cet audit :**

1. `documents_access` en `FOR ALL USING (is_business_member(...))` → remplacée par quatre politiques par verbe et une fonction `can_read_document()` qui pèse appartenance, sensibilité du type et visibilité du document.
2. `documents.url` → `storage_bucket` + `storage_path` ; `url` et `type` perdent leur `NOT NULL` et passent en dépréciées.
3. `CHECK` figé de 13 valeurs → catalogue `document_types` (61 types, 6 catégories, bilingue). Les 13 clés d'origine sont reprises verbatim, ce qui rend le remplissage de `document_type_id` trivial.

**Deux failles trouvées en relisant le SQL :** un membre pouvait insérer un document en l'attribuant à quelqu'un d'autre (et, `can_write_document()` rendant la main au créateur, se désigner soi-même pour garder l'écriture) ; et `type` restait `NOT NULL` après la levée du `CHECK`, ce qui aurait obligé tout code neuf à remplir une colonne dépréciée. Les deux sont corrigées.

### Politique de types temporels

Règle retenue, et elle vaut pour tout ce qui viendra ensuite :

> **Un instant est un `TIMESTAMPTZ`. Une date au calendrier est une `DATE`.**
> Aucune conversion de l'un vers l'autre dans un index, une colonne générée ou
> une politique RLS — seulement dans un `UPDATE` ponctuel ou dans l'application,
> avec le fuseau nommé explicitement.

La raison technique : `timezone(text, timestamptz)` — c'est-à-dire
`… AT TIME ZONE 'America/Port-au-Prince'` — est **STABLE**, pas `IMMUTABLE`,
parce que les noms de fuseaux sont redéfinissables. PostgreSQL refuse toute
fonction non immuable dans une expression d'index ou une colonne générée. Un
`(expires_at AT TIME ZONE …)::date` indexé aurait fait échouer la migration à
l'application. Seule la surcharge à `interval` est immuable, et un décalage fixe
`-05:00` serait faux la moitié de l'année : Haïti observe l'heure d'été.

### Inventaire des types — `20260911_document_center_foundation.sql`

**`documents` — colonnes ajoutées**

| Colonne | Type | Nature | Note |
|---|---|---|---|
| `document_type_id` | `UUID` → `document_types` | référence | |
| `status` | `TEXT` + `CHECK` (7 valeurs) | énuméré | |
| `visibility` | `TEXT` + `CHECK` (3 valeurs) | énuméré | |
| `storage_bucket`, `storage_path` | `TEXT` | | remplacent `url` |
| `current_version` | `INTEGER` DEFAULT 1 | | |
| `owner_user_id`, `reviewed_by`, `approved_by` | `UUID` → `auth.users` | `ON DELETE SET NULL` | |
| `reviewed_at`, `approved_at` | `TIMESTAMPTZ` | **instant** | correct |
| `signature_required` | `BOOLEAN` | | |
| `signature_status` | `TEXT` + `CHECK` nullable | énuméré | |
| **`expires_on`** | **`DATE`** | **calendrier** | **ajoutée par cette correction** |
| `is_dynamic` | `BOOLEAN` | | |
| `snapshot_locked_at` | `TIMESTAMPTZ` | **instant** | le moment où l'on fige |
| `period_start`, `period_end` | `DATE` | **calendrier** | « août 2026 » ne dépend pas du lecteur |
| `ocr_text` | `TEXT` | | |
| `ai_analysis_allowed` | `BOOLEAN` DEFAULT TRUE | | |
| `ai_confidence` | `NUMERIC(4,3)` + `CHECK 0..1` | | |
| `ai_analyzed_at` | `TIMESTAMPTZ` | **instant** | correct |
| `search_vector` | `TSVECTOR` **GENERATED STORED** | | voir ci-dessous |

**Colonnes héritées, et leur sort**

| Colonne | Type | Sort |
|---|---|---|
| `expires_at` | `TIMESTAMPTZ` | **dépréciée** — type calendaire porté par un instant |
| `url` | `TEXT` | dépréciée — `NOT NULL` levé |
| `type` | `TEXT` | dépréciée — `CHECK` et `NOT NULL` levés |
| `metadata` | `JSONB` | conservée, non contrainte, non indexée |
| `tags` | `TEXT[]` | conservée + index GIN ajouté |
| `signed_at`, `created_at`, `updated_at`, `deleted_at` | `TIMESTAMPTZ` | instants — corrects, inchangés |

**L'unique expression calculée**

```sql
search_vector TSVECTOR GENERATED ALWAYS AS (
  to_tsvector('simple',
    coalesce(name,'') || ' ' || coalesce(description,'') || ' ' || coalesce(ocr_text,''))
) STORED
```

Entrées : `TEXT` uniquement. `to_tsvector(regconfig, text)` avec configuration
constante est `IMMUTABLE` — la contrainte des colonnes générées est satisfaite.
Configuration `'simple'` et non `'french'` : `unaccent()` n'est pas immuable,
l'accentuation se traite au moment de la requête via `pg_trgm`.

⚠️ **`tags` en a été retiré.** La première version contenait
`array_to_string(tags,' ')`, et PostgreSQL refusait la colonne — *generation
expression is not immutable*. `array_to_string(anyarray, text)` est **`STABLE`**,
parce qu'elle appelle la fonction de sortie du type des éléments, laquelle peut
dépendre de `DateStyle` ou `TimeZone`. Que `tags` soit un `TEXT[]` n'y change
rien : la volatilité est déclarée sur la fonction, pas déduite des arguments.
Aucune perte — `tags` a son propre index GIN, et `tags @> ARRAY['licence']` est
de toute façon une meilleure recherche par étiquette.

### Garde-fous d'exécution

Le fichier commence par deux vérifications qui échouent avec un message clair
plutôt que par une erreur cryptique quatre cents lignes plus bas :

1. **L'énumération** contient bien `manager` et `employee` — sinon la migration
   `20260910` n'a pas été jouée, et toutes les politiques échoueraient sur
   *invalid input value for enum member_role_type*.
2. **`is_business_member(uuid)` et `fn_has_role(uuid, member_role_type[])`
   existent** — ce projet applique ses migrations à la main, rien ne garantit
   que les anciennes soient toutes passées.

La création du bucket et la politique `storage.objects` sont chacune enveloppées
dans un `EXCEPTION WHEN insufficient_privilege` : sur un projet où le schéma
`storage` n'appartient pas au rôle qui migre, le reste s'applique quand même et
un `NOTICE` indique quoi faire à la main.

Note de syntaxe : les messages `RAISE` tiennent en **un seul littéral**, ou
passent par `USING MESSAGE = … || …`. La concaténation de littéraux adjacents
séparés par un saut de ligne est une règle de l'analyseur SQL principal — dont
`COMMENT ON` profite — mais la grammaire `RAISE` de plpgsql attend un unique
`SCONST` et rejetterait la forme sur deux lignes.

**Index — aucun ne calcule quoi que ce soit**

Tous portent sur des colonnes nues ; les clauses `WHERE` ne font que des tests
`IS NULL` / `IS NOT NULL`. `idx_documents_expires_on` porte sur une `DATE`, donc
rien à évaluer.

**Nouvelles tables**

| Table | Colonnes notables |
|---|---|
| `document_types` | `key/label_fr/label_ht/category/sensitivity/default_visibility` en `TEXT` (+`CHECK`), `requires_expiration`/`is_dynamic`/`is_active` en `BOOLEAN`, `sort_order` `INTEGER`, `created_at` `TIMESTAMPTZ` (instant) |
| `document_permissions` | `role` en **`member_role_type`** (l'énumération, pas du `TEXT` — le type contraint la valeur), `can_write` `BOOLEAN`, `created_at` `TIMESTAMPTZ` |

**Fonctions** — `can_read_document(UUID)` et `can_write_document(UUID)`,
`plpgsql`, `STABLE`, `SECURITY DEFINER`, `SET search_path = public`. Elles ne
lisent aucune valeur temporelle : ni date, ni conversion, ni `now()`.

### Fichiers touchés

| Fichier | Changement |
|---|---|
| `supabase/migrations/20260910_…sql` | **créé** — deux valeurs d'énumération |
| `supabase/migrations/20260911_…sql` | **créé** — catalogue, colonnes, fonctions, politiques, bucket |
| `lib/rbac.ts` | `inventory_manager` + 10 permissions `documents:*` + catégorie « Documents » |
| `lib/planFeatures.ts` | 12 capacités réparties sur les trois offres |
| `lib/activityLog.ts` | 7 actions + 3 entités (colonnes `TEXT` libre — aucune migration) |
| `lib/notify.ts` | 4 types de notification (idem) |
| `lib/documents/types.ts` | **créé** — le vocabulaire partagé, module pur ; `expirationState()` / `daysUntilExpiration()` travaillent sur des dates calendaires `YYYY-MM-DD`, jamais sur des instants ; `BUSINESS_TIME_ZONE` et `todayISO()` nomment le fuseau une seule fois |

`npm run typecheck` passe. Les trois questions du bas de ce document restent ouvertes — aucune ne bloque la Phase 1.

---

## ÉTAT — Phase 1 livrée le 7 septembre 2026

Le module existe et se manipule : on dépose, on cherche, on consulte, on télécharge.

### À appliquer, après les deux migrations de la Phase 0

| # | Fichier | Remarque |
|---|---|---|
| 3 | `supabase/migrations/20260912_document_center_relations.sql` | `document_versions`, `document_links`, leurs politiques. Vérifie en tête que `can_read_document()` existe. |

> ⚠️ **La numérotation des migrations a glissé d'un rang** par rapport à la liste du §11 ci-dessous : la réconciliation des rôles (`20260910`) s'est intercalée. L'ordre réel est `20260910` → `20260911` (socle) → `20260912` (relations). Le §11 n'a pas été réécrit pour ne pas perdre la trace de ce qui était prévu.

### Le chemin du fichier, de bout en bout

```
dépôt      POST /api/documents/upload
             taille (413) → octets d'en-tête (415) → ligne → bucket → chemin + version 1
lecture    GET  /api/documents/[id]/file[?version=N][&download=1]
             RLS lit la ligne (donc can_read_document) → URL signée 60 s → 302
```

Trois décisions qui méritent d'être relues avant d'être défaites :

- **La ligne `documents` s'écrit AVANT le fichier**, parce que le chemin de stockage contient l'identifiant du document. Si le dépôt échoue, la ligne est retirée — la bibliothèque n'affiche jamais un document sans fichier.
- **Un refus de lecture rend 404, pas 403.** Répondre « interdit » sur un document confidentiel confirmerait son existence à qui le cherche.
- **L'autorisation n'est calculée qu'une fois**, par la politique RLS. La route ne rejoue pas la règle : une ligne qui revient est une ligne qu'on a le droit de voir.

### Écrans

| Adresse | Ce qu'on y fait |
|---|---|
| `/documents` | Expirés, échéances à trente jours, derniers documents, familles. `FirstRun` plein écran tant que rien n'existe. |
| `/documents/bibliotheque` | Recherche (300 ms de silence avant la requête), familles, urgence, archives, « Voir plus ». `NoResult` avec correction probable. |
| `/documents/[id]` | Aperçu (image, PDF), informations, versions, modifier / archiver / supprimer. |

### Le bloc « Documents » sur les fiches (§37)

Trois écrans le portent : `/customers`, `/employes`, `/suppliers`. C'est la question
inverse de celle de la bibliothèque — non pas « où est ce document ? », mais
« qu'est-ce que j'ai sur CE fournisseur ? », celle qu'on se pose avec quelqu'un
au téléphone.

Deux gestes, de poids délibérément inégal :

- **Déposer** — le fichier n'existe pas encore ; le rattachement se fait à
  l'envoi, la route acceptait déjà `entityType` / `entityId`.
- **Rattacher un document existant** — un lien sous la liste, pas un second
  bouton dans l'en-tête. C'est le §36 : le même contrat appartient au
  fournisseur ET à la commande. Sans ce geste, le marchand redéposerait le même
  PDF sur chaque fiche et l'application aurait trois vérités pour un document.

La croix d'une ligne retire le **rattachement**, pas le document — d'où le
`linkId` désormais rendu par `listDocumentsForEntity()`, et l'absence de
confirmation : le geste se refait d'un clic, deux lignes plus bas.

Sans l'offre ou sans la permission, **la section n'existe pas** : ni cadenas, ni
invitation à monter d'offre au milieu d'une fiche client.

**Le score de santé et les documents manquants du §6 ne sont PAS sur l'accueil.** Ils demandent `document_requirements`, qui arrive en Phase 3 ; les afficher avant reviendrait à noter un marchand sur une exigence qu'on n'a pas encore écrite.

### Fichiers touchés

| Fichier | Changement |
|---|---|
| `supabase/migrations/20260912_…sql` | **créé** — `document_versions`, `document_links` |
| `lib/documents/storage.ts` | **créé** — types acceptés, reniflage des octets d'en-tête, assainissement des noms, construction du chemin |
| `app/actions/documents.ts` | **créé** — catalogue, bibliothèque, accueil, fiche, écritures, rattachements |
| `app/api/documents/upload/route.ts` | **créé** — dépôt, validation MIME serveur, version 1 |
| `app/api/documents/[id]/file/route.ts` | **créé** — lecture par URL signée |
| `components/documents/DocumentBadges.tsx` | **créé** — statut, échéance, visibilité |
| `components/documents/DocumentUploader.tsx` | **créé** — feuille de dépôt, progression réelle (XHR) |
| `components/documents/DocumentList.tsx` | **créé** — la ligne de liste, partagée par les trois écrans |
| `app/documents/…` | **créés** — accueil, bibliothèque, fiche |
| `components/nav.tsx` | 1 entrée « Documents » dans « Gestion » + `ROUTE_FEATURE` |

Puis, pour le bloc de fiche :

| Fichier | Changement |
|---|---|
| `components/documents/EntityDocuments.tsx` | **créé** — le bloc et sa feuille de rattachement |
| `components/documents/DocumentList.tsx` | `DocumentRow` accepte un geste (`action`) posé À CÔTÉ du lien, jamais dedans |
| `app/actions/documents.ts` | `listDocumentsForEntity()` rend `linkId` et `relation`, écarte les supprimés, garde les archivés |
| `lib/documents/types.ts` | `DOCUMENT_ENTITY_TYPES`, `DocumentEntityType`, `DocumentRelation` — une seule liste pour l'application et pour le `CHECK` |
| `app/api/documents/upload/route.ts` | lit cette liste au lieu de la recopier |
| `app/customers/page.tsx` | le bloc, après l'historique des transactions |
| `app/employes/page.tsx` | le bloc, avant les statistiques d'équipe ; masqué sur les lignes `demo-` |
| `app/suppliers/page.tsx` | le bloc, dans le repli du fournisseur ouvert |

`npm run typecheck` passe.

### Ce qui reste avant la Phase 2

1. **`lib/database.types.ts` à régénérer.** Les colonnes de la Phase 0 et les deux tables de la Phase 1 n'y sont pas ; le comptage par famille lit donc l'embarquement PostgREST sous ses deux formes possibles, ce qui cessera d'être nécessaire une fois les types à jour.
2. **Les versions ne se créent qu'au dépôt initial.** Déposer une version 2 sur un document existant est une action de Phase 2 (`app/actions/documentVersions.ts`).
3. **Les huit autres entités du §36 n'ont pas encore de bloc.** Produit, commande, vente, achat, dépense, contrat, transaction, entreprise : `EntityDocuments` les accepte déjà — il n'y a qu'à le poser sur l'écran qui les affiche, quand cet écran aura une fiche où le poser.

---

## ÉTAT — Phase 2 livrée le 7 septembre 2026

L'application ne fait plus que ranger des documents : elle en **écrit**.

### À appliquer

| # | Fichier | Remarque |
|---|---|---|
| 4 | `supabase/migrations/20260913_document_templates.sql` | `document_templates` + 8 modèles bilingues, `documents.content_blocks`, `documents.template_id`, `document_versions.content_blocks`. Vérifie ses deux prérequis en tête. |

### Un document écrit n'est pas un objet à part

C'est la décision structurante de la phase. Un contrat rédigé dans
l'application entre dans `documents`, avec le même `business_id`, la même
politique RLS, la même bibliothèque, la même expiration, les mêmes
rattachements. Une seule colonne le distingue d'un PDF déposé :

```
storage_path IS NOT NULL                          un fichier déposé
content_blocks IS NOT NULL, storage_path NULL     un document écrit
```

Deux tables auraient dédoublé la recherche, les permissions et le moteur
d'expiration pour la seule raison que l'un est un PDF et l'autre non.

### Des blocs, pas du HTML

`lib/documents/blocks.ts` définit huit blocs typés — titre, paragraphe, liste,
informations, tableau, encadré, signatures, espace. Trois raisons, dans l'ordre
où elles comptent : **du HTML libre en base, c'est tout ce qu'un navigateur
accepte qui entre en base** ; un arbre de blocs se rend à l'écran, au papier et
en texte brut pour la recherche ; et `{"type":"signature"}` se relit dans six
mois, `<div class="sig">` non.

Le modèle porte des textes **bilingues** ; le document porte des textes
**résolus**. Un contrat de travail réel n'est pas bilingue — le choix se fait
une fois, à la création, et évite un éditeur à deux colonnes.

### Les variables (§21)

`lib/documents/variables.ts` est pur, donc testable sans base. Vingt et une
variables sur cinq portées, et trois règles visibles à l'écran :

| Cas | Ce qui s'affiche | Pourquoi |
|---|---|---|
| Variable inconnue | `{{employee.badge}}`, tel quel | un marqueur visible se corrige ; un blanc se signe sans qu'on l'ait vu |
| Variable vide | `____________` | c'est ce qu'un contrat imprimé attend d'une donnée manquante |
| Valeur contenant `{{ }}` | insérée telle quelle | une seule passe, jamais de récursion : un client nommé `{{company.name}}` ne devient pas le nom du commerce |

### Versions (§38)

**Restaurer, c'est avancer.** Restaurer la version 2 ne fait pas reculer le
document : cela crée une version 5 dont le contenu est celui de la 2. On peut
donc restaurer, constater que ce n'était pas la bonne, et revenir à la 4 — qui
existe toujours. Le fichier n'est jamais recopié : une version est immuable,
partager son objet de stockage ne risque rien et évite de payer deux fois le
même octet.

Un enregistrement qui ne change rien ne crée pas de version. Sans cette
exception, ouvrir l'éditeur, relire et refermer par « Enregistrer » produirait
dix versions identiques.

### Écrans et fichiers

| Fichier | Changement |
|---|---|
| `lib/documents/blocks.ts` | **créé** — les huit blocs, validation du JSONB, bilingue → une langue, texte brut |
| `lib/documents/variables.ts` | **créé** — catalogue, substitution en une passe, portées requises |
| `lib/documents/csv.ts` | **créé** — l'utilitaire du §55, extrait de la route de sauvegarde, avec le point-virgule et le BOM qui manquaient |
| `app/actions/documentTemplates.ts` | **créé** — catalogue, création depuis modèle, page vierge, enregistrement du corps |
| `app/actions/documentVersions.ts` | **créé** — lister, lire, restaurer |
| `app/actions/documentSources.ts` | **créé** — listes légères pour les menus de variables (id + nom, rien d'autre) |
| `app/api/documents/[id]/versions/route.ts` | **créé** — dépôt d'une nouvelle version de fichier |
| `components/documents/DocumentBlocks.tsx` | **créé** — le rendu, écran et papier, sans `dangerouslySetInnerHTML` |
| `components/documents/DocumentEditor.tsx` | **créé** — l'éditeur par blocs, « Écrire » / « Relire » |
| `components/documents/NewVersionSheet.tsx` | **créé** — la feuille de dépôt d'une version |
| `app/documents/creer/`, `app/documents/modeles/`, `app/documents/[id]/editer/` | **créés** |
| `app/documents/[id]/DocumentDetailClient.tsx` | aperçu du corps, impression, restauration, dépôt de version |
| `app/documents/bibliotheque/page.tsx` | export CSV **des filtres affichés**, pas de la page chargée |
| `app/documents/page.tsx` | « Écrire » à côté de « Déposer », dans l'en-tête et dans le `FirstRun` |
| `app/actions/documents.ts` | `hasFile`, `contentBlocks`, `templateId` sur la fiche |
| `components/nav.tsx` | `/documents/creer` → `documents` ; `/documents/modeles` → `document_templates` |

### Deux arbitrages à connaître

1. **Écrire est Esansyel, le modèle est Kwasans.** Le tableau du §9 promettait
   « vierge + modèles de base » à Esansyel ; l'union `Feature` du §6 classe
   `document_templates` en Kwasans. Les deux se concilient ainsi : la page
   vierge et l'éditeur pour tous, la bibliothèque de modèles au palier
   supérieur. C'est elle qui fait gagner l'heure de rédaction.
2. **Le §23 est porté par la base, pas par l'écran.**
   `document_templates.requires_professional_review` marque les quatre modèles
   qui engagent ; la mention s'affiche dans la liste, dans la feuille de
   création, et dans le document produit. Un écran peut oublier une mention ;
   une colonne répond à « lesquels ? » en une requête.

`npm run typecheck` passe.

---

## 1. CURRENT ARCHITECTURE AUDIT

### Socle technique

| Élément | État |
|---|---|
| Framework | Next.js **16.2.7**, App Router, React 18.3.1, TypeScript 5.6.2 |
| Middleware | `proxy.ts` à la racine (Next 16 a remplacé `middleware.ts` par `proxy.ts`) |
| Base | Supabase Postgres — `@supabase/ssr` 0.10, `@supabase/supabase-js` 2.31 |
| Style | Tailwind 3.4 + design system maison (`components/ds`), Radix pour les primitives |
| IA | `ai` 6.x + `@ai-sdk/anthropic` (Claude Sonnet), clé serveur uniquement |
| Données client | TanStack Query 5 |
| i18n | maison — `useLanguage()` → `t({ fr, ht })`, pas de fichiers de traduction |
| Hébergement | Vercel (2 crons déclarés dans `vercel.json`) |
| Tests | **aucune infrastructure de test** (ni vitest, ni jest, ni playwright configuré) |

### Trois clients Supabase, trois usages

- `lib/supabaseServerClient.ts` — session utilisateur, **RLS active**. Le défaut.
- `lib/supabaseServiceClient.ts` — clé de service, **RLS contournée**. Réservé aux crons, webhooks et compteurs de quota.
- `lib/supabaseClient.ts` — navigateur.

### Authentification et contexte d'entreprise

`lib/serverAuth.ts` est le point d'entrée de toute action serveur :

- `getBusinessContext()` — memoïsé par requête (`cache()`). Résout `{ supabase, userId, businessId, exchangeRate, defaultCurrency, role, can() }`.
- Résolution de l'entreprise : cookie `pp_active_store` → entreprise possédée la plus ancienne → adhésion la plus ancienne → création. Chaque lecture porte `.limit(1)` (sans lui, `maybeSingle()` lève quand un compte a deux commerces).
- `requirePermission(permission)` — garde RBAC.
- `verifyBusinessAccess(businessId)` — garde d'appartenance explicite.

**Conséquence pour le Document Center :** toute lecture ou écriture documentaire passe par `getBusinessContext()`. Jamais par `owner_id` seul.

### Permissions (RBAC)

`lib/rbac.ts` — 7 rôles (`owner`, `admin`, `manager`, `cashier`, `accountant`, `employee`, `viewer`) et ~35 permissions de la forme `domaine:verbe`. `roleHasPermission()` est pur ; `ROLE_PERMISSIONS` est la table unique.

**Il n'existe aucune permission `documents:*` aujourd'hui.**

### Offres et gating

Quatre couches, déjà en place et cohérentes :

1. `lib/plans.ts` — les trois offres. Clés techniques en base (`Ti Machann` / `Business Pilot` / `Expert`), noms commerciaux affichés (**Esansyel / Kwasans / Elit**).
2. `lib/planFeatures.ts` — l'union `Feature`, une capacité vendable par entrée, et les trois listes cumulatives.
3. `lib/entitlements.ts` — `hasFeature()`, `assertFeature()` (lève `FeatureLockedError`), `assertPermission()`. Lit `subscriptions` + `feature_grants` (droits temporaires, ex. parrainage).
4. `lib/quotas.ts` — les plafonds chiffrés (`ai_questions`, `products`) + `quota_grants`.

Et `lib/dashboardLevel.ts` — `basic` / `advanced` / `executive`, avec le registre des modules de tableau de bord et leur triple condition : offre + permission + **données réelles disponibles**.

Le gating client (`PermissionGate`, `PlanLock`, `usePermissions`, `usePlan`) est **cosmétique** ; le serveur doit toujours ré-asserter.

### Navigation

`components/nav.tsx` est la **source unique** : `BOTTOM_BAR` (4 entrées mobiles) + `MORE_SECTIONS` (3 sections, ~25 entrées) + `ROUTE_FEATURE` (adresse → capacité exigée) + `featureForPath()`. La barre latérale de bureau (`components/Sidebar.tsx`) et la page `/plus` lisent toutes deux ce fichier.

**Ajouter « Documents » au menu = éditer ce seul fichier.**

### Stockage de fichiers

Trois buckets existent :

| Bucket | Public | Limite | Politique |
|---|---|---|---|
| `store-assets` | oui | 10 Mo, MIME allowlist images | lecture publique, écriture membre, dossier `<business_id>/…` |
| `backups` | **non** | 100 Mo | pas de politique `storage.objects` — accès uniquement via clé de service |
| `product-images` | oui | — | créé hors migration |

Le modèle « dossier préfixé par `business_id` + `storage.foldername(name)[1]` dans la politique » (migration `20260903_store_builder.sql`) est **le bon patron à reprendre**, en version privée.

Le téléchargement de sauvegarde (`app/api/backup/[id]/download/route.ts`) montre le patron d'accès contrôlé : vérifier la session → vérifier la propriété → `service.storage.download()` → renvoyer le flux. Aucune URL de stockage n'est exposée au navigateur.

### Architecture IA

- `app/api/ai/chat/route.ts` — la seule route qui parle au fournisseur. Clé lue de `process.env.ANTHROPIC_API_KEY`, jamais envoyée au client. Vérifie l'abonnement (`plansWithFeature('ai_assistant')`), puis consomme un jeton de quota via le RPC atomique `consume_ai_question` appelé avec la **clé de service** (sinon le marchand choisirait son propre plafond). Streaming SSE.
- **Traitements longs** : `ai_asset_jobs` + `app/api/ai/enhance-image/route.ts` + `.../webhook/route.ts`. Table avec `status`, `provider`, `provider_job_id`, `callback_token` (secret partagé), et une **vue `v_ai_asset_jobs` qui masque le jeton**. C'est exactement l'architecture de job demandée au §60 — elle existe déjà et se généralise.
- Historique : `ai_conversations` / `ai_messages`.

### Journal d'activité

`lib/activityLog.ts` — `logActivity()` en « fire-and-forget », n'échoue jamais. Deux unions fermées : `ActivityAction` (13 valeurs) et `ActivityEntity` (15 valeurs). `listActivityLogs()` filtre, pagine et compte.

⚠️ La table s'appelle `activity_logs` et sa colonne de cadrage est **`company_id`**, pas `business_id`. C'est la seule table du schéma dans ce cas.

### Notifications

`lib/notify.ts` — insertion via clé de service, destinataire = propriétaire par défaut, respect de `notification_preferences` (une colonne booléenne par type, pas une ligne par type). Union `NotifType` fermée (10 valeurs).

Deux crons dans `vercel.json` : `/api/cron/daily` (11h — relances de créances + stock bas + parrainage, une alerte par entité et par jour) et `/api/cron/weekly-digest`. **L'« expiration engine » du §34 se branche dans le cron quotidien existant, il ne réclame pas un cron neuf.**

### Rapports financiers

- `lib/financialReporting.ts` — `generateProfitAndLoss()`, `generateBalanceSheet()`, `generateCashFlow()` + cache mémoire invalidable.
- Tables d'instantanés déjà présentes : `income_statement_snapshots`, `balance_sheet_snapshots`, `cashflow_snapshots`, `equity_statement_snapshots`, `report_snapshots`, `financial_reports` (avec `pdf_url`, `period_start/end`, `status`, `data` JSONB).
- Moteur comptable complet : `journal_entries`, `journal_entry_lines`, `chart_of_accounts`, `accounting_periods`, `fiscal_years`, vues `v_grand_livre`, `v_monthly_pnl`, `v_balance_verification`.

**Le §28 (« ne pas créer un P&L manuel si les données existent déjà ») est donc déjà à moitié satisfait : le moteur existe, il lui manque une porte côté Document Center.**

### Exports

Pas de bibliothèque PDF. Le PDF sort de la **boîte d'impression du navigateur** : `window.print()` + `react-to-print` sur des composants dédiés (`components/credit/CreditFileReport.tsx`, `components/reports/ReportActions.tsx`, `components/InvoiceTemplate.tsx`). Le CSV est écrit à la main ; `fflate` produit les ZIP.

### Recherche

`pg_trgm` et `unaccent` sont **déjà installés** (migration `20260526_complete_schema_v2.sql`) — recherche floue et insensible aux accents disponibles immédiatement. **`pgvector` n'est pas installé** : la recherche sémantique du §17 est une préparation d'architecture, pas une livraison de phase 1.

### Design system

`CONSTITUTION_VISUELLE.md` fait loi : une police, deux graisses, quatre tailles, trois couleurs, trois rayons, deux ombres, six espacements, trois hauteurs de cible. `components/ds/index.ts` expose `Card`, `Section`, `ScreenHeader`, `Money`, `Button`, `Badge`, `FilterPill`, `FirstRun`, `NoResult`, `BottomSheet`, `Field`, `Stat`, `PeriodBars`…

**§10 de la constitution — « Aucune donnée fictive » — recoupe le §83 du cahier des charges.** Tout écran documentaire vide affiche `FirstRun`, jamais un exemple.

---

## 2. EXISTING FEATURES TO REUSE

Rien de ce qui suit ne doit être réécrit.

| Besoin du cahier des charges | Ce qui existe déjà | Verdict |
|---|---|---|
| §41 Permissions documentaires | `lib/rbac.ts` + `requirePermission()` | **Étendre** l'union `Permission` avec `documents:*` |
| §54/74-76 Gating par offre | `planFeatures.ts` + `assertFeature()` | **Étendre** l'union `Feature` |
| §43 Journal d'activité | `lib/activityLog.ts` + table `activity_logs` | **Étendre** les deux unions |
| §48 Notifications | `lib/notify.ts` + `notification_preferences` | **Étendre** `NotifType` |
| §34 Moteur d'expiration | cron `/api/cron/daily` + garde-fou « une alerte par jour » | **Brancher dedans** |
| §60 Architecture de job IA | `ai_asset_jobs` + webhook + `callback_token` + vue masquante | **Généraliser** en `document_ai_jobs` |
| §28-30 Documents financiers dynamiques | `lib/financialReporting.ts` + `*_snapshots` + `financial_reports` | **Brancher**, ne rien recalculer |
| §55 Export PDF | `react-to-print` + composants d'impression | **Réutiliser** le patron |
| §55 Export CSV/ZIP | `jsonToCsv()` + `fflate` dans la route de sauvegarde | **Extraire** en utilitaire partagé |
| §57 Stockage privé | patron `backups` (bucket privé + route de téléchargement authentifiée) | **Reprendre tel quel** |
| §16 Recherche | `pg_trgm` + `unaccent` installés | **Utiliser** |
| §67 UI | `components/ds` + `CONSTITUTION_VISUELLE.md` | **Obligatoire** |
| §68 États vides | `FirstRun` / `NoResult` | **Obligatoire** |
| §49 Dashboards par offre | `lib/dashboardLevel.ts` + registre de modules | **Ajouter 3 modules** |
| §36 Relations documentaires | `documents.reference_type/reference_id` (polymorphique) | **Insuffisant** — voir §7 |
| §5/§64 Score de santé | `lib/healthScore.ts` (score financier, 4 piliers, pur) | **Modèle à copier**, pas à réutiliser |
| §2 Entrée de menu | `components/nav.tsx` | Une seule édition |
| §21 Variables dynamiques | `businesses` (name, legal_name, address, phone, email, tax_id, country, city, logo_url), `customers`, `employees`, `suppliers` | **Toutes les sources existent** |
| §27 Brand Center | `store_settings` (logo, couleurs, tagline, meta, réseaux) + `businesses.logo_url` | **Partiellement** — voir §7 |

### Ce qui existe et que personne n'utilise

C'est la découverte principale de cet audit.

**La table `documents` existe déjà** (migration `20260526_schema_v3_completion.sql`, § E) :

```
id, business_id, upload_id, type, name, description,
reference_type, reference_id, url, mime_type, size_bytes,
is_signed, signed_at, signed_by, expires_at, is_archived,
tags, metadata, created_by, created_at, updated_at, deleted_at
```

Avec 4 index, dont `idx_docs_expires ON documents(expires_at) WHERE expires_at IS NOT NULL AND deleted_at IS NULL`, et une politique RLS `documents_access` (`20260606_rls_business_membership.sql`).

**La table `uploads` existe aussi** (`20260526_complete_schema_v2.sql`, § 17) : `bucket`, `path`, `url`, `filename`, `mime_type`, `size_bytes`, référence polymorphique.

**Aucune ligne de code TypeScript ne lit ni n'écrit dans l'une ou l'autre.** Vérifié : zéro occurrence de `from('documents')` ou `from('uploads')` dans `app/`, `lib/`, `components/`.

Nous ne partons donc pas de zéro : nous partons d'une **fondation posée puis abandonnée**, qu'il faut corriger avant de bâtir dessus (voir §3 et §8).

---

## 3. DATABASE IMPACT

### Ce qui existe et doit être corrigé

**a) `documents.type` est une liste fermée de 13 valeurs**

```sql
CHECK (type IN ('invoice_pdf','receipt','expense_receipt','purchase_order',
                'contract','employee_document','id_document','business_license',
                'tax_document','report_pdf','product_image','logo','other'))
```

Le cahier des charges (§3) demande ~60 types répartis en 6 catégories (Strategy, Finance, Operations, Sales & Legal, HR, Compliance). Un `CHECK` figé rendrait toute nouvelle catégorie dépendante d'une migration.

→ **Remplacer par une table de référence `document_types`** (clé, catégorie, libellé bilingue, `requires_expiration`, `is_dynamic`) et une clé étrangère. Les 13 valeurs actuelles y sont insérées telles quelles, la contrainte tombe : aucune ligne existante n'est invalidée.

**b) `documents.url TEXT NOT NULL` est un piège de sécurité**

Une URL signée expire ; une URL publique n'aurait jamais dû exister pour un contrat ou une fiche de paie. Stocker l'URL est incompatible avec le §57 et le §83 (« aucun document confidentiel accessible via URL publique »).

→ **Stocker `storage_bucket` + `storage_path`**, rendre `url` nullable et dépréciée, et **fabriquer l'URL signée à la lecture**, courte durée, dans une route authentifiée — exactement le patron de `app/api/backup/[id]/download/route.ts`.

**c) La politique RLS `documents_access` est trop large**

```sql
CREATE POLICY "documents_access" ON public.documents
  FOR ALL USING (is_business_member(business_id))
  WITH CHECK (is_business_member(business_id));
```

`is_business_member()` ne connaît que l'appartenance, **pas le rôle**. Aujourd'hui, un `viewer` ou un `cashier` pourrait lire, modifier **et supprimer** tous les documents de l'entreprise — y compris les fiches de paie et les contrats. C'est acceptable pour `uploads` (photos de reçus) ; c'est inacceptable pour un centre documentaire (§42, §78, §83).

→ Voir §6 (modèle de permission) : politiques séparées + fonction `can_read_document()`.

### Tables nouvelles — le strict nécessaire

Le §58 liste 15 tables et ajoute « **Ne crée PAS aveuglément toutes ces tables** ». Voici l'arbitrage, table par table.

| Table proposée (§58) | Décision | Raison |
|---|---|---|
| `documents` | **existe** — à faire évoluer | voir ci-dessus |
| `document_versions` | **créer** | §38, §71 — aucun équivalent |
| `document_categories` | **créer** (fusionnée en `document_types`) | remplace le `CHECK` figé |
| `document_templates` | **créer** | §19, §53, §54 |
| `document_tags` | **ne pas créer** | `documents.tags TEXT[]` + index GIN suffit |
| `document_permissions` | **créer** | §42 — indispensable au « restricted » |
| `document_links` | **créer** | §36 — la référence polymorphique unique ne tient pas (un contrat lie un client *et* un fournisseur) |
| `document_activity_logs` | **ne pas créer** | `activity_logs` existe ; on étend ses unions |
| `document_extractions` | **créer** | §14, §61 — avec `confidence` par champ |
| `document_ai_jobs` | **créer** | §60 — calqué sur `ai_asset_jobs` |
| `document_reminders` | **ne pas créer en phase 3** | `documents.expires_at` + `notifications` + le cron quotidien couvrent §34. Une table de rappel ne se justifie que si les délais deviennent réglables par document — à ce moment-là, une colonne `reminder_offsets INT[]` sur `documents` suffit encore. |
| `document_requirements` | **créer** | §51, §52 — le référentiel par pays/industrie. Sans lui, le score de santé serait arbitraire (§5 l'interdit) |
| `document_signatures` | **ne pas créer** | §40 dit explicitement de ne pas bâtir la signature. Les 4 colonnes `signature_*` vont sur `documents` |
| `document_shares` | **créer, phase 6** | §56 — partage externe, hors du chemin critique |
| `document_folders` | **ne pas créer** | §82 : « ne pas construire un Google Drive ». Catégorie + tags + filtres remplacent l'arborescence |

**Bilan : 8 tables nouvelles, pas 15.** Toutes portent `business_id` avec `ON DELETE CASCADE` et une politique RLS.

### Tables touchées mais non restructurées

- `activity_logs` — aucune migration si les colonnes `action`/`entity` sont du `TEXT` libre ; on ajoute des valeurs aux unions TypeScript. **À vérifier avant :** si un `CHECK` existe côté base, une migration l'élargit.
- `notifications` — idem.
- `businesses` — potentiellement 2 champs pour le Brand Center (§27). `businesses.settings JSONB` existe déjà et peut les porter sans migration : à arbitrer en phase 5.

---

## 4. STORAGE ARCHITECTURE

### Un bucket neuf, privé

```
bucket: business-documents
public: false
file_size_limit: 26214400        (25 Mo — configurable, §10)
allowed_mime_types: pdf, docx, xlsx, pptx, csv, txt, png, jpeg, webp, heic
```

Chemin : `<business_id>/<document_id>/<version>/<nom-assaini>`

Le `business_id` en **premier segment** est ce qui rend la politique RLS possible : `(storage.foldername(name))[1]`.

### Politique

```sql
-- Aucune lecture publique. Aucune.
CREATE POLICY "business_documents_member_rw" ON storage.objects
  FOR ALL TO authenticated
  USING (bucket_id = 'business-documents'
         AND EXISTS (SELECT 1 FROM business_members bm
                     WHERE bm.user_id = auth.uid() AND bm.is_active
                       AND bm.business_id::text = (storage.foldername(name))[1]))
  WITH CHECK (… idem …);
```

⚠️ Comme pour `store-assets`, ce bloc doit être enveloppé dans `EXCEPTION WHEN insufficient_privilege` : sur les projets hébergés, `storage.objects` n'appartient pas toujours au rôle qui joue la migration. Le message indique alors la manœuvre à faire depuis le tableau de bord Supabase.

### Lecture d'un document — le seul chemin autorisé

```
navigateur
  → GET /api/documents/[id]/file          (route authentifiée)
      → getBusinessContext()               (qui est-ce, quelle entreprise)
      → can_read_document(id)              (rôle + visibilité + ACL)
      → service.storage.createSignedUrl(path, 60)
      → redirect(302) vers l'URL signée
```

L'URL signée vit 60 secondes et n'est jamais persistée. Le navigateur ne connaît jamais le chemin de stockage.

**La politique RLS de `storage.objects` est la seconde barrière, pas la première.** Elle protège contre un appel direct au client Supabase depuis le navigateur ; c'est `can_read_document()` qui décide vraiment.

### Validation à l'upload

Le §10 est catégorique : « Ne jamais faire confiance à l'extension du fichier. »

1. Taille vérifiée avant lecture.
2. Type MIME vérifié **côté serveur** par lecture des octets d'en-tête (magic bytes), pas par le `file.type` que le navigateur déclare.
3. Nom de fichier assaini (pas de `../`, pas de caractères de contrôle, longueur bornée).
4. Le MIME retenu est celui détecté, pas celui déclaré.

---

## 5. AI ARCHITECTURE

### Le service, pas les appels directs

Un module `lib/ai/documentService.ts` expose les fonctions du §60. Aucun composant, aucune page n'appelle un fournisseur.

```
Composant client
  → server action / route API           (la clé n'existe que là)
      → lib/ai/documentService.ts       (l'abstraction)
          → @ai-sdk/anthropic           (déjà installé)
```

Fonctions : `classifyDocument()`, `extractDocument()`, `summarizeDocument()`, `generateDocument()`, `analyzeContract()`, `detectMissingInformation()`, `suggestDocuments()`, `generateSOP()`, `generateBusinessPlan()`, `generateBusinessModelCanvas()`.

### OCR (§13) — sans nouvelle dépendance

Aucune bibliothèque OCR n'est installée, et en installer une (Tesseract, ~15 Mo de données de langue) sur une fonction serverless Vercel est une mauvaise affaire.

**Claude lit nativement les PDF et les images.** L'extraction de texte et l'analyse se font donc dans le même appel, avec la dépendance déjà présente. Le texte extrait est stocké dans `documents.ocr_text` et indexé pour la recherche (§16).

Limite à documenter : les PDF très longs coûtent des jetons. Prévoir un plafond de pages par document, configurable, et un compteur de consommation par entreprise.

### Synchrone ou asynchrone

- **Synchrone** (route API, réponse directe) : classification à l'upload, résumé d'un document court, génération d'un brouillon depuis un modèle.
- **Asynchrone** (`document_ai_jobs`) : OCR d'un document long, analyse de contrat, génération d'un business plan complet. Statut `pending → processing → completed | failed`, `callback_token`, vue masquante `v_document_ai_jobs` qui n'expose jamais le jeton — le patron de `ai_asset_jobs` à l'identique.

### Confiance (§61) et audit (§62)

`document_extractions` porte, par champ extrait : `field_key`, `value_text`, `value_date`, `value_number`, `confidence NUMERIC(4,3)`, `confirmed_by`, `confirmed_at`.

Règle produit, non négociable : **une extraction non confirmée sous le seuil ne déclenche aucune action automatique.** Une date d'expiration à 62 % de confiance ne crée pas de rappel ; elle affiche « À vérifier » et attend un clic. C'est le §61 et le §83.

`document_ai_jobs` enregistre `provider`, `model`, `prompt_version`, `input_ref`, `output`, `tokens_in/out`, `created_at` — le §62.

### Confidentialité (§63)

Une colonne `documents.ai_analysis_allowed BOOLEAN NOT NULL DEFAULT true`, et un réglage d'entreprise qui décide du défaut. Un document marqué non analysable n'est **jamais** envoyé au modèle — la vérification est dans `documentService`, pas chez l'appelant.

### Contexte PilotAI (§73)

La récupération pour le chat filtre sur les documents que **l'utilisateur courant** peut lire, pas ceux de l'entreprise. La différence est le §73 tout entier. Sans `pgvector`, la phase 4 fait de la récupération par mots-clés (`pg_trgm` + `tsvector`) ; la phase 7 y ajoute les plongements.

### Quotas

Le patron `consume_ai_question` (RPC atomique, clé de service, test-et-incrément en une instruction) se duplique en `consume_document_ai_job`. Deux onglets ouverts ne doivent pas passer deux fois le plafond.

---

## 6. PERMISSION MODEL

Trois couches, dans cet ordre. Chacune peut refuser ; aucune ne peut autoriser seule.

### Couche 1 — l'offre (§74-76)

Nouvelles entrées dans l'union `Feature` :

```
Esansyel : documents                      (téléverser, stocker, chercher, alertes d'expiration de base)
Kwasans  : document_templates
           document_contracts
           document_compliance
           document_approvals
           document_ai_extraction
           document_health
Elit     : document_ai_studio
           document_intelligence
           business_knowledge_base
           document_advanced_sharing
           cross_company_documents
```

Chaque écran est branché via `ROUTE_FEATURE` dans `components/nav.tsx` ; chaque action serveur appelle `assertFeature()`.

### Couche 2 — le rôle (§41)

Nouvelles permissions RBAC :

```
documents:read          documents:create        documents:update      documents:delete
documents:share         documents:approve       documents:read_financial
documents:read_hr       documents:read_legal    documents:manage_templates
```

Répartition proposée, cohérente avec `ROLE_PERMISSIONS` :

| Rôle | Documents |
|---|---|
| `owner` | tout |
| `admin` | tout sauf la suppression définitive |
| `manager` | read, create, update, share — opérationnels ; **pas** `read_financial` ni `read_hr` |
| `accountant` | read + `read_financial` + export ; pas HR |
| `employee` | read sur ce qui lui est explicitement partagé, create sur ses propres pièces |
| `cashier` | read sur ce qui lui est partagé |
| `viewer` | read seul, hors financier / HR / légal |

### Couche 3 — le document (§42)

```
documents.visibility TEXT NOT NULL DEFAULT 'company'
  CHECK (visibility IN ('company','restricted','private'))
```

- `company` — tout membre dont le rôle porte la permission de catégorie.
- `restricted` — uniquement les entrées de `document_permissions` (par `user_id` ou par `role`).
- `private` — le créateur et le propriétaire de l'entreprise.

Une fonction `SECURITY DEFINER` `can_read_document(p_document_id uuid) RETURNS boolean` combine les trois, et **la politique RLS l'appelle** :

```sql
CREATE POLICY "documents_select" ON documents
  FOR SELECT USING (can_read_document(id));
```

Les politiques `INSERT` / `UPDATE` / `DELETE` sont séparées (plus de `FOR ALL`), pour que « lire » et « supprimer » cessent d'être le même droit.

**Le §78 est ainsi tenu : connaître l'identifiant d'un document ne donne rien.**

---

## 7. DOCUMENT DATA MODEL

```
businesses
   │
   ├─ documents ─────────────┬─ document_versions       (§38, §71 — jamais d'écrasement)
   │   business_id           ├─ document_extractions    (§14, §61 — confidence par champ)
   │   document_type_id ──►  ├─ document_permissions    (§42)
   │   status                ├─ document_links          (§36 — N liens, pas 1)
   │   visibility            ├─ document_ai_jobs        (§60)
   │   expires_at            └─ document_shares         (§56, phase 6)
   │   storage_bucket/path
   │   ocr_text / search_vector
   │
   ├─ document_types         (§3 — 6 catégories, ~60 types, bilingue)
   ├─ document_templates     (§19, §53 — par industrie et par offre)
   └─ document_requirements  (§51, §52 — pays × industrie × type, avec source)
```

### `documents` — les colonnes à ajouter

| Colonne | Type | § |
|---|---|---|
| `document_type_id` | `UUID → document_types` | §3 |
| `status` | `TEXT CHECK (draft, active, pending_review, approved, expired, archived, needs_update)` | §9 |
| `visibility` | `TEXT CHECK (company, restricted, private)` | §42 |
| `storage_bucket`, `storage_path` | `TEXT` | §57 |
| `current_version` | `INT NOT NULL DEFAULT 1` | §38 |
| `ocr_text` | `TEXT` | §13 |
| `search_vector` | `TSVECTOR` généré + index GIN | §16 |
| `ai_analysis_allowed` | `BOOLEAN DEFAULT true` | §63 |
| `ai_confidence` | `NUMERIC(4,3)` | §61 |
| `is_dynamic` | `BOOLEAN DEFAULT false` | §29 |
| `snapshot_locked_at` | `TIMESTAMPTZ` | §30 |
| `period_start`, `period_end` | `DATE` | §29 |
| `signature_required`, `signed_status` | `BOOLEAN`, `TEXT` | §40 |
| `reviewed_at`, `reviewed_by`, `approved_at`, `approved_by` | | §39 |
| `owner_user_id` | `UUID` | §8 |

`is_signed`, `signed_at`, `signed_by`, `expires_at`, `is_archived`, `tags`, `metadata` existent déjà.

### `document_links` — pourquoi une table

`reference_type` / `reference_id` ne portent **qu'une** relation. Or un contrat de fourniture lie un fournisseur, une entreprise et parfois un produit ; le §36 en liste huit types et le §37 exige que la fiche fournisseur affiche ses documents.

```
document_links (document_id, entity_type, entity_id, relation, created_at)
  entity_type ∈ business | employee | customer | supplier | product | order | sale | purchase | expense | contract | transaction
  UNIQUE (document_id, entity_type, entity_id, relation)
```

⚠️ **Vocabulaire :** le module commerce parle `orders` en minuscules, `sales` en énumération capitalisée. Le `entity_type` de `document_links` doit être traduit explicitement au moment de l'insertion, sinon l'insert échoue en silence.

### `document_requirements` — le référentiel qui rend le score honnête

Le §5 interdit un score arbitraire ; le §51 et le §83 interdisent de déclarer une obligation légale sans source.

```
document_requirements
  country_code       TEXT      -- 'HT', 'DO', 'US', 'FR', 'BR' … ou NULL = universel
  industry           TEXT      -- 'retail', 'restaurant', … ou NULL = toutes
  document_type_id   UUID
  necessity          TEXT      CHECK (recommended | commonly_required | optional)
  rationale          JSONB     -- texte bilingue expliquant POURQUOI
  source_url         TEXT      -- la source réglementaire, ou NULL
  source_verified_at DATE
```

`necessity` **ne comporte pas la valeur `legally_required`** tant qu'une source vérifiée n'accompagne pas la ligne. Un document sans `source_url` est présenté comme *recommandé*, jamais comme *obligatoire*. C'est la lecture stricte du §51 et du §83.

### Score de santé documentaire (§5, §64) — la formule

Sur le modèle de `lib/healthScore.ts` : une fonction **pure**, testable, et dont chaque facteur est affiché au marchand.

```
Complétude    35 pts   documents recommandés présents / documents recommandés
Validité      25 pts   documents non expirés / documents à date d'expiration
Fraîcheur     15 pts   documents revus dans leur période de révision
Conformité    15 pts   catégorie Compliance : présents et valides
Organisation  10 pts   documents classés (type + au moins un lien ou un tag)
```

Note globale + note par catégorie, avec les trois lectures `Healthy` / `Needs attention` / `Critical`. **Une entreprise sans aucun document n'obtient pas 0 — elle obtient un état `FirstRun`** : un zéro serait un chiffre affiché sans être une mesure, ce que le §83 et la constitution visuelle §10 interdisent tous les deux.

---

## 8. SECURITY RISKS

Classés par gravité.

| # | Risque | Gravité | Traitement |
|---|---|---|---|
| 1 | **`documents_access` en `FOR ALL USING (is_business_member(...))`** — un `viewer` lit et supprime les fiches de paie | **Critique** | Remplacer par 4 politiques + `can_read_document()`. **À faire avant tout écran.** |
| 2 | **`documents.url` en clair** — une URL de bucket public sur un contrat est publique pour toujours | **Critique** | `storage_bucket` / `storage_path` + URL signée 60 s via route authentifiée |
| 3 | **Fuite inter-entreprises** — un marchand à deux commerces (cas courant, cf. `pp_active_store`) | **Critique** | `business_id` sur chaque table, RLS + `getBusinessContext()`, jamais `owner_id` seul |
| 4 | **Confiance à l'extension de fichier** (§10) | Élevée | Détection MIME par octets d'en-tête, côté serveur |
| 5 | **Document confidentiel envoyé au modèle IA** (§63) | Élevée | `ai_analysis_allowed` vérifié dans `documentService`, pas chez l'appelant |
| 6 | **PilotAI cite un document que l'utilisateur ne peut pas lire** (§73) | Élevée | Récupération filtrée par `can_read_document()` pour l'utilisateur courant |
| 7 | **Extraction IA incertaine traitée comme vérité** (§61, §83) | Élevée | Seuil de confiance ; aucune action automatique sous le seuil |
| 8 | **Obligation légale affichée sans source** (§51, §83) | Élevée | `necessity` plafonnée à `recommended` sans `source_url` |
| 9 | **Lien de partage externe deviné ou éternel** (§56) | Élevée | Jeton 32 octets, expiration obligatoire, révocation, journalisation de chaque ouverture |
| 10 | **Webhook IA forgé** | Moyenne | `callback_token` par job — le patron `ai_asset_jobs` |
| 11 | **Clé de service utilisée par confort** | Moyenne | Réservée aux crons, webhooks, compteurs de quota. Toute autre lecture passe par la session |
| 12 | **Injection dans la recherche** — `listActivityLogs()` interpole `opts.search` dans un `.or()` | Moyenne | Ne pas reproduire ce patron ; assainir avant `.or()`. Ce point existant mérite d'être corrigé au passage |
| 13 | **Épuisement de stockage / coût** | Moyenne | Limite de taille, limite par entreprise selon l'offre, alerte |
| 14 | **Suppression définitive d'une version** (§38) | Moyenne | `deleted_at` uniquement ; purge réservée au propriétaire, journalisée |
| 15 | **Table `activity_logs` cadrée par `company_id`** | Faible mais piégeuse | Documenter ; `logActivity()` fait déjà la traduction |

---

## 9. UX ARCHITECTURE

### Où ça vit dans la navigation

Le §2 demande une entrée « Documents » avec 12 sous-entrées. La navigation actuelle est mobile-first : 4 entrées en bas, tout le reste dans `/plus`, structuré en 3 sections.

**Douze sous-entrées dans un menu contrediraient `components/nav.tsx` de bout en bout.** Le §67 le dit d'ailleurs lui-même : « Ne pas afficher trop d'informations simultanément. »

Proposition :

- **Une** entrée `/documents` ajoutée à `MORE_SECTIONS`, section « Gestion », entre « Clients » et « Rapports ».
- Les 12 destinations du §2 deviennent la **structure interne** de `/documents` : `Overview` est la page elle-même ; `My Documents`, `Templates`, `Compliance`, `Contracts`, `Financial`, `Operations`, `Company`, `Archive` sont des **onglets et des filtres** de la bibliothèque ; `Create Document` et `AI Document Studio` sont des **actions** (feuille modale), pas des pages de menu ; `Settings` vit dans `/settings`.

Cela respecte le cahier des charges — les 12 destinations existent — sans casser la carte mentale du produit.

### Arborescence des écrans

```
/documents                      Overview — le tableau de bord documentaire (§4, §6)
/documents/bibliotheque         Bibliothèque + filtres (§7, §8)
/documents/[id]                 Viewer : aperçu à gauche, informations à droite (§15)
/documents/creer                Blank | Template | AI Generated (§18)
/documents/modeles              Bibliothèque de modèles (§19, §53)
/documents/conformite           Compliance Center + calendrier (§33, §35)
/documents/contrats             Contract Management (§31, §32)
/documents/studio               AI Document Studio (§23) — Elit
/documents/plan-affaires        Wizard 14 étapes (§24) — Elit
/documents/canvas               Business Model Canvas (§25) — Elit
/documents/sop                  SOP Builder (§26) — Kwasans
/documents/marque               Brand Center (§27)
```

### La page d'accueil (§6)

Ordre imposé par le cahier des charges, et il est bon : Health Score → problèmes critiques → expirations proches → récemment modifiés → documents manquants → actions rapides.

Une seule adaptation : **si l'entreprise n'a aucun document, rien de tout cela ne s'affiche.** `FirstRun` prend tout l'écran avec deux boutons — « Importer un document » et « Laisser PilotAI m'aider ». Le §68 le demande, la constitution §10 l'exige.

### Ce que chaque offre voit

| | Esansyel | Kwasans | Elit |
|---|---|---|---|
| Overview | expirations + manquants critiques seulement | + score de santé, approbations en attente | + risque de conformité, exposition contractuelle, insights IA |
| Bibliothèque | oui | + filtres avancés | + multi-entreprises (permission explicite, §77) |
| Création | vierge + modèles de base | + SOP, contrats, financiers | + Studio IA, Business Plan, BMC |
| IA | — | extraction, résumés | génération, analyse de contrat, base de connaissance |

Sur les dashboards existants, trois modules à ajouter dans `lib/dashboardLevel.ts` : `document_alerts` (basic), `document_health` (advanced), `document_intelligence` (executive) — chacun soumis à la triple condition offre + permission + **données réelles**.

### Le contrat de design

Tout écran neuf part de `components/ds`. Pas une ombre, pas un rayon, pas une couleur redéfinie localement. Cartes et tableaux, onglets, filtres en `FilterPill`, panneaux latéraux et `BottomSheet` sur mobile. Cibles ≥ 44 px. Bilingue `t({ fr, ht })` sur **chaque** chaîne — y compris les noms de catégories et de types de documents, qui vivent donc en base avec deux colonnes de libellé.

---

## 10. IMPLEMENTATION PHASES

Les 7 phases du §81, ajustées à ce que le repo contient déjà.

### Phase 0 — Corriger la fondation existante *(nouveau — préalable non négociable)*
Migration de mise à niveau de `documents` : `document_types`, colonnes nouvelles, `storage_bucket` / `storage_path`, `can_read_document()`, remplacement de la politique `FOR ALL`. Bucket `business-documents`. Aucun écran.
**Sans cette phase, tout écran bâti dessus expose des documents confidentiels.**

### Phase 1 — Architecture, stockage, bibliothèque
`document_links`, `document_permissions`, `document_versions`. Permissions RBAC, capacité `documents`. Upload (drag & drop, validation MIME serveur), bibliothèque, filtres, viewer, route de téléchargement signée. Entrée de menu. États vides.

### Phase 2 — Modèles, éditeur, versions, exports
`document_templates`, variables dynamiques `{{company.*}}` / `{{customer.*}}` / `{{employee.*}}` alimentées par les tables existantes. Éditeur par blocs (§20 — pas un traitement de texte). Versions : consulter, comparer, restaurer. Export PDF via le patron `react-to-print`, CSV/ZIP via l'utilitaire extrait de la route de sauvegarde.

### Phase 3 — Expiration, conformité, contrats, notifications
`document_requirements`. Moteur d'expiration branché dans `/api/cron/daily`. Score de santé documentaire (fonction pure). Compliance Center + calendrier. Contrats + alertes. Nouveaux types de notification.

### Phase 4 — PilotAI : classification, OCR, extraction, résumés
`document_ai_jobs`, `document_extractions`, `lib/ai/documentService.ts`. Classification à l'upload avec confirmation sous seuil. OCR via Claude. Recherche plein texte (`tsvector` + `pg_trgm` + `unaccent`). Journal d'audit IA.

### Phase 5 — Générateurs
AI Document Studio, Business Plan Builder (14 étapes), Business Model Canvas, SOP Builder, Brand Center. Mention de vérification professionnelle sur tout document juridique, fiscal ou réglementaire (§23).

### Phase 6 — Intégration dashboards, documents financiers dynamiques, partage
Les 3 modules de tableau de bord. Documents financiers branchés sur `lib/financialReporting.ts` avec instantané verrouillé (§29, §30). `document_shares` : lien signé, expiration, révocation, journal.

### Phase 7 — Base de connaissance
`pgvector`, plongements, récupération filtrée par permissions, citation de la source interne (§72, §73).

**Chaque phase se termine par une migration jouée, un typecheck vert, et une revue de sécurité de ses politiques RLS. Aucune phase ne commence avant que la précédente ne soit validée.**

---

## 11. FILES TO CREATE

Périmètre phases 0 à 4 (au-delà, la liste dépend des arbitrages de phase 2).

**Migrations** (`supabase/migrations/`)
```
20260910_document_center_foundation.sql     types, colonnes, RLS, can_read_document(), bucket
20260911_document_center_relations.sql      document_links, document_permissions, document_versions
20260912_document_templates.sql             document_templates + amorce de contenu
20260913_document_requirements.sql          référentiel pays × industrie + amorce Haïti (sourcée)
20260914_document_ai.sql                    document_ai_jobs, document_extractions, vue masquante
```

**Logique métier** (`lib/`)
```
lib/documents/types.ts                types, catégories, statuts, libellés bilingues
lib/documents/health.ts               score documentaire — fonction pure, testable
lib/documents/storage.ts              chemins, validation MIME serveur, URL signées
lib/documents/variables.ts            résolution de {{company.name}} & co
lib/documents/requirements.ts         documents recommandés / manquants
lib/ai/documentService.ts             l'abstraction IA du §60
```

**Actions serveur** (`app/actions/`)
```
app/actions/documents.ts              CRUD, upload, archivage, recherche
app/actions/documentVersions.ts       versions : lister, comparer, restaurer
app/actions/documentLinks.ts          relations
app/actions/documentTemplates.ts      modèles
app/actions/documentCompliance.ts     conformité, expirations, calendrier
app/actions/documentAI.ts             classification, extraction, résumé
```

**Routes API** (`app/api/`)
```
app/api/documents/upload/route.ts             réception + validation MIME
app/api/documents/[id]/file/route.ts          téléchargement signé
app/api/documents/ai/webhook/route.ts         rappel des jobs longs
```

**Écrans** (`app/documents/`) — un `page.tsx` + un `*Client.tsx` par écran listé au §9.

**Composants** (`components/documents/`)
```
DocumentCard.tsx  DocumentTable.tsx  DocumentFilters.tsx  DocumentViewer.tsx
DocumentUploader.tsx  DocumentStatusBadge.tsx  HealthScoreCard.tsx
ExpiringSoonList.tsx  MissingDocumentsList.tsx  AIExtractionPanel.tsx
ComplianceCalendar.tsx
```

---

## 12. FILES TO MODIFY

| Fichier | Modification | Risque |
|---|---|---|
| `components/nav.tsx` | 1 entrée dans `MORE_SECTIONS` + entrées `ROUTE_FEATURE` | Nul |
| `lib/rbac.ts` | ~10 permissions dans `Permission`, `ALL_PERMISSIONS`, `PERMISSION_CATEGORIES`, `ROLE_PERMISSIONS` | Faible — unions purement additives |
| `lib/planFeatures.ts` | ~12 capacités dans `Feature` + les 3 listes | Faible |
| `lib/activityLog.ts` | `'document'` dans `ActivityEntity` ; `view`, `download`, `share`, `approve`, `ai_analyze`, `ai_generate` dans `ActivityAction` | Faible |
| `lib/notify.ts` | `document_expiring`, `document_expired`, `document_missing`, `document_approval_required` dans `NotifType` + `PREFERENCE_COLUMN` | Faible |
| `lib/dashboardLevel.ts` | 3 modules dans `DashboardModule` + leurs règles | Faible |
| `app/api/cron/daily/route.ts` | Balayage des expirations documentaires | **Moyen** — cette route porte déjà créances + stock + parrainage ; extraire chaque balayage en fonction avant d'en ajouter un |
| `app/settings/…` | Réglages documentaires (analyse IA autorisée, délais de rappel) | Faible |
| `lib/database.types.ts` | Régénérer après migrations | Faible |
| `app/suppliers`, `app/customers`, `app/employes` | Bloc « Documents » sur les fiches (§37) | Faible — additif |
| `package.json` | Ajouter un lanceur de tests (§79) | Faible |

---

## 13. DATABASE MIGRATIONS

### Mode d'application

⚠️ **Ce projet n'a ni `psql` ni point d'entrée SQL programmatique.** Chaque migration est appliquée **à la main**, en copiant le fichier dans le SQL Editor de Supabase, **avant** tout déploiement du code qui en dépend. Une migration non jouée se manifeste par des erreurs silencieuses à l'exécution, pas par un échec de build.

Le repo garde par ailleurs `APPLY_PENDING_MIGRATIONS.sql` comme fichier de rattrapage — il faudra vérifier son état avant de commencer.

### Ordre et réversibilité

Les cinq migrations listées au §11 sont **additives**. Aucune ne supprime de colonne, aucune ne détruit de donnée.

Les deux seuls changements destructifs potentiels :

1. **Suppression du `CHECK` sur `documents.type`.** Réversible. Les 13 valeurs actuelles sont d'abord insérées dans `document_types`, la colonne `document_type_id` est remplie par correspondance, puis la contrainte tombe. `type` reste en place, dépréciée, le temps d'une version.
2. **Remplacement de la politique `documents_access`.** `DROP POLICY` puis quatre `CREATE POLICY`. Le risque n'est pas la perte de données mais la perte d'accès si une politique est mal écrite — donc : jouer sur un projet de test, vérifier avec les requêtes de `supabase/rls_audit_queries.sql`, puis en production.

Toute migration touchant `storage.objects` doit être enveloppée dans `EXCEPTION WHEN insufficient_privilege` avec un `RAISE NOTICE` indiquant la manœuvre à faire depuis le tableau de bord.

### Vérifications après chaque migration

`supabase/rls_audit_queries.sql` et `DIAGNOSTIC_RLS.sql` existent déjà et servent exactement à cela.

---

## 14. TEST STRATEGY

### Le problème d'abord

**Il n'y a aucune infrastructure de test dans ce projet.** Pas de vitest, pas de jest, pas de configuration playwright. `playwright-core` est en dépendance de développement, mais il sert aux scripts de capture d'écran (`pp_shots*.js`), pas à des tests.

Le §79 demande des tests sur douze axes, dont la sécurité. On ne peut pas les écrire sans lanceur.

**Proposition :** ajouter **Vitest** en phase 1 (léger, compatible TypeScript sans configuration lourde, adapté à une machine de développement contrainte). Un `npm run test`. Pas de Playwright pour l'instant : les tests de bout en bout demanderaient un environnement Supabase de test, ce qui est un chantier en soi.

### Ce qui se teste sans base de données (le plus rentable)

Fonctions pures, sur le modèle de `lib/healthScore.ts` :

- `lib/documents/health.ts` — le score et ses cinq facteurs. Entrées connues, sortie attendue. Cas limites : zéro document, tous expirés, aucune exigence pour ce pays.
- `lib/documents/variables.ts` — substitution, variable inconnue, variable vide, tentative d'injection.
- `lib/documents/storage.ts` — assainissement des noms de fichiers, détection MIME par octets d'en-tête, rejet des extensions mensongères.
- `lib/documents/requirements.ts` — calcul des manquants selon pays + industrie.
- `lib/rbac.ts` — les nouvelles permissions par rôle (la fonction est déjà pure).
- Traduction des vocabulaires `orders` / `sales` pour `document_links`.

### Ce qui se teste en SQL

Un fichier `supabase/tests/document_center_rls.sql`, dans l'esprit de `rls_audit_queries.sql`, jouable dans le SQL Editor :

- Entreprise A ne voit pas les documents de l'entreprise B.
- `viewer` ne peut pas supprimer.
- `employee` ne voit pas un document `restricted` où il n'est pas listé.
- `accountant` voit les documents financiers, pas les documents RH.
- `private` n'est visible que du créateur et du propriétaire.
- Un `document_id` connu sans droit d'accès ne renvoie rien (§78).

### Ce qui se vérifie à la main, par liste de contrôle

Upload de chaque format, dépassement de taille, fichier renommé `.pdf` mais qui n'en est pas un, expiration à J-30/15/7/1, restauration de version, refus d'analyse IA sur un document marqué confidentiel, extraction à faible confiance qui ne déclenche rien.

### Garde-fou permanent

`npm run typecheck` doit rester vert à chaque étape. ⚠️ Purger `.next/dev` avant tout build : des types de développement périmés font échouer le typecheck et le build sur du code généré, pas sur le code écrit.

---

## 15. POTENTIAL BREAKING CHANGES

| Changement | Impact | Atténuation |
|---|---|---|
| `DROP CONSTRAINT` sur `documents.type` | Aucune donnée en production (table inutilisée) | Migration en 3 temps : remplir `document_types`, remplir `document_type_id`, retirer la contrainte |
| `documents.url` déprécié | Aucun code ne le lit | Colonne conservée, nullable, retirée dans une version ultérieure |
| Remplacement de `documents_access` | **Perte d'accès si mal écrit** | Tester sur un projet de test, vérifier via `rls_audit_queries.sql` |
| Extension de `ActivityEntity` / `ActivityAction` | Si un `CHECK` existe côté base, les inserts échouent silencieusement (`logActivity` avale toutes ses erreurs) | Vérifier les contraintes de `activity_logs` **avant** ; migration d'élargissement si besoin |
| Extension de `NotifType` | Idem sur `notifications` | Idem |
| Nouvelles permissions dans `ROLE_PERMISSIONS` | Additif ; les rôles personnalisés (`custom_role_permissions`) ne les ont pas | Écrans documentaires masqués pour les rôles personnalisés jusqu'à mise à jour explicite — comportement correct par défaut |
| Nouvelles capacités dans `Feature` | Additif ; `planHasFeature()` renvoie `false` pour l'inconnu | Aucun |
| Balayage d'expiration dans `/api/cron/daily` | Route à `maxDuration = 60` portant déjà 3 traitements. Un quatrième peut la faire dépasser | Extraire chaque balayage en fonction ; si le temps devient limite, créer `/api/cron/documents` et l'ajouter à `vercel.json` |
| Nouvelle entrée de menu | La page `/plus` s'allonge | Aucun — la section « Gestion » a la place |
| Ajout de Vitest | Aucun code de production touché | Aucun |
| `pgvector` (phase 7) | Extension à activer côté Supabase | Hors du chemin critique |
| Volume de stockage | Le projet Supabase actuel est sur un palier gratuit qui se met en veille | Limites de taille par offre ; prévoir la montée de palier avant la mise en production de la phase 1 |

---

## Ce que je recommande de trancher avant de commencer

Trois points sur lesquels je ne veux pas décider seul, parce que la réponse change le travail :

1. **Le §2 demande 12 entrées de menu ; je propose 1 entrée + onglets** (§9 ci-dessus). C'est le seul écart assumé vis-à-vis de la lettre du cahier des charges, et il découle du §67 et de la navigation existante. À valider ou à refuser.

2. **La conformité par pays (§52).** Amorcer le référentiel avec des données pour Haïti demande des sources réglementaires vérifiables. Sans elles, tout est marqué « recommandé » — ce qui est honnête mais moins utile. Avez-vous des sources sur lesquelles vous appuyer, ou faut-il livrer le moteur avec un référentiel minimal ?

3. **Le lanceur de tests.** Le §79 exige des tests ; il n'y a pas d'infrastructure. J'ajoute Vitest en phase 1, ou je documente les vérifications sans les automatiser ?

---

**Rien n'a été implémenté. J'attends votre validation pour engager la Phase 0.**
