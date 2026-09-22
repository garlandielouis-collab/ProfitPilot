-- ══════════════════════════════════════════════════════════════════════════════
-- PAYMENT BRIDGE — le rapprochement des paiements reçus en direct
--
-- ── Pourquoi ce module existe, alors qu'une passerelle existe déjà ──────────
--
-- ProfitPilot sait déjà encaisser MonCash et NatCash : `store_payment_credentials`
-- garde les identifiants API du marchand, les routes `/api/store/payment/...`
-- redirigent l'acheteur chez l'opérateur, et le rappel vérifie la transaction
-- avant de régler la commande (20260710, 20260904, 20260906).
--
-- Cette voie demande un contrat MonCash Business. Un commerçant de Delmas qui
-- vend des savons n'en a pas et n'en aura pas : il a un numéro, et ses clients
-- lui envoient l'argent dessus. Aujourd'hui, ProfitPilot ne voit rien de cet
-- argent — la commande reste `unpaid`, aucune vente n'est créée, le stock ne
-- bouge pas, et le marchand tient le compte sur un cahier à côté.
--
-- Payment Bridge est la seconde voie : même moyen de paiement, sans API.
--
--   L'acheteur transfère vers le NUMÉRO du marchand, directement.
--   ProfitPilot dit combien, à qui, et sous quelle référence.
--   ProfitPilot rapproche ce qui arrive avec ce qui est dû.
--   Le marchand tranche quand le rapprochement n'est pas certain.
--
-- ── Ce que Payment Bridge n'est PAS ────────────────────────────────────────
--
-- Il ne détient aucun fonds. Il n'y a ni portefeuille, ni solde, ni retrait,
-- ni séquestre. L'argent va du client au marchand sans passer par nous, et
-- aucune table ci-dessous ne porte de solde. Ce qu'elles portent, ce sont des
-- CONSTATS : voici ce qui est dû, voici ce qui a été signalé, voici ce que nous
-- avons détecté, voici ce que le marchand a confirmé.
--
-- ── Ce qui est réutilisé, et donc pas recréé ────────────────────────────────
--
--   `orders`, `order_items`            — le tunnel de commande existant
--   `sales`, `sale_items`              — la facture du marchand, et son reste dû
--   `confirm_store_order(UUID)`        — LA transaction qui règle une commande :
--                                        vente, lignes, stock, mouvements. Elle
--                                        est appelée, jamais réécrite.
--   `customers`, `businesses`          — le client et le commerce
--   `activity_logs`, `notifications`   — la trace et la cloche
--   `is_business_member`, `fn_has_role` — les gardes RLS de la maison
--   `payment_transactions`             — les tentatives de passerelle. Laissée
--                                        intacte : elle décrit un aller-retour
--                                        API, pas un virement constaté.
--
-- ── Les sept tables, et ce que chacune répond ──────────────────────────────
--
--   merchant_payment_methods  « Sur quel numéro ce commerce encaisse-t-il ? »
--   payment_intents           « Combien est dû, pour quoi, et sous quelle réf ? »
--   payment_sessions          « Quelle tentative de paiement, ouverte quand ? »
--   payment_evidence          « Qu'est-ce que le client DÉCLARE avoir fait ? »
--   payment_receipts          « Quel encaissement avons-nous CONSTATÉ ? »
--   merchant_devices          « Quel téléphone a le droit de nous le dire ? »
--   payment_events            « Qui a fait quoi, quand, et dans quel ordre ? »
--
-- La distinction `payment_evidence` / `payment_receipts` est le cœur du modèle.
-- Une déclaration du client est une INTENTION DE PREUVE : elle ouvre un examen,
-- elle ne règle rien. Un reçu est un CONSTAT : il vient d'un téléphone enrôlé,
-- d'une API opérateur, ou du marchand qui a regardé son solde. Les confondre,
-- c'est laisser une capture d'écran payer une commande.
--
-- ── Les statuts : deux machines, pas une ───────────────────────────────────
--
-- Le cahier des charges donnait une seule liste plate mêlant AWAITING_PAYMENT,
-- AMOUNT_MISMATCH et DUPLICATE_PAYMENT. Ces trois-là ne parlent pas du même
-- objet : le premier décrit où en est la DETTE, les deux autres décrivent ce
-- qu'on a fait d'un ENCAISSEMENT. Une dette de 4 500 G couverte par un
-- versement de 4 000 G n'est pas « en anomalie de montant » : elle est
-- partiellement payée, et c'est le versement qui est en anomalie.
--
-- Fondues en une seule colonne, ces deux histoires deviennent inexprimables dès
-- qu'une dette reçoit deux versements. D'où deux colonnes :
--
--   payment_intents.status        où en est la dette
--   payment_receipts.match_status ce qu'on a fait de l'encaissement
--
-- Tous les cas demandés restent exprimés — voir la table de correspondance au
-- §2 et au §5 ci-dessous.
--
-- ── La règle des quinze minutes, et ce qu'elle ne fait pas ─────────────────
--
-- Une session dure quinze minutes. Passé ce délai, la session expire : les
-- instructions affichées ne sont plus tenues pour actuelles, et une nouvelle
-- session peut être ouverte sur la MÊME dette.
--
-- Une session expirée n'invalide PAS un virement réellement effectué. Un client
-- qui paie à 14 h 22 une session ouverte de 14 h 00 à 14 h 15 a payé. Son reçu
-- arrive avec `match_status = 'late'`, passe en examen, et le marchand peut le
-- confirmer. Rejeter cet argent automatiquement serait perdre une vente pour
-- une horloge.
--
-- C'est pour cela que l'expiration vit sur la session et non sur la dette : une
-- dette n'expire pas parce qu'on a mis trop longtemps à la payer.
--
-- ── Idempotente. Rejouable. ────────────────────────────────────────────────
--
-- `CREATE TABLE IF NOT EXISTS`, `CREATE OR REPLACE FUNCTION`, `DROP POLICY IF
-- EXISTS` avant chaque `CREATE POLICY`, `ADD COLUMN IF NOT EXISTS`. Aucun DROP
-- de table, aucune suppression de données, aucune colonne existante modifiée.
--
-- Aucun type ENUM n'est créé : 20260910_member_role_reconciliation.sql a montré
-- qu'une valeur d'énum ajoutée ne s'utilise pas dans la transaction qui l'ajoute.
-- Les statuts sont donc du TEXT sous CHECK, comme `orders.status`.
--
-- À COLLER DANS LE SQL EDITOR — il n'y a ni `supabase db push`, ni psql depuis
-- le poste de dev (supabase/migrations/A_APPLIQUER.md).
-- ══════════════════════════════════════════════════════════════════════════════

BEGIN;


-- ═══════════════════════════════════════════════════════════════════════════
-- 0. LES OUTILS PARTAGÉS
-- ═══════════════════════════════════════════════════════════════════════════

-- `fn_set_updated_at` existe depuis 20260702_online_store.sql et est recréée à
-- l'identique par 20260904. Reprise ici pour que ce fichier se joue seul sur
-- une base neuve.
CREATE OR REPLACE FUNCTION fn_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


-- ─── La référence de paiement ────────────────────────────────────────────────
--
-- `PP-7K9M2Q`. Elle sert à UNE chose : permettre au marchand, en regardant son
-- relevé MonCash ou le message que le client lui a envoyé, de savoir quelle
-- commande cet argent règle.
--
-- Elle n'est PAS une preuve. Elle n'est PAS un secret. Elle ne protège aucune
-- page : la page de paiement publique est adressée par l'identifiant UUID de la
-- dette, exactement comme la page de confirmation l'est par celui de la commande
-- (app/store/[slug]/confirmation/page.tsx — les numéros de commande étant
-- séquentiels, il suffisait de décrémenter pour lire les commandes des autres).
-- 31^6 ≈ 887 millions : assez pour ne pas collisionner sur un commerce, très
-- loin d'être assez pour porter un secret.
--
-- L'alphabet exclut `0 O 1 I L` : cette référence est lue à voix haute au
-- téléphone, recopiée dans le champ « motif » d'un transfert, et parfois dictée
-- à un vendeur. Un `0` pris pour un `O` fait échouer le rapprochement.
CREATE OR REPLACE FUNCTION public.pp_payment_reference()
RETURNS TEXT
LANGUAGE plpgsql
VOLATILE
SET search_path = public
AS $$
DECLARE
  v_alphabet CONSTANT TEXT := '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
  v_out TEXT := '';
  i     INT;
BEGIN
  FOR i IN 1..6 LOOP
    v_out := v_out || substr(v_alphabet, 1 + floor(random() * length(v_alphabet))::INT, 1);
  END LOOP;
  RETURN 'PP-' || v_out;
END;
$$;

COMMENT ON FUNCTION public.pp_payment_reference() IS
  'Référence de rapprochement PP-XXXXXX. Alphabet sans 0/O/1/I/L : elle est dictée au téléphone. Ce n''est ni une preuve, ni un secret d''URL.';


