-- ─────────────────────────────────────────────────────────────────────────────
-- Le courriel « Votre commande est confirmée »
--
-- Une commande peut être confirmée par plusieurs chemins — le marchand à la
-- main, le rappel MonCash / NatCash, Payment Bridge — et parfois par deux
-- d'entre eux. Cette colonne est posée AVANT l'envoi par une mise à jour
-- conditionnelle (lib/orderEmails.ts) : un seul chemin la pose, un seul envoie.
--
-- Sans elle, le code n'envoie rien plutôt que d'envoyer en double.
--
-- Idempotente : `ADD COLUMN IF NOT EXISTS`, aucun DROP.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS confirmation_email_sent_at TIMESTAMPTZ;

COMMENT ON COLUMN orders.confirmation_email_sent_at IS
  'Envoi du courriel de confirmation à l''acheteur. NULL = jamais envoyé. Un seul par commande.';

-- Les commandes déjà confirmées ne reçoivent pas, des semaines plus tard, une
-- confirmation qu'elles n'attendaient plus : on les marque comme traitées.
UPDATE orders
   SET confirmation_email_sent_at = COALESCE(updated_at, created_at)
 WHERE confirmation_email_sent_at IS NULL
   AND status IN ('confirmed', 'preparing', 'shipped', 'delivered', 'cancelled', 'refunded');

-- Vérification : doit rendre `true`.
SELECT EXISTS (
  SELECT 1 FROM information_schema.columns
   WHERE table_name = 'orders' AND column_name = 'confirmation_email_sent_at'
) AS col_confirmation_email;
