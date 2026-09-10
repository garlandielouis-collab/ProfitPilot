-- ─────────────────────────────────────────────────────────────────────────────
-- La demande d'avis : deux dates sur la commande
--
-- ── Pourquoi cette migration existe ─────────────────────────────────────────
--
-- `submitReview` était écrite, correctement gardée, et n'avait AUCUN appelant.
-- `reviews.status` valait `pending` par défaut et aucun écran ne permettait de
-- publier. La boucle était ouverte aux deux bouts : la table restait vide, donc
-- aucune note ne s'affichait jamais sur aucune fiche.
--
-- Les deux surfaces manquantes — le formulaire après achat et l'écran de
-- modération — sont du code. Ce qui demande la base, c'est la RELANCE : pour
-- n'envoyer qu'un seul courriel par commande, il faut se souvenir qu'on l'a
-- envoyé. Et pour l'envoyer au bon moment, il faut savoir QUAND la commande a
-- été livrée.
--
-- ── Pourquoi `delivered_at` et non une lecture de l'historique ──────────────
--
-- `order_status_history` porte déjà la transition, et on pourrait l'interroger.
-- Deux raisons de ne pas le faire :
--
--   Le balayage nocturne passerait d'une lecture indexée sur `orders` à une
--   jointure sur un historique qui grossit sans limite — une ligne par
--   changement de statut, pour toutes les commandes de toutes les boutiques.
--
--   Les commandes livrées AVANT que le déclencheur d'historique existe
--   (20260906) n'ont aucune ligne. Elles seraient invisibles, et ce sont
--   justement les plus anciennes.
--
-- ── Pourquoi un déclencheur BEFORE, et pas celui qui existe ────────────────
--
-- `trg_orders_track_status` est un déclencheur AFTER. Une affectation à `NEW`
-- dans un AFTER n'a aucun effet sur la ligne écrite — le piège classique. Il
-- faut donc un second déclencheur, BEFORE, et c'est aussi plus sûr : on ne
-- touche pas à une fonction qui marche et qui écrit l'historique.
--
-- `delivered_at` ne se remet jamais à zéro si la commande repasse par
-- « livrée » : une commande livrée deux fois n'existe pas, et `COALESCE` garde
-- la première date — celle d'après laquelle le client a réellement reçu.
--
-- Idempotente : `ADD COLUMN IF NOT EXISTS`, `CREATE OR REPLACE`, aucun DROP de
-- données.
-- ─────────────────────────────────────────────────────────────────────────────

-- ═════════════════════════════════════════════════════════════════════════════
-- 1. Les deux colonnes
-- ═════════════════════════════════════════════════════════════════════════════

ALTER TABLE orders
  -- Le moment où la commande est passée à « livrée ». Un INSTANT, donc
  -- TIMESTAMPTZ : « livrée mardi » dépend du lecteur, « livrée à 23 h 40 UTC »
  -- non. (Politique de types du Document Center, qui vaut pour tout le dépôt.)
  ADD COLUMN IF NOT EXISTS delivered_at         TIMESTAMPTZ,
  -- Le moment où la relance est partie. NULL = jamais envoyée. C'est ce qui
  -- garantit qu'un client ne reçoit pas la même demande chaque nuit.
  ADD COLUMN IF NOT EXISTS review_email_sent_at TIMESTAMPTZ;

COMMENT ON COLUMN orders.delivered_at IS
  'Premier passage au statut « delivered ». Ne se réécrit pas.';
COMMENT ON COLUMN orders.review_email_sent_at IS
  'Envoi de la demande d''avis. NULL = jamais envoyée. Une seule par commande.';

-- ═════════════════════════════════════════════════════════════════════════════
-- 2. Le rattrapage
--
-- Les commandes déjà livrées n'ont pas de date. On la reconstruit, dans l'ordre
-- de confiance décroissante : la ligne d'historique si elle existe, sinon la
-- dernière modification de la commande.
--
-- `review_email_sent_at` reste NULL pour elles : ces clients n'ont jamais reçu
-- de demande, et rien n'interdit de leur en envoyer une. Le filtre d'ancienneté
-- du balayage s'en charge — voir le point 4.
-- ═════════════════════════════════════════════════════════════════════════════