-- ═══════════════════════════════════════════════════════════════════════════
-- 1. MERCHANT_PAYMENT_METHODS — sur quel numéro ce commerce encaisse
--
-- Le cahier des charges proposait `merchant_phone_moncash` et
-- `merchant_phone_natcash`. Deux colonnes, deux opérateurs, et un troisième
-- moyen de paiement demande une migration. Pire : un marchand qui a deux
-- numéros MonCash — celui de la boutique et celui du gérant — ne peut pas les
-- déclarer tous les deux.
--
-- Une ligne par destination, donc. `method` dit la nature, `provider`
-- l'opérateur, `destination` l'adresse quelle qu'elle soit (un numéro
-- aujourd'hui, un IBAN ou un identifiant marchand demain).
--
-- `merchant_payment_profiles` n'existe pas : ce serait une table
-- entreprise↔entreprise, un JOIN de plus pour zéro information. `businesses`
-- EST le profil du marchand (§45 — ne pas créer de doublon).
--
-- Ce qui est proposé à l'ACHETEUR reste décidé par `store_settings.
-- payment_methods` : cette table dit où l'argent va, pas ce que la vitrine
-- affiche. Les deux doivent être d'accord, et `offeredPayments()` continue de
-- filtrer côté vitrine.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS merchant_payment_methods (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id   UUID        NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,

  -- La nature du moyen. `moncash`/`natcash` sont les seuls que le rapprochement
  -- sait traiter aujourd'hui ; les autres sont acceptés en base pour que le
  -- marchand puisse les déclarer, et affichés comme instructions sans
  -- rapprochement automatique.
  method        TEXT        NOT NULL
                            CHECK (method IN ('moncash','natcash','cash','cod',
                                              'bank_transfer','card','other')),
  -- L'opérateur, quand il se distingue de la nature : `digicel` pour MonCash,
  -- `natcom` pour NatCash, le nom de la banque pour un virement.
  provider      TEXT,

  -- L'adresse où l'argent arrive. Un numéro au format international pour le
  -- mobile. NULL pour `cash`/`cod` : payer en main propre n'a pas d'adresse.
  destination   TEXT,
  -- Ce que l'acheteur lit, quand le marchand veut préciser (« Numéro de la
  -- boutique », « Compte Sogebank — succursale Pétion-Ville »).
  display_label TEXT,
  -- Les mots du marchand, ajoutés sous les instructions standard.
  instructions  TEXT,

  is_enabled    BOOLEAN     NOT NULL DEFAULT TRUE,
  is_default    BOOLEAN     NOT NULL DEFAULT FALSE,

  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Désactivé plutôt que supprimé : des dettes passées désignent cette ligne,
  -- et « payé sur quel numéro ? » doit rester répondable des années après.
  deleted_at    TIMESTAMPTZ,

  -- Une destination mobile est obligatoire : sans numéro, la page de paiement
  -- afficherait « Payez à : (vide) ». C'est le §28 — jamais de numéro codé en
  -- dur, donc jamais de moyen mobile sans numéro.
  CONSTRAINT mpm_mobile_needs_destination
    CHECK (method NOT IN ('moncash','natcash') OR destination IS NOT NULL)
);

-- Un même numéro déclaré deux fois pour le même moyen est une erreur de saisie,
-- pas une seconde destination. Les lignes désactivées sortent de la contrainte :
-- un marchand qui retire un numéro puis le remet doit pouvoir le remettre.
CREATE UNIQUE INDEX IF NOT EXISTS idx_mpm_unique_destination
  ON merchant_payment_methods (business_id, method, destination)
  WHERE deleted_at IS NULL AND destination IS NOT NULL;

-- Un seul défaut par commerce. Porté par la base et non par le code : deux
-- onglets ouverts sur l'écran des réglages suffisaient à en écrire deux.
CREATE UNIQUE INDEX IF NOT EXISTS idx_mpm_single_default
  ON merchant_payment_methods (business_id)
  WHERE is_default AND is_enabled AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_mpm_business_enabled
  ON merchant_payment_methods (business_id, method)
  WHERE is_enabled AND deleted_at IS NULL;

DROP TRIGGER IF EXISTS trg_mpm_updated_at ON merchant_payment_methods;
CREATE TRIGGER trg_mpm_updated_at BEFORE UPDATE ON merchant_payment_methods
  FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

COMMENT ON TABLE merchant_payment_methods IS
  'Les destinations où un commerce encaisse en direct. Une ligne par numéro/compte. Lue par la page de paiement publique via la clé service : jamais exposée telle quelle.';


-- ═══════════════════════════════════════════════════════════════════════════
-- 2. PAYMENT_INTENTS — ce qui est dû
--
-- « Cette somme est due pour cette commande. » Rien de plus.
--
-- ── Le montant n'est jamais celui du navigateur ────────────────────────────
--
-- `amount` est recopié de `orders.total` ou de `sales.balance_due`, côté
-- serveur, après création. Le front n'envoie qu'un identifiant de commande.
-- C'est la même leçon que `create_store_order` a déjà apprise : la version
-- précédente du tunnel acceptait `unit_price` depuis le client.
--
-- ── Deux montants, parce que MonCash n'encaisse que des gourdes ────────────
--
-- `amount`/`currency` : ce qui est dû, dans la devise de la commande.
-- `charge_amount`/`charge_currency` : ce que l'acheteur doit réellement
-- transférer. Pour MonCash et NatCash, c'est toujours des gourdes.
--
-- Une vitrine en USD facturait 25 GOURDES une commande de 25 dollars, et le
-- rappel l'acceptait (corrigé pour la passerelle par `htgChargeFor`,
-- lib/storePaymentGateway.ts). Le même piège est ici, en pire : le
-- rapprochement compare le montant du SMS au montant attendu. Sans conversion
-- figée, un versement de 3 250 G pour une dette de 25 $ serait une anomalie.
--
-- `exchange_rate` est FIGÉ à la création. Le marchand peut changer son taux
-- pendant que le client paie ; ce qui a été demandé ne change pas.
--
-- ── Ce qui est reçu, cumulé ────────────────────────────────────────────────
--
-- `amount_received` est la somme des reçus rapprochés à cette dette. Il permet
-- le paiement en deux fois sans inventer une seconde dette, et il porte l'état
-- `partially_paid`.
--
-- ── Les statuts ────────────────────────────────────────────────────────────
--
--   created           la dette existe, aucune instruction encore affichée
--   awaiting_payment   une session est ouverte, le client voit les instructions
--   customer_reported  le client a dit « j'ai payé » — rien n'est réglé
--   under_review       il faut un humain : ambigu, en retard, montant différent
--   partially_paid     une partie est couverte, le reste est dû
--   confirmed          réglé. Terminal.
--   rejected           refusé après examen. Terminal.
--   disputed           le client conteste le refus
--   expired            abandonnée, aucun versement constaté. Terminal.
--   cancelled          annulée par le marchand ou avec la commande. Terminal.
--
-- Correspondance avec la liste du cahier des charges : AMOUNT_MISMATCH,
-- DUPLICATE_PAYMENT, LATE_PAYMENT_REPORTED et UNMATCHED_PAYMENT décrivent un
-- ENCAISSEMENT et vivent donc dans `payment_receipts.match_status` (§5). Une
-- dette qui en hérite passe `under_review` ou `partially_paid`.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS payment_intents (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id   UUID        NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,

  -- ── Ce que cette dette règle ────────────────────────────────────────────
  --
  -- Le paiement d'une commande client et le paiement de l'abonnement
  -- ProfitPilot ne se mélangent pas : ils n'ont ni le même créancier, ni le
  -- même destinataire, ni la même boîte de réception (§22).
  kind          TEXT        NOT NULL DEFAULT 'merchant_payment'
                            CHECK (kind IN ('merchant_payment','platform_subscription')),

  -- Une dette vise une commande boutique, OU une facture/vente existante
  -- (une créance qu'on encaisse enfin), OU un abonnement. Jamais deux.
  order_id      UUID        REFERENCES orders(id)    ON DELETE CASCADE,
  sale_id       UUID        REFERENCES sales(id)     ON DELETE CASCADE,
  subscription_id UUID,   -- FK posée plus bas si la table existe
  customer_id   UUID        REFERENCES customers(id) ON DELETE SET NULL,

  -- Le reste dû après un versement partiel : une dette complémentaire, RATTACHÉE
  -- à celle d'origine (§15). Sans ce lien, un client aurait deux dettes sans
  -- rapport pour une seule commande, et le marchand ne saurait pas laquelle
  -- solde laquelle.
  parent_intent_id UUID     REFERENCES payment_intents(id) ON DELETE CASCADE,

  -- ── Les montants ────────────────────────────────────────────────────────
  amount          NUMERIC(14,2) NOT NULL CHECK (amount > 0),
  currency        TEXT          NOT NULL DEFAULT 'HTG' CHECK (currency IN ('HTG','USD')),
  charge_amount   NUMERIC(14,2) NOT NULL CHECK (charge_amount > 0),
  charge_currency TEXT          NOT NULL DEFAULT 'HTG' CHECK (charge_currency IN ('HTG','USD')),
  -- 1 USD = X HTG, figé. NULL quand la dette est déjà en gourdes.
  exchange_rate   NUMERIC(10,6),
  amount_received NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (amount_received >= 0),

  -- ── Comment, et vers où ─────────────────────────────────────────────────
  method        TEXT        NOT NULL
                            CHECK (method IN ('moncash','natcash','cash','cod',
                                              'bank_transfer','card','other')),
  provider      TEXT,
  -- La destination telle qu'elle était au moment de la dette. RESTRICT et non
  -- CASCADE : on ne supprime pas un numéro qui a servi à encaisser.
  destination_method_id UUID REFERENCES merchant_payment_methods(id) ON DELETE RESTRICT,
  -- Le numéro RECOPIÉ, pas seulement pointé. Le marchand peut corriger sa fiche
  -- après coup ; la question « sur quel numéro ce client a-t-il payé ? » doit
  -- garder la réponse d'alors.
  destination_snapshot TEXT,

  -- Tirée par la base, pas par l'application. Deux raisons : l'alphabet n'existe
  -- qu'à un seul endroit (`pp_payment_reference`), et une collision se règle en
  -- rejouant l'INSERT sans que l'appelant ait à savoir comment fabriquer une
  -- référence. Voir lib/paymentBridge/intents.ts, qui compte sur ce défaut.
  reference     TEXT        NOT NULL DEFAULT pp_payment_reference(),

  status        TEXT        NOT NULL DEFAULT 'created'
                            CHECK (status IN ('created','awaiting_payment','customer_reported',
                                              'under_review','partially_paid','confirmed',
                                              'rejected','disputed','expired','cancelled')),

  confirmed_at  TIMESTAMPTZ,
  -- NULL avec `confirmed_at` renseigné = confirmée par le rapprochement
  -- automatique. Un humain laisse son identifiant.
  confirmed_by  UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  -- Comment la confirmation est arrivée : c'est la question que le marchand
  -- posera six mois plus tard devant un litige.
  confirmed_via TEXT        CHECK (confirmed_via IN ('auto_match','merchant','provider_api','admin')),
  closed_reason TEXT,

  metadata      JSONB       NOT NULL DEFAULT '{}'::jsonb,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Une dette règle une chose. Deux cibles renseignées, et « cette commande
  -- est-elle payée ? » a deux réponses possibles.
  CONSTRAINT pi_one_target CHECK (
    (CASE WHEN order_id        IS NOT NULL THEN 1 ELSE 0 END
   + CASE WHEN sale_id         IS NOT NULL THEN 1 ELSE 0 END
   + CASE WHEN subscription_id IS NOT NULL THEN 1 ELSE 0 END) = 1
  ),
  -- Un abonnement est un paiement de plateforme, et réciproquement.
  CONSTRAINT pi_kind_matches_target CHECK (
    (kind = 'platform_subscription') = (subscription_id IS NOT NULL)
  ),
  -- Une dette en USD sans taux ne sait pas combien de gourdes demander.
  CONSTRAINT pi_usd_needs_rate CHECK (
    currency = charge_currency OR (exchange_rate IS NOT NULL AND exchange_rate > 1)
  ),
  -- Confirmée veut dire : on sait quand, et par quelle voie.
  CONSTRAINT pi_confirmed_is_traced CHECK (
    status <> 'confirmed' OR (confirmed_at IS NOT NULL AND confirmed_via IS NOT NULL)
  )
);

-- La référence sert à retrouver la dette depuis un relevé. Unique par commerce :
-- deux marchands peuvent porter `PP-7K9M2Q` sans se gêner, personne ne compare
-- leurs relevés. Unique globalement aurait multiplié les collisions par le
-- nombre de commerces pour aucun gain.
CREATE UNIQUE INDEX IF NOT EXISTS idx_pi_reference
  ON payment_intents (business_id, reference);

-- L'index du rapprochement. C'est la requête chaude : « quelles dettes ouvertes
-- de ce commerce, par ce moyen, attendent à peu près ce montant ? »
CREATE INDEX IF NOT EXISTS idx_pi_open_match
  ON payment_intents (business_id, method, status, charge_amount)
  WHERE status IN ('created','awaiting_payment','customer_reported',
                   'under_review','partially_paid');

CREATE INDEX IF NOT EXISTS idx_pi_order    ON payment_intents (order_id) WHERE order_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_pi_sale     ON payment_intents (sale_id)  WHERE sale_id  IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_pi_customer ON payment_intents (customer_id) WHERE customer_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_pi_parent   ON payment_intents (parent_intent_id) WHERE parent_intent_id IS NOT NULL;
-- La boîte de réception du marchand, triée par arrivée.
CREATE INDEX IF NOT EXISTS idx_pi_business_created
  ON payment_intents (business_id, created_at DESC);

DROP TRIGGER IF EXISTS trg_pi_updated_at ON payment_intents;
CREATE TRIGGER trg_pi_updated_at BEFORE UPDATE ON payment_intents
  FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

-- La clé étrangère vers `subscriptions` n'est posée que si la table est là :
-- 001_payment_tables.sql n'a pas forcément été jouée sur toutes les bases, et
-- une FK manquante ne doit pas faire échouer tout le module.
DO $$
BEGIN
  IF to_regclass('public.subscriptions') IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payment_intents_subscription_id_fkey')
  THEN
    ALTER TABLE payment_intents
      ADD CONSTRAINT payment_intents_subscription_id_fkey
      FOREIGN KEY (subscription_id) REFERENCES subscriptions(id) ON DELETE CASCADE;
  END IF;
END $$;

COMMENT ON TABLE payment_intents IS
  'Ce qui est dû, pour quoi, et sous quelle référence. Le montant est recopié côté serveur depuis la commande : jamais reçu du navigateur.';
COMMENT ON COLUMN payment_intents.charge_amount IS
  'Ce que l''acheteur doit réellement transférer. En gourdes pour MonCash/NatCash, qui n''encaissent rien d''autre. Figé avec son taux.';
COMMENT ON COLUMN payment_intents.amount_received IS
  'Somme des reçus rapprochés. Permet le paiement en deux fois sans créer deux dettes pour une commande.';


-- ═══════════════════════════════════════════════════════════════════════════
-- 3. PAYMENT_SESSIONS — une tentative de paiement
--
-- Pourquoi séparer la tentative de la dette : sinon, un client qui laisse
-- expirer son écran et recommence crée une SECONDE DETTE pour la même commande.
-- Le marchand voit alors deux fois 4 500 G à encaisser, et le rapprochement a
-- deux candidates identiques pour un seul versement — l'ambiguïté qu'on essaie
-- justement d'éviter (§12).
--
-- Une dette, donc, et autant de sessions que nécessaire.
--
-- L'expiration vit ICI. Elle ferme un écran, pas une dette. Voir l'en-tête du
-- fichier : un virement effectué à 14 h 22 pour une session close à 14 h 15
-- reste un virement.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS payment_sessions (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id  UUID        NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  intent_id    UUID        NOT NULL REFERENCES payment_intents(id) ON DELETE CASCADE,

  status       TEXT        NOT NULL DEFAULT 'open'
                           CHECK (status IN ('open','expired','completed','abandoned')),
  started_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at   TIMESTAMPTZ NOT NULL,
  closed_at    TIMESTAMPTZ,

  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT ps_expires_after_start CHECK (expires_at > started_at),
  CONSTRAINT ps_closed_when_not_open CHECK (status = 'open' OR closed_at IS NOT NULL)
);

-- Une seule session ouverte par dette. Deux écrans ouverts sur la même commande
-- affichaient deux comptes à rebours et deux instructions concurrentes.
CREATE UNIQUE INDEX IF NOT EXISTS idx_ps_one_open
  ON payment_sessions (intent_id) WHERE status = 'open';

CREATE INDEX IF NOT EXISTS idx_ps_intent ON payment_sessions (intent_id, started_at DESC);
-- Le balayage du cron : les sessions ouvertes dont l'heure est passée.
CREATE INDEX IF NOT EXISTS idx_ps_expiring
  ON payment_sessions (expires_at) WHERE status = 'open';

DROP TRIGGER IF EXISTS trg_ps_updated_at ON payment_sessions;
CREATE TRIGGER trg_ps_updated_at BEFORE UPDATE ON payment_sessions
  FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

COMMENT ON TABLE payment_sessions IS
  'Une tentative de paiement sur une dette. Plusieurs par dette. Son expiration ferme un écran, jamais une dette : un virement tardif reste un virement.';


-- ═══════════════════════════════════════════════════════════════════════════
-- 4. PAYMENT_EVIDENCE — ce que le client DÉCLARE
--
-- Le bouton « J'ai effectué le paiement ». C'est une déclaration, et le nom de
-- la table doit le dire : `evidence`, pas `proof`.
--
-- Ce qu'elle produit : `payment_intents.status = 'customer_reported'`, une ligne
-- dans le journal, une notification au marchand. Ce qu'elle ne produit PAS : un
-- règlement, une vente, un mouvement de stock. Une capture d'écran se fabrique
-- en deux minutes.
--
-- ── Ce qui n'est pas là, et pourquoi ───────────────────────────────────────
--
-- `file_path` existe mais aucun dépôt de fichier anonyme n'est ouvert dans ce
-- lot. Une route publique qui accepte des fichiers sans session est un dépôt
-- gratuit pour n'importe qui sur Internet, et §47 demande de MINIMISER la
-- collecte. La colonne attend le jour où le marchand attachera lui-même une
-- pièce depuis le centre documentaire, où l'authentification existe déjà.
--
-- Ce que le client déclare est préfixé `declared_` sans exception. Une colonne
-- nommée `amount` sur cette table finirait, un jour, comparée à un montant dû
-- par quelqu'un qui aurait oublié d'où elle vient.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS payment_evidence (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id  UUID        NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  intent_id    UUID        NOT NULL REFERENCES payment_intents(id) ON DELETE CASCADE,
  session_id   UUID        REFERENCES payment_sessions(id) ON DELETE SET NULL,

  -- Qui déclare. Un client anonyme n'a pas d'identifiant utilisateur.
  source       TEXT        NOT NULL DEFAULT 'customer'
                           CHECK (source IN ('customer','merchant')),
  declared_by  UUID        REFERENCES auth.users(id) ON DELETE SET NULL,

  declared_amount    NUMERIC(14,2) CHECK (declared_amount IS NULL OR declared_amount > 0),
  declared_currency  TEXT          CHECK (declared_currency IS NULL OR declared_currency IN ('HTG','USD')),
  -- L'identifiant de transaction que le client recopie de son SMS. Sa présence
  -- rend le rapprochement bien plus sûr — mais il est SAISI À LA MAIN, donc
  -- faillible et falsifiable. Il aide, il ne prouve pas.
  declared_reference TEXT,
  declared_sender    TEXT,
  declared_paid_at   TIMESTAMPTZ,
  comment            TEXT,

  -- Prévu, non alimenté dans ce lot. Voir l'en-tête de section.
  file_path    TEXT,

  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pe_intent ON payment_evidence (intent_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pe_business ON payment_evidence (business_id, created_at DESC);

COMMENT ON TABLE payment_evidence IS
  'Ce que le client DÉCLARE avoir fait. Ouvre un examen ; ne règle rien. Tous les champs déclarés sont préfixés declared_ pour qu''on ne les confonde jamais avec un constat.';


-- ═══════════════════════════════════════════════════════════════════════════
-- 5. PAYMENT_RECEIPTS — ce qui a été CONSTATÉ
--
-- Un encaissement dont nous avons un signal. Quatre sources possibles
-- aujourd'hui, une cinquième prévue :
--
--   sms_companion         un téléphone enrôlé a lu et analysé un SMS opérateur
--   manual_entry          le marchand saisit ce qu'il voit sur son relevé
--   merchant_confirmation le marchand affirme avoir reçu, sans plus de détail
--   provider_api          l'API de l'opérateur (la passerelle existante)
--   provider_webhook      prévu, si un opérateur en propose un jour
--
-- ── Le contenu des SMS n'est pas stocké ────────────────────────────────────
--
-- Il n'y a aucune colonne pour le texte du message. Ce n'était pas un oubli :
-- un SMS MonCash porte le solde du marchand, parfois d'autres transactions, et
-- des noms de personnes. Le téléphone analyse EN LOCAL et n'envoie que les
-- champs normalisés. `raw_reference` garde la chaîne de référence telle que
-- l'opérateur l'a écrite — pas la phrase autour.
--
-- La colonne absente est la seule protection qui ne peut pas être contournée
-- par un défaut de politique RLS, un journal trop bavard ou un export.
--
-- ── L'idempotence ──────────────────────────────────────────────────────────
--
-- Le même SMS peut arriver vingt fois : le téléphone réessaie sans réseau, la
-- synchronisation rejoue son historique, l'utilisateur réinstalle. Le même
-- encaissement ne doit jamais régler deux commandes.
--
-- `dedupe_key` est calculée par le serveur, jamais reçue. Elle est unique par
-- commerce, et c'est la contrainte de base — pas une vérification en code — qui
-- tient la promesse : deux requêtes simultanées passent le `SELECT` toutes les
-- deux, et seule l'une des deux passe l'`INSERT` (§42).
--
-- La stratégie de repli, quand l'opérateur ne donne pas de référence, vit dans
-- lib/paymentBridge/dedupe.ts — une fonction pure, donc testée.
--
-- ── match_status : ce qu'on a fait de cet encaissement ─────────────────────
--
--   pending           reçu, pas encore examiné
--   auto_matched      rapproché et confirmé sans intervention
--   manually_matched  rapproché par le marchand
--   amount_mismatch   moins que dû — le reste fait une dette complémentaire
--   overpayment       plus que dû — au marchand de décider
--   duplicate         cette dette était déjà couverte
--   late              arrivé après l'expiration de la session
--   ambiguous         plusieurs dettes pouvaient correspondre
--   unmatched         aucune dette ne correspond
--   rejected          écarté après examen
--   resolved          anomalie tranchée par le marchand
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS payment_receipts (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id  UUID        NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  -- La dette à laquelle il a été rattaché. NULL = paiement non rapproché : il
  -- existe, il est arrivé, et aucune commande ne l'explique (§17).
  intent_id    UUID        REFERENCES payment_intents(id) ON DELETE SET NULL,

  provider     TEXT        NOT NULL
                           CHECK (provider IN ('moncash','natcash','cash','bank','other')),
  source       TEXT        NOT NULL
                           CHECK (source IN ('sms_companion','manual_entry',
                                             'merchant_confirmation','provider_api',
                                             'provider_webhook')),

  -- L'identifiant de transaction de l'opérateur, normalisé (majuscules, sans
  -- espaces) pour que le rapprochement ne rate pas sur une casse.
  transaction_reference TEXT,
  -- La même, telle que l'opérateur l'a écrite.
  raw_reference         TEXT,

  amount       NUMERIC(14,2) NOT NULL CHECK (amount > 0),
  currency     TEXT          NOT NULL DEFAULT 'HTG' CHECK (currency IN ('HTG','USD')),
  -- Le numéro de l'expéditeur, quand l'opérateur le donne. Donnée personnelle :
  -- masquée à l'affichage, jamais journalisée.
  sender_identifier TEXT,

  -- Quand l'argent est arrivé, selon l'opérateur.
  received_at  TIMESTAMPTZ NOT NULL,
  -- Quand NOUS l'avons su. L'écart entre les deux mesure le retard du
  -- compagnon, et explique un rapprochement tardif.
  detected_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- La clé étrangère vers `merchant_devices` est posée au §6, après la création
  -- de cette table : l'ordre de lecture du fichier suit le flux de l'argent, pas
  -- l'ordre des dépendances. Déclarée ici, elle échouerait à la première pose.
  device_id    UUID,
  -- La version de l'analyseur qui a produit ces champs. Les formats de SMS
  -- changent sans préavis : sans elle, on ne peut pas savoir quels reçus
  -- relire après avoir corrigé un analyseur.
  parser_version TEXT,

  match_status TEXT        NOT NULL DEFAULT 'pending'
                           CHECK (match_status IN ('pending','auto_matched','manually_matched',
                                                   'amount_mismatch','overpayment','duplicate',
                                                   'late','ambiguous','unmatched','rejected',
                                                   'resolved')),
  -- Déterministe, pas un score appris. Voir lib/paymentBridge/matching.ts.
  confidence   TEXT        CHECK (confidence IS NULL OR
                                  confidence IN ('exact','high','medium','low','none')),

  -- ── Ce que le marchand a décidé d'un trop-perçu ou d'un doublon ─────────
  --
  -- ProfitPilot ne rembourse pas, ne crédite pas, ne décide pas : il enregistre
  -- ce que le marchand a choisi (§14, §16).
  resolution      TEXT     CHECK (resolution IS NULL OR
                                  resolution IN ('credit_next_invoice','customer_credit',
                                                 'refunded_manually','resolved_manually',
                                                 'ignored')),
  resolution_note TEXT,
  resolved_by     UUID     REFERENCES auth.users(id) ON DELETE SET NULL,
  resolved_at     TIMESTAMPTZ,

  -- Ce que cet encaissement a déjà apporté à une dette. NULL = jamais imputé.
  --
  -- Sans cette colonne, rien n'empêchait d'imputer DEUX FOIS le même reçu à la
  -- même dette : `pp_confirm_payment_intent` refusait un reçu rattaché à une
  -- AUTRE dette, pas un reçu déjà compté sur celle-ci. Un versement de 4 000 G
  -- sur 4 500 dus, confirmé deux fois par deux écrans, faisait 8 000 reçus.
  applied_amount NUMERIC(14,2) CHECK (applied_amount IS NULL OR applied_amount > 0),

  -- Clé de déduplication, calculée côté serveur. Voir l'en-tête de section.
  dedupe_key   TEXT        NOT NULL,

  metadata     JSONB       NOT NULL DEFAULT '{}'::jsonb,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Pour une base où une version antérieure de ce fichier aurait déjà été jouée.
ALTER TABLE payment_receipts ADD COLUMN IF NOT EXISTS applied_amount NUMERIC(14,2);

-- L'idempotence, tenue par la base. C'est la ligne la plus importante du
-- fichier : elle transforme « envoyé vingt fois » en « enregistré une fois ».
CREATE UNIQUE INDEX IF NOT EXISTS idx_pr_dedupe
  ON payment_receipts (business_id, dedupe_key);

-- Une transaction opérateur ne règle qu'une chose. Même garde que
-- `payment_transactions` (20260906) : l'identifiant de l'opérateur est unique
-- chez lui, il doit l'être chez nous.
CREATE UNIQUE INDEX IF NOT EXISTS idx_pr_provider_transaction
  ON payment_receipts (provider, transaction_reference)
  WHERE transaction_reference IS NOT NULL;

-- La file « à vérifier » du marchand.
CREATE INDEX IF NOT EXISTS idx_pr_business_status
  ON payment_receipts (business_id, match_status, received_at DESC);
CREATE INDEX IF NOT EXISTS idx_pr_intent ON payment_receipts (intent_id) WHERE intent_id IS NOT NULL;
-- Le rapprochement cherche par montant et par fenêtre de temps.
CREATE INDEX IF NOT EXISTS idx_pr_match_lookup
  ON payment_receipts (business_id, provider, amount, received_at DESC);
CREATE INDEX IF NOT EXISTS idx_pr_device ON payment_receipts (device_id) WHERE device_id IS NOT NULL;

DROP TRIGGER IF EXISTS trg_pr_updated_at ON payment_receipts;
CREATE TRIGGER trg_pr_updated_at BEFORE UPDATE ON payment_receipts
  FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

COMMENT ON TABLE payment_receipts IS
  'Un encaissement CONSTATÉ. Aucune colonne ne porte le texte d''un SMS : le téléphone analyse en local et n''envoie que les champs normalisés. dedupe_key est calculée par le serveur et unique par commerce.';
COMMENT ON COLUMN payment_receipts.dedupe_key IS
  'Calculée côté serveur (lib/paymentBridge/dedupe.ts), jamais reçue du client. L''unicité est ce qui empêche un même SMS renvoyé vingt fois de régler vingt fois.';


-- ═══════════════════════════════════════════════════════════════════════════
-- 6. MERCHANT_DEVICES — quel téléphone a le droit de parler
--
-- Le compagnon Android tournera sur le téléphone qui reçoit réellement les
-- paiements. Cette table dit lequel, et lui donne le droit d'envoyer des reçus.
--
-- ── Le jeton n'est pas stocké ──────────────────────────────────────────────
--
-- Seul son SHA-256. Un `device_id` en clair ne serait pas une authentification :
-- c'est un identifiant, et §36 le dit. Un jeton, lui, est un secret — et un
-- secret lisible en base n'en est plus un dès qu'une sauvegarde fuit.
--
-- `token_prefix` (les huit premiers caractères) sert à l'affichage : le marchand
-- reconnaît l'appareil qu'il révoque.
--
-- ── C'est le jeton qui désigne l'entreprise ────────────────────────────────
--
-- Le téléphone n'envoie JAMAIS de `business_id`, et la route n'en lira jamais
-- un. Le serveur hache le jeton, trouve la ligne, et l'entreprise est celle de
-- cette ligne. Sans quoi un appareil enrôlé chez un marchand pourrait déclarer
-- des encaissements chez un autre (§9).
--
-- ── La révocation est immédiate ────────────────────────────────────────────
--
-- `status = 'revoked'` est vérifié à chaque reçu, jamais mis en cache.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS merchant_devices (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id  UUID        NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,

  device_name  TEXT        NOT NULL,
  platform     TEXT        NOT NULL DEFAULT 'android'
                           CHECK (platform IN ('android','ios','web','other')),
  app_version  TEXT,

  -- SHA-256 hexadécimal du jeton. Le jeton lui-même n'existe qu'une fois, dans
  -- la réponse de l'enrôlement, et n'est plus jamais récupérable.
  token_hash   TEXT        NOT NULL,
  token_prefix TEXT        NOT NULL,

  status       TEXT        NOT NULL DEFAULT 'pending'
                           CHECK (status IN ('pending','active','offline','revoked')),

  -- Qui a enrôlé cet appareil. Un appareil n'apparaît pas tout seul.
  registered_by UUID       REFERENCES auth.users(id) ON DELETE SET NULL,
  last_seen_at  TIMESTAMPTZ,
  last_sync_at  TIMESTAMPTZ,

  revoked_at   TIMESTAMPTZ,
  revoked_by   UUID        REFERENCES auth.users(id) ON DELETE SET NULL,

  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT md_revoked_is_dated CHECK (status <> 'revoked' OR revoked_at IS NOT NULL)
);

-- C'est par là que passe chaque reçu : l'index doit être unique ET rapide.
CREATE UNIQUE INDEX IF NOT EXISTS idx_md_token_hash ON merchant_devices (token_hash);
CREATE INDEX IF NOT EXISTS idx_md_business ON merchant_devices (business_id, status);

DROP TRIGGER IF EXISTS trg_md_updated_at ON merchant_devices;
CREATE TRIGGER trg_md_updated_at BEFORE UPDATE ON merchant_devices
  FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

-- `payment_receipts.device_id` a été déclarée avant cette table (l'ordre de
-- lecture du fichier suit celui du flux, pas celui des dépendances). La clé
-- étrangère se pose ici.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payment_receipts_device_id_fkey') THEN
    ALTER TABLE payment_receipts
      ADD CONSTRAINT payment_receipts_device_id_fkey
      FOREIGN KEY (device_id) REFERENCES merchant_devices(id) ON DELETE SET NULL;
  END IF;
END $$;

COMMENT ON TABLE merchant_devices IS
  'Les téléphones autorisés à déclarer des encaissements. Seul le SHA-256 du jeton est stocké. C''est le jeton qui désigne l''entreprise : le téléphone n''envoie jamais de business_id.';


-- ═══════════════════════════════════════════════════════════════════════════
-- 7. PAYMENT_EVENTS — le journal, et pourquoi il ne suffisait pas d'activity_logs
--
-- `activity_logs` existe et reste utilisé pour tout ce qu'un UTILISATEUR CONNECTÉ
-- fait. Mais `logActivity()` passe par `getBusinessContext()` et abandonne en
-- silence sans session (lib/activityLog.ts). Or les trois quarts de ce qui
-- arrive à un paiement n'ont pas de session :
--
--   un acheteur anonyme déclare avoir payé
--   un téléphone enrôlé envoie un reçu
--   le rapprochement automatique confirme
--   le cron ferme une session expirée
--
-- Ces quatre-là ne laisseraient aucune trace. D'où ce journal, qui accepte un
-- acteur non humain.
--
-- ── Il est immuable ───────────────────────────────────────────────────────
--
-- Aucune politique UPDATE, aucune politique DELETE : avec RLS active, ce qui
-- n'est pas autorisé est refusé. Les GRANT ne donnent que SELECT et INSERT.
-- Un paiement confirmé ne se modifie pas en silence (§24).
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS payment_events (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id  UUID        NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  intent_id    UUID        REFERENCES payment_intents(id) ON DELETE CASCADE,
  receipt_id   UUID        REFERENCES payment_receipts(id) ON DELETE SET NULL,

  event_type   TEXT        NOT NULL,

  -- `system` = le rapprochement ou le cron. `device` = un téléphone enrôlé.
  -- `customer` = un acheteur sans compte.
  actor_type   TEXT        NOT NULL
                           CHECK (actor_type IN ('customer','merchant','system','device','admin')),
  actor_id     UUID,
  -- Ce qui distingue deux appareils du même commerce dans le journal.
  actor_label  TEXT,

  metadata     JSONB       NOT NULL DEFAULT '{}'::jsonb,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- L'histoire d'une dette, dans l'ordre. C'est la lecture de l'écran de détail.
CREATE INDEX IF NOT EXISTS idx_pev_intent ON payment_events (intent_id, created_at)
  WHERE intent_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_pev_business ON payment_events (business_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pev_type ON payment_events (business_id, event_type, created_at DESC);

COMMENT ON TABLE payment_events IS
  'Journal append-only des paiements. Existe en plus d''activity_logs parce que logActivity() abandonne sans session : un acheteur anonyme, un téléphone et le rapprochement automatique ne laisseraient aucune trace. Aucune politique UPDATE/DELETE : immuable.';


-- ═══════════════════════════════════════════════════════════════════════════
-- 8. LES POLITIQUES RLS
--
-- La règle, sans exception : une entreprise ne voit que ses lignes.
--
-- ── Pourquoi chaque table commence par un REVOKE ──────────────────────────
--
-- 20260713_grant_all_tables.sql a posé
--   ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO authenticated
-- Toute table créée ici naît donc avec TOUS les droits pour `authenticated`.
-- Sans REVOKE, les GRANT ciblés plus bas ne restreignent rien : ils
-- confirmeraient des droits déjà donnés.
--
-- ── Lire et écrire ne sont pas le même droit ───────────────────────────────
--
-- `FOR ALL` a déjà laissé un `viewer` effacer un contrat (20260911). Les
-- politiques sont donc séparées par verbe partout où le verbe change de règle.
--
-- ── Ce que `authenticated` ne touche jamais ────────────────────────────────
--
-- Les dettes, les sessions, les déclarations et les reçus sont écrits par des
-- chemins serveur (clé service) : un acheteur anonyme n'a pas de session, et le
-- montant dû ne doit être écrit par personne d'autre que le serveur. Le marchand
-- LIT ces tables ; il n'y écrit pas directement. Ses décisions passent par les
-- fonctions du §9, qui vérifient l'état avant d'écrire.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── merchant_payment_methods : le marchand gère ses numéros ────────────────
--
-- La seule table du module que le marchand modifie directement. Lecture par
-- tout membre actif — un caissier doit pouvoir dire au client sur quel numéro
-- payer. Écriture réservée au propriétaire et à l'administrateur : changer le
-- numéro d'encaissement, c'est détourner les recettes du commerce.

ALTER TABLE merchant_payment_methods ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON merchant_payment_methods FROM anon, authenticated;

DROP POLICY IF EXISTS "mpm_select" ON public.merchant_payment_methods;
DROP POLICY IF EXISTS "mpm_write"  ON public.merchant_payment_methods;

CREATE POLICY "mpm_select" ON public.merchant_payment_methods
  FOR SELECT TO authenticated
  USING (is_business_member(business_id));

CREATE POLICY "mpm_write" ON public.merchant_payment_methods
  FOR ALL TO authenticated
  USING      (fn_has_role(business_id, 'owner', 'admin'))
  WITH CHECK (fn_has_role(business_id, 'owner', 'admin'));

GRANT SELECT, INSERT, UPDATE, DELETE ON merchant_payment_methods TO authenticated;
GRANT ALL ON merchant_payment_methods TO service_role;


-- ─── payment_intents : lecture seule pour le marchand ──────────────────────

ALTER TABLE payment_intents ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON payment_intents FROM anon, authenticated;

DROP POLICY IF EXISTS "pi_select" ON public.payment_intents;

CREATE POLICY "pi_select" ON public.payment_intents
  FOR SELECT TO authenticated
  USING (is_business_member(business_id));

-- Pas de politique INSERT/UPDATE/DELETE, donc aucune écriture possible par un
-- compte connecté. Le montant dû n'est pas une donnée que l'interface édite.
GRANT SELECT ON payment_intents TO authenticated;
GRANT ALL    ON payment_intents TO service_role;


-- ─── payment_sessions ──────────────────────────────────────────────────────

ALTER TABLE payment_sessions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON payment_sessions FROM anon, authenticated;

DROP POLICY IF EXISTS "ps_select" ON public.payment_sessions;

CREATE POLICY "ps_select" ON public.payment_sessions
  FOR SELECT TO authenticated
  USING (is_business_member(business_id));

GRANT SELECT ON payment_sessions TO authenticated;
GRANT ALL    ON payment_sessions TO service_role;


-- ─── payment_evidence ──────────────────────────────────────────────────────

ALTER TABLE payment_evidence ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON payment_evidence FROM anon, authenticated;

DROP POLICY IF EXISTS "pe_select" ON public.payment_evidence;

CREATE POLICY "pe_select" ON public.payment_evidence
  FOR SELECT TO authenticated
  USING (is_business_member(business_id));

GRANT SELECT ON payment_evidence TO authenticated;
GRANT ALL    ON payment_evidence TO service_role;


-- ─── payment_receipts ──────────────────────────────────────────────────────
--
-- `sender_identifier` est lisible par les membres : le marchand a besoin de
-- reconnaître son client. Le masquage se fait à l'affichage
-- (lib/paymentBridge/mask.ts), pas par la RLS — une donnée qu'on doit pouvoir
-- lire pour travailler ne se protège pas en la rendant illisible.

ALTER TABLE payment_receipts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON payment_receipts FROM anon, authenticated;

DROP POLICY IF EXISTS "pr_select" ON public.payment_receipts;

CREATE POLICY "pr_select" ON public.payment_receipts
  FOR SELECT TO authenticated
  USING (is_business_member(business_id));

GRANT SELECT ON payment_receipts TO authenticated;
GRANT ALL    ON payment_receipts TO service_role;


-- ─── merchant_devices : le jeton n'est pas lisible, même par le propriétaire
--
-- La RLS travaille par LIGNE ; ici il faut protéger une COLONNE. Postgres sait
-- le faire : le GRANT énumère les colonnes, et `token_hash` n'y est pas.
--
-- Une requête `select('*')` sur cette table échoue donc, pour tout le monde sauf
-- la clé service. C'est voulu : le code doit nommer ce qu'il lit. Un `*` qui
-- passe finit un jour dans une réponse d'API.

ALTER TABLE merchant_devices ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON merchant_devices FROM anon, authenticated;

DROP POLICY IF EXISTS "md_select" ON public.merchant_devices;
DROP POLICY IF EXISTS "md_update" ON public.merchant_devices;

CREATE POLICY "md_select" ON public.merchant_devices
  FOR SELECT TO authenticated
  USING (is_business_member(business_id));

-- Révoquer est le seul geste que le marchand fait lui-même sur un appareil, et
-- c'est le plus urgent : téléphone perdu, employé parti. Il ne doit dépendre
-- d'aucune route.
CREATE POLICY "md_update" ON public.merchant_devices
  FOR UPDATE TO authenticated
  USING      (fn_has_role(business_id, 'owner', 'admin'))
  WITH CHECK (fn_has_role(business_id, 'owner', 'admin'));

GRANT SELECT (id, business_id, device_name, platform, app_version, token_prefix,
              status, registered_by, last_seen_at, last_sync_at,
              revoked_at, revoked_by, created_at, updated_at)
  ON merchant_devices TO authenticated;
GRANT UPDATE (status, revoked_at, revoked_by) ON merchant_devices TO authenticated;
GRANT ALL ON merchant_devices TO service_role;


-- ─── payment_events : lisible, jamais modifiable ───────────────────────────
--
-- Pas d'INSERT pour `authenticated` non plus : tout ce qui écrit dans ce journal
-- passe par la clé service, au moment même où l'action a lieu. Un journal qu'une
-- interface peut alimenter librement se remplit un jour d'événements que rien
-- n'a provoqués.

ALTER TABLE payment_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON payment_events FROM anon, authenticated;

DROP POLICY IF EXISTS "pev_select" ON public.payment_events;

CREATE POLICY "pev_select" ON public.payment_events
  FOR SELECT TO authenticated
  USING (is_business_member(business_id));

-- Ni UPDATE ni DELETE : ni politique, ni GRANT. Deux verrous pour la même
-- promesse, parce que celle-là ne se rattrape pas.
GRANT SELECT ON payment_events TO authenticated;
GRANT ALL    ON payment_events TO service_role;


-- ═══════════════════════════════════════════════════════════════════════════
-- 9. LES TRANSACTIONS — ce qui doit être atomique, et rien d'autre
--
-- Trois choses vivent en SQL plutôt qu'en TypeScript, et seulement trois :
--
--   L'OUVERTURE d'une session, parce qu'« une seule ouverte à la fois » demande
--   de fermer l'ancienne et d'ouvrir la nouvelle sans laisser d'intervalle.
--
--   La CONFIRMATION, parce qu'elle doit verrouiller la dette, vérifier que
--   l'encaissement n'a pas déjà servi, régler la commande et écrire le journal
--   sans qu'aucun autre appel ne s'intercale.
--
--   L'EXPIRATION en lot, parce que le cron balaie toutes les entreprises.
--
-- Le reste — le rapprochement, les décisions, les messages — est du TypeScript
-- testable. PostgREST ne sait pas poser un `FOR UPDATE` ; ce qui a besoin d'un
-- verrou de ligne ne peut pas vivre ailleurs qu'ici.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── Ouvrir une session ─────────────────────────────────────────────────────
--
-- Rejoue-la autant qu'on veut : elle ferme la session ouverte s'il y en a une,
-- puis en ouvre une neuve. Un acheteur qui recharge sa page de paiement repart
-- donc sur quinze minutes pleines — sur la MÊME dette, sans en créer une seconde.
--
-- Une dette déjà confirmée ou close ne rouvre pas : afficher un compte à rebours
-- sur une commande payée inviterait à payer deux fois.

CREATE OR REPLACE FUNCTION public.pp_open_payment_session(
  p_intent_id UUID,
  p_minutes   INT DEFAULT 15
)
RETURNS TABLE (out_session_id UUID, out_expires_at TIMESTAMPTZ)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_intent     payment_intents%ROWTYPE;
  v_session_id UUID;
  v_expires    TIMESTAMPTZ;
BEGIN
  SELECT * INTO v_intent FROM payment_intents WHERE id = p_intent_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Paiement introuvable.' USING ERRCODE = 'P0002';
  END IF;

  IF v_intent.status IN ('confirmed','rejected','cancelled') THEN
    RAISE EXCEPTION 'Ce paiement est déjà clos : aucune nouvelle tentative n''est possible.'
      USING ERRCODE = '22023';
  END IF;

  -- L'ancienne session est abandonnée, pas expirée : elle n'a pas atteint son
  -- terme, l'acheteur est simplement reparti de zéro. La nuance compte quand on
  -- relit le journal pour comprendre pourquoi un client n'a pas payé.
  UPDATE payment_sessions
     SET status = 'abandoned', closed_at = NOW()
   WHERE intent_id = p_intent_id AND status = 'open';

  v_expires := NOW() + make_interval(mins => GREATEST(p_minutes, 1));

  INSERT INTO payment_sessions (business_id, intent_id, expires_at)
  VALUES (v_intent.business_id, p_intent_id, v_expires)
  RETURNING id INTO v_session_id;

  -- `created` et `expired` repassent en attente ; `partially_paid`,
  -- `under_review` et `customer_reported` gardent leur état — une nouvelle
  -- tentative n'effface pas ce qui a déjà été constaté ou signalé.
  IF v_intent.status IN ('created','expired') THEN
    UPDATE payment_intents SET status = 'awaiting_payment' WHERE id = p_intent_id;
  END IF;

  INSERT INTO payment_events (business_id, intent_id, event_type, actor_type, metadata)
  VALUES (v_intent.business_id, p_intent_id, 'payment_session_started', 'system',
          jsonb_build_object('session_id', v_session_id, 'expires_at', v_expires));

  RETURN QUERY SELECT v_session_id, v_expires;
END;
$$;

REVOKE ALL     ON FUNCTION public.pp_open_payment_session(UUID, INT) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.pp_open_payment_session(UUID, INT) TO   service_role;


-- ─── Fermer les sessions échues ─────────────────────────────────────────────
--
-- Appelée par le cron quotidien. Elle ferme des ÉCRANS.
--
-- Une dette ne passe `expired` que si elle n'a RIEN reçu et RIEN signalé. Un
-- client qui a dit « j'ai payé », ou dont un versement partiel est constaté, ne
-- voit pas sa dette expirer sous lui : elle reste à examiner. C'est tout l'objet
-- de la règle des quinze minutes telle qu'elle est écrite en tête de fichier —
-- quinze minutes ferment une tentative, jamais un dû.

CREATE OR REPLACE FUNCTION public.pp_expire_payment_sessions()
RETURNS TABLE (out_sessions INT, out_intents INT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sessions INT := 0;
  v_intents  INT := 0;
BEGIN
  WITH closed AS (
    UPDATE payment_sessions
       SET status = 'expired', closed_at = NOW()
     WHERE status = 'open' AND expires_at <= NOW()
    RETURNING id, business_id, intent_id
  ),
  logged AS (
    INSERT INTO payment_events (business_id, intent_id, event_type, actor_type, metadata)
    SELECT business_id, intent_id, 'payment_session_expired', 'system',
           jsonb_build_object('session_id', id)
      FROM closed
    RETURNING 1
  )
  SELECT COUNT(*)::INT INTO v_sessions FROM closed;

  -- Les dettes réellement abandonnées : aucune session ouverte, rien de reçu,
  -- rien de signalé, et encore en attente.
  WITH abandoned AS (
    UPDATE payment_intents pi
       SET status = 'expired', closed_reason = 'session expirée sans versement constaté'
     WHERE pi.status IN ('created','awaiting_payment')
       AND pi.amount_received = 0
       AND NOT EXISTS (SELECT 1 FROM payment_sessions s
                        WHERE s.intent_id = pi.id AND s.status = 'open')
       AND EXISTS (SELECT 1 FROM payment_sessions s
                    WHERE s.intent_id = pi.id AND s.expires_at <= NOW())
       AND NOT EXISTS (SELECT 1 FROM payment_evidence e WHERE e.intent_id = pi.id)
    RETURNING pi.id, pi.business_id
  ),
  logged2 AS (
    INSERT INTO payment_events (business_id, intent_id, event_type, actor_type)
    SELECT business_id, id, 'payment_expired', 'system' FROM abandoned
    RETURNING 1
  )
  SELECT COUNT(*)::INT INTO v_intents FROM abandoned;

  RETURN QUERY SELECT v_sessions, v_intents;
END;
$$;

REVOKE ALL     ON FUNCTION public.pp_expire_payment_sessions() FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.pp_expire_payment_sessions() TO   service_role;


-- ═══════════════════════════════════════════════════════════════════════════
-- LA CONFIRMATION — le seul chemin vers « payé »
--
-- Tout ce qui déclare un paiement reçu passe par ici : le rapprochement
-- automatique, le marchand qui confirme à la main, l'administrateur qui répare.
-- Aucun autre code n'écrit `status = 'confirmed'`.
--
-- ── Ce qu'elle garantit ────────────────────────────────────────────────────
--
--   UN SEUL effet, même appelée dix fois. La dette est verrouillée
--   (`FOR UPDATE`), et un encaissement déjà rattaché à une autre dette est
--   refusé. Deux appareils qui détectent le même virement, ou un marchand qui
--   confirme pendant que le rapprochement confirme : le second appel voit le
--   travail du premier et n'en refait pas (§42).
--
--   LE MONTANT VIENT DE LA BASE. `p_amount` est plafonné à ce que l'encaissement
--   porte réellement ; l'appelant ne peut pas déclarer plus que le reçu.
--
--   LE TROP-PERÇU N'EST PAS CRÉDITÉ. Il est constaté, marqué, et laissé à la
--   décision du marchand (§16). ProfitPilot ne rembourse rien tout seul.
--
--   LE RESTE DÛ DEVIENT UNE DETTE COMPLÉMENTAIRE, rattachée à celle d'origine
--   (§15). On ne dit pas au client « payez encore 500 » sans lui dire de quoi
--   ces 500 sont le reste.
--
-- ── Pourquoi l'appel à confirm_store_order est dans un bloc EXCEPTION ──────
--
-- `confirm_store_order` lève quand le stock manque ou qu'une fiche produit a
-- disparu. Si cette erreur remontait, elle annulerait TOUTE la transaction —
-- y compris l'enregistrement de l'argent reçu. Le marchand aurait l'argent sur
-- son téléphone et rien dans ProfitPilot, et le client verrait « paiement non
-- confirmé » après avoir payé.
--
-- L'argent reçu est donc enregistré quoi qu'il arrive, et l'échec de conversion
-- en vente est consigné dans le journal. C'est le choix que `settleGatewayOrder`
-- fait déjà pour la passerelle (lib/storePaymentGateway.ts) ; les deux voies
-- doivent se comporter pareil, sinon « payé » ne veut pas dire la même chose
-- selon la voie.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.pp_confirm_payment_intent(
  p_intent_id  UUID,
  p_receipt_id UUID,
  p_amount     NUMERIC DEFAULT NULL,
  p_actor_type TEXT    DEFAULT 'system',
  p_actor_id   UUID    DEFAULT NULL,
  p_via        TEXT    DEFAULT 'auto_match',
  p_note       TEXT    DEFAULT NULL
)
RETURNS TABLE (
  out_status            TEXT,
  out_amount_received   NUMERIC,
  out_remaining         NUMERIC,
  out_overpaid          NUMERIC,
  out_supplementary_id  UUID,
  out_sale_id           UUID,
  out_settlement_error  TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_intent    payment_intents%ROWTYPE;
  v_receipt   payment_receipts%ROWTYPE;
  v_applied   NUMERIC(14,2);
  v_received  NUMERIC(14,2);
  v_remaining NUMERIC(14,2);
  v_overpaid  NUMERIC(14,2) := 0;
  v_supp_id   UUID;
  v_sale_id   UUID;
  v_err       TEXT;
  v_ratio     NUMERIC;
  v_status    TEXT;
  v_tries     INT := 0;
BEGIN
  -- ── Le verrou, avant toute lecture qui décide ───────────────────────────
  SELECT * INTO v_intent FROM payment_intents WHERE id = p_intent_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Paiement introuvable.' USING ERRCODE = 'P0002';
  END IF;

  -- Déjà confirmée : on rend l'état tel quel. Le deuxième appel simultané
  -- arrive ici, et ne refait rien.
  IF v_intent.status = 'confirmed' THEN
    RETURN QUERY SELECT v_intent.status, v_intent.amount_received,
                        0::NUMERIC, 0::NUMERIC, NULL::UUID,
                        (SELECT sale_id FROM orders WHERE id = v_intent.order_id),
                        NULL::TEXT;
    RETURN;
  END IF;

  IF v_intent.status IN ('rejected','cancelled') THEN
    RAISE EXCEPTION 'Ce paiement a été clos : il ne peut plus être confirmé.'
      USING ERRCODE = '22023';
  END IF;

  -- ── L'encaissement ──────────────────────────────────────────────────────
  SELECT * INTO v_receipt FROM payment_receipts WHERE id = p_receipt_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Encaissement introuvable.' USING ERRCODE = 'P0002';
  END IF;

  -- Le cloisonnement, vérifié ICI et pas seulement dans la RLS : cette fonction
  -- tourne en SECURITY DEFINER, donc sans RLS. Rapprocher l'encaissement d'un
  -- commerce d'une dette d'un autre serait autoriser le vol (§25).
  IF v_receipt.business_id <> v_intent.business_id THEN
    RAISE EXCEPTION 'Cet encaissement n''appartient pas à la même entreprise que ce paiement.'
      USING ERRCODE = '42501';
  END IF;

  -- Un encaissement ne règle qu'une dette. Sans ce refus, un seul virement de
  -- 4 500 G pourrait solder trois commandes de 4 500 G.
  IF v_receipt.intent_id IS NOT NULL AND v_receipt.intent_id <> p_intent_id THEN
    RAISE EXCEPTION 'Cet encaissement règle déjà un autre paiement.'
      USING ERRCODE = '23505';
  END IF;

  -- Un encaissement ne compte qu'une fois, même pour la MÊME dette. Deux écrans
  -- qui confirment le même versement partiel arrivent tous deux ici ; le verrou
  -- de ligne pris plus haut les sérialise, et le second trouve la colonne remplie.
  IF v_receipt.applied_amount IS NOT NULL THEN
    RAISE EXCEPTION 'Cet encaissement a déjà été pris en compte.'
      USING ERRCODE = '23505';
  END IF;

  -- ── Combien cet encaissement apporte ────────────────────────────────────
  --
  -- Plafonné au montant du reçu : l'appelant peut en imputer une partie
  -- (règlement de deux commandes par un seul virement), jamais davantage.
  v_applied := LEAST(COALESCE(p_amount, v_receipt.amount), v_receipt.amount);
  IF v_applied <= 0 THEN
    RAISE EXCEPTION 'Montant imputé nul ou négatif.' USING ERRCODE = '22023';
  END IF;

  v_received  := v_intent.amount_received + v_applied;
  v_remaining := GREATEST(v_intent.charge_amount - v_received, 0);
  IF v_received > v_intent.charge_amount THEN
    v_overpaid := v_received - v_intent.charge_amount;
  END IF;

  -- ── Le reçu est rattaché ────────────────────────────────────────────────
  UPDATE payment_receipts
     SET intent_id      = p_intent_id,
         applied_amount = v_applied,
         match_status = CASE
                          WHEN v_overpaid > 0  THEN 'overpayment'
                          WHEN v_remaining > 0 THEN 'amount_mismatch'
                          WHEN p_via = 'merchant' THEN 'manually_matched'
                          ELSE 'auto_matched'
                        END,
         confidence   = COALESCE(v_receipt.confidence,
                                 CASE WHEN v_remaining = 0 AND v_overpaid = 0
                                      THEN 'exact' ELSE 'medium' END)
   WHERE id = p_receipt_id;

  -- ── La dette avance ─────────────────────────────────────────────────────
  v_status := CASE WHEN v_remaining > 0 THEN 'partially_paid' ELSE 'confirmed' END;

  UPDATE payment_intents
     SET amount_received = v_received,
         status          = v_status,
         confirmed_at    = CASE WHEN v_status = 'confirmed' THEN NOW() ELSE confirmed_at END,
         confirmed_by    = CASE WHEN v_status = 'confirmed' THEN p_actor_id ELSE confirmed_by END,
         confirmed_via   = CASE WHEN v_status = 'confirmed' THEN p_via ELSE confirmed_via END,
         closed_reason   = CASE WHEN v_status = 'confirmed' THEN p_note ELSE closed_reason END
   WHERE id = p_intent_id;

  -- ── Le reste dû devient une dette complémentaire ────────────────────────
  --
  -- Créée une seule fois : si une tentative précédente en avait déjà ouvert une,
  -- on ne la double pas. Sinon un client qui paie 4 500 en trois fois se
  -- retrouverait avec trois dettes de reste concurrentes.
  IF v_remaining > 0 THEN
    SELECT id INTO v_supp_id
      FROM payment_intents
     WHERE parent_intent_id = p_intent_id
       AND status NOT IN ('cancelled','rejected','expired')
     LIMIT 1;

    IF v_supp_id IS NULL THEN
      -- `reference` est omise : le DEFAULT de la colonne la tire, et le retire à
      -- chaque tentative. On réessaie sur collision plutôt que de faire échouer
      -- une confirmation pour six caractères — 31^6 rend le second tour rare et
      -- le troisième invraisemblable.
      LOOP
        v_tries := v_tries + 1;
        BEGIN
          INSERT INTO payment_intents (
            business_id, kind, order_id, sale_id, subscription_id, customer_id,
            parent_intent_id, amount, currency, charge_amount, charge_currency,
            exchange_rate, method, provider, destination_method_id,
            destination_snapshot, status, metadata
          ) VALUES (
            v_intent.business_id, v_intent.kind, v_intent.order_id, v_intent.sale_id,
            v_intent.subscription_id, v_intent.customer_id,
            p_intent_id,
            -- Le reste, exprimé dans les deux devises, au taux FIGÉ de la dette
            -- d'origine : un complément ne se renégocie pas au taux du jour.
            ROUND(v_intent.amount * (v_remaining / v_intent.charge_amount), 2),
            v_intent.currency,
            v_remaining, v_intent.charge_currency,
            v_intent.exchange_rate, v_intent.method, v_intent.provider,
            v_intent.destination_method_id, v_intent.destination_snapshot,
            'created',
            jsonb_build_object('supplementary_of', p_intent_id,
                               'parent_reference', v_intent.reference)
          )
          RETURNING id INTO v_supp_id;
          EXIT;
        EXCEPTION WHEN unique_violation THEN
          IF v_tries >= 8 THEN RAISE; END IF;
        END;
      END LOOP;

      INSERT INTO payment_events (business_id, intent_id, receipt_id, event_type,
                                  actor_type, actor_id, metadata)
      VALUES (v_intent.business_id, v_supp_id, p_receipt_id, 'payment_created',
              p_actor_type, p_actor_id,
              jsonb_build_object('supplementary_of', p_intent_id,
                                 'remaining', v_remaining));
    END IF;
  END IF;

  -- ── La commande ou la facture ───────────────────────────────────────────
  IF v_status = 'confirmed' THEN

    -- Une dette complémentaire soldée solde toute sa lignée. Sans cela, la dette
    -- d'origine restait « partiellement payée » pour toujours — ouverte, donc
    -- candidate au rapprochement, et le moindre versement du même montant qu'un
    -- reste tombait en « plusieurs commandes possibles ».
    UPDATE payment_intents
       SET status        = 'confirmed',
           confirmed_at  = NOW(),
           confirmed_by  = p_actor_id,
           confirmed_via = p_via,
           closed_reason = 'soldée par la dette complémentaire ' || v_intent.reference
     WHERE id IN (
             WITH RECURSIVE lineage AS (
               SELECT parent_intent_id AS id FROM payment_intents WHERE id = p_intent_id
               UNION
               SELECT pi.parent_intent_id FROM payment_intents pi
                 JOIN lineage l ON pi.id = l.id
             )
             SELECT id FROM lineage WHERE id IS NOT NULL
           )
       AND status = 'partially_paid';

    -- Commande boutique : marquée payée, puis réglée par la MÊME transaction que
    -- la confirmation manuelle et que la passerelle.
    IF v_intent.order_id IS NOT NULL THEN
      UPDATE orders
         SET payment_status = 'paid',
             payment_method = COALESCE(payment_method, v_intent.method)
       WHERE id = v_intent.order_id
         AND payment_status <> 'paid';

      BEGIN
        v_sale_id := confirm_store_order(v_intent.order_id);
      EXCEPTION WHEN OTHERS THEN
        -- Voir l'en-tête : l'argent reçu ne se perd pas parce qu'il manque deux
        -- savons en stock. L'échec est consigné, le marchand le voit, la
        -- commande reste à régulariser.
        v_err := SQLERRM;
      END;
    END IF;

    -- Facture existante (une créance qu'on encaisse enfin) : le règlement
    -- s'ajoute à ce qui était déjà payé. `balance_due` est une colonne générée :
    -- elle suit toute seule.
    --
    -- Le `LEAST` porte la justesse, il n'est pas une précaution : un premier
    -- versement partiel a déjà crédité sa part au prorata (branche ELSIF
    -- ci-dessous), et l'on ajoute ici le montant PLEIN de la dette. Sans le
    -- plafond, payer 4 500 en deux fois créditerait 8 055. Avec lui, la facture
    -- arrive exactement à son total — et une dette qui ne couvre qu'une PARTIE
    -- du solde (encaissement partiel voulu) laisse bien `partial`.
    IF v_intent.sale_id IS NOT NULL THEN
      UPDATE sales
         SET paid_amount    = LEAST(paid_amount + v_intent.amount, total_amount),
             payment_status = CASE
                                WHEN paid_amount + v_intent.amount >= total_amount
                                  THEN 'paid' ELSE 'partial'
                              END::payment_status_type
       WHERE id = v_intent.sale_id;
      v_sale_id := v_intent.sale_id;
    END IF;

  ELSIF v_intent.sale_id IS NOT NULL THEN
    -- Versement partiel sur une facture : il compte, au prorata de ce qui a été
    -- couvert. Ne rien écrire laisserait la créance intacte alors qu'une partie
    -- est arrivée — et la relance quotidienne réclamerait la totalité.
    v_ratio := v_applied / v_intent.charge_amount;
    UPDATE sales
       SET paid_amount    = LEAST(paid_amount + ROUND(v_intent.amount * v_ratio, 2),
                                  total_amount),
           payment_status = 'partial'::payment_status_type
     WHERE id = v_intent.sale_id;
  END IF;

  -- ── Le journal ──────────────────────────────────────────────────────────
  INSERT INTO payment_events (business_id, intent_id, receipt_id, event_type,
                              actor_type, actor_id, metadata)
  VALUES (
    v_intent.business_id, p_intent_id, p_receipt_id,
    CASE WHEN v_status = 'confirmed'
           THEN (CASE WHEN p_via = 'merchant' THEN 'payment_manually_confirmed'
                      WHEN p_via = 'admin'    THEN 'payment_admin_confirmed'
                      ELSE 'payment_auto_matched' END)
         ELSE 'payment_partially_received' END,
    p_actor_type, p_actor_id,
    jsonb_build_object(
      'applied',         v_applied,
      'amount_received', v_received,
      'charge_amount',   v_intent.charge_amount,
      'remaining',       v_remaining,
      'overpaid',        v_overpaid,
      'via',             p_via,
      'note',            p_note,
      'supplementary_id', v_supp_id,
      'settlement_error', v_err
    )
  );

  -- Le trop-perçu est un événement à part : c'est une décision qui attend le
  -- marchand, pas une ligne de plus dans l'historique de la confirmation.
  IF v_overpaid > 0 THEN
    INSERT INTO payment_events (business_id, intent_id, receipt_id, event_type,
                                actor_type, actor_id, metadata)
    VALUES (v_intent.business_id, p_intent_id, p_receipt_id, 'payment_overpayment',
            p_actor_type, p_actor_id,
            jsonb_build_object('overpaid', v_overpaid,
                               'charge_amount', v_intent.charge_amount));
  END IF;

  RETURN QUERY SELECT v_status, v_received, v_remaining, v_overpaid,
                      v_supp_id, v_sale_id, v_err;
END;
$$;

REVOKE ALL ON FUNCTION public.pp_confirm_payment_intent(UUID, UUID, NUMERIC, TEXT, UUID, TEXT, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pp_confirm_payment_intent(UUID, UUID, NUMERIC, TEXT, UUID, TEXT, TEXT)
  TO service_role;

COMMENT ON FUNCTION public.pp_confirm_payment_intent(UUID, UUID, NUMERIC, TEXT, UUID, TEXT, TEXT) IS
  'LE seul chemin vers « payé ». Verrouille la dette, refuse un encaissement déjà employé, impute au plus le montant du reçu, ouvre une dette complémentaire pour le reste, constate le trop-perçu sans le créditer, et appelle confirm_store_order dans un bloc EXCEPTION pour que l''argent reçu ne se perde jamais sur un défaut de stock.';


COMMIT;

-- ─────────────────────────────────────────────────────────────────────────────
-- Vérification — à lire dans la sortie du SQL Editor
--
-- Coller ce bloc APRÈS le COMMIT ci-dessus, dans la même exécution.
--
-- Une seule ligne attendue, et toutes les colonnes doivent valoir ce qui est
-- annoncé. Une valeur différente veut dire que le fichier n'a pas été appliqué
-- en entier : le relancer (il est idempotent) plutôt que de déployer le code.
--
--   tables            = 7     les sept tables du module
--   fonctions         = 4     pp_payment_reference, pp_open_payment_session,
--                             pp_expire_payment_sessions, pp_confirm_payment_intent
--   politiques        = 9     mpm_select, mpm_write, pi_select, ps_select,
--                             pe_select, pr_select, md_select, md_update,
--                             pev_select
--   events_immuable   = true  AUCUNE politique UPDATE ou DELETE sur payment_events
--   jeton_protege     = true  `token_hash` n'est PAS lisible par `authenticated`
--   intents_en_lecture= true  `authenticated` ne peut pas écrire une dette
-- ─────────────────────────────────────────────────────────────────────────────

SELECT
  (SELECT COUNT(*)::INT FROM pg_tables
    WHERE schemaname = 'public'
      AND tablename IN ('merchant_payment_methods','payment_intents','payment_sessions',
                        'payment_evidence','payment_receipts','merchant_devices',
                        'payment_events'))                                AS tables,

  (SELECT COUNT(*)::INT FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN ('pp_payment_reference','pp_open_payment_session',
                        'pp_expire_payment_sessions','pp_confirm_payment_intent'))
                                                                          AS fonctions,

  (SELECT COUNT(*)::INT FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN ('merchant_payment_methods','payment_intents','payment_sessions',
                        'payment_evidence','payment_receipts','merchant_devices',
                        'payment_events'))                                AS politiques,

  -- Le journal ne se réécrit pas. C'est la promesse du §24, et la seule du
  -- fichier qui ne se rattrape pas après coup.
  (SELECT NOT EXISTS (SELECT 1 FROM pg_policies
                       WHERE schemaname = 'public' AND tablename = 'payment_events'
                         AND cmd IN ('UPDATE','DELETE'))
      AND NOT has_table_privilege('authenticated', 'public.payment_events', 'UPDATE')
      AND NOT has_table_privilege('authenticated', 'public.payment_events', 'DELETE'))
                                                                          AS events_immuable,

  -- Le secret d'un appareil n'est lisible par personne d'autre que la clé
  -- service — vérifié au niveau de la COLONNE, seul niveau où c'est vrai.
  (NOT has_column_privilege('authenticated', 'public.merchant_devices', 'token_hash', 'SELECT'))
                                                                          AS jeton_protege,

  -- Le montant dû n'est pas une donnée que l'interface édite.
  (    has_table_privilege('authenticated', 'public.payment_intents', 'SELECT')
   AND NOT has_table_privilege('authenticated', 'public.payment_intents', 'INSERT')
   AND NOT has_table_privilege('authenticated', 'public.payment_intents', 'UPDATE')
   AND NOT has_table_privilege('authenticated', 'public.payment_intents', 'DELETE'))
                                                                          AS intents_en_lecture;