UPDATE orders o
   SET delivered_at = COALESCE(
         (SELECT MIN(h.created_at)
            FROM order_status_history h
           WHERE h.order_id = o.id
             AND h.to_status = 'delivered'),
         o.updated_at
       )
 WHERE o.status = 'delivered'
   AND o.delivered_at IS NULL;

-- ═════════════════════════════════════════════════════════════════════════════
-- 3. Le déclencheur
-- ═════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION fn_orders_mark_delivered()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status = 'delivered'
     AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'delivered') THEN
    NEW.delivered_at := COALESCE(NEW.delivered_at, NOW());
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_orders_mark_delivered ON orders;
CREATE TRIGGER trg_orders_mark_delivered
  BEFORE INSERT OR UPDATE OF status ON orders
  FOR EACH ROW EXECUTE FUNCTION fn_orders_mark_delivered();

-- ═════════════════════════════════════════════════════════════════════════════
-- 4. L'index du balayage nocturne
--
-- La requête de la relance est : « les commandes livrées, dont la demande n'est
-- pas partie, livrées il y a plus de N jours et moins de M ». L'index partiel
-- ne contient donc que les lignes réellement candidates — quelques-unes par
-- boutique — au lieu de toutes les commandes jamais passées.
--
-- La borne HAUTE est ce qui rend le rattrapage du point 2 sans danger :
-- sans elle, la première nuit après cette migration enverrait une demande
-- d'avis pour chaque commande livrée depuis l'ouverture de la boutique. Un
-- client qui a acheté il y a huit mois et reçoit « donnez votre avis »
-- n'évalue pas un produit : il se demande si on a piraté le commerçant.
-- ═════════════════════════════════════════════════════════════════════════════

CREATE INDEX IF NOT EXISTS idx_orders_review_pending
  ON orders (delivered_at)
  WHERE status = 'delivered' AND review_email_sent_at IS NULL;

-- ═════════════════════════════════════════════════════════════════════════════
-- 5. La politique d'écriture des avis reste inchangée
--
-- Rappel, parce que c'est la garantie centrale du §27 et qu'elle ne doit pas
-- être « réparée » par quelqu'un qui la croirait oubliée :
--
--   `reviews` n'a AUCUNE politique d'INSERT. Un marchand ne peut donc pas
--   créer un avis, même sur sa propre boutique — RLS refuse faute de
--   politique. Seule la clé service écrit, et seulement à travers
--   `submitReview`, qui exige une commande réelle, l'adresse de cette
--   commande, et que le produit figure dans cette commande.
--
--   `status` vaut `pending`. Le marchand peut refuser une insulte ; il ne peut
--   pas fabriquer un éloge.
--
-- Rien à faire ici : c'est déjà le cas depuis 20260906. On le redit parce que
-- cette migration ajoute enfin des écrans qui écrivent, et que la tentation
-- d'ouvrir une politique d'INSERT « pour simplifier » arrivera un jour.
-- ═════════════════════════════════════════════════════════════════════════════

-- ── Vérification ────────────────────────────────────────────────────────────
--
-- À lire dans la sortie du SQL Editor. Les deux colonnes doivent exister, et le
-- nombre de commandes livrées sans date doit valoir 0.

SELECT
  (SELECT COUNT(*) FROM information_schema.columns
    WHERE table_name = 'orders' AND column_name = 'delivered_at')         AS col_delivered_at,
  (SELECT COUNT(*) FROM information_schema.columns
    WHERE table_name = 'orders' AND column_name = 'review_email_sent_at') AS col_review_sent,
  (SELECT COUNT(*) FROM orders
    WHERE status = 'delivered' AND delivered_at IS NULL)                  AS livrees_sans_date,
  (SELECT COUNT(*) FROM orders WHERE status = 'delivered')                AS livrees_total;
