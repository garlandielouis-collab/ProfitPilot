-- ─────────────────────────────────────────────────────────────────────────────
-- Le numéro de téléphone comme identifiant de connexion
--
-- Audit « Du débutant au senior », §6.1, ligne « Contexte haïtien » :
--
--   Version junior — « Connexion classique par e-mail, pour des marchands dont
--   beaucoup vivent sur WhatsApp et n'utilisent pas d'e-mail au quotidien. »
--
--   Version senior — « Connexion par numéro de téléphone en premier, indicatif
--   +509 prérempli, clavier numérique automatique ; l'e-mail en option
--   secondaire. »
--
-- Pourquoi une table plutôt que `auth.users.phone` : la colonne native est
-- réservée à l'authentification par SMS de Supabase, qui exige un fournisseur
-- (Twilio) et facture chaque message. Ici le mot de passe reste la preuve ; le
-- téléphone n'est qu'un identifiant — celui que le marchand connaît par cœur,
-- là où son adresse e-mail est souvent une formalité créée pour l'inscription.
--
-- Le numéro est stocké NORMALISÉ : huit chiffres, sans indicatif, sans espace.
-- « +509 3712-4521 », « 509 37124521 » et « 3712 4521 » désignent la même
-- personne ; la contrainte d'unicité ne le saurait pas autrement.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS user_phones (
  user_id     UUID        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  phone       TEXT        NOT NULL UNIQUE CHECK (phone ~ '^[0-9]{8}$'),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE  user_phones IS 'Numéro haïtien (8 chiffres, sans indicatif) servant d''identifiant de connexion.';
COMMENT ON COLUMN user_phones.phone IS 'Normalisé : chiffres seuls, sans +509, sans espace ni tiret.';

ALTER TABLE user_phones ENABLE ROW LEVEL SECURITY;

-- Personne ne lit la table depuis le navigateur : la résolution
-- « téléphone → compte » se fait côté serveur, et seulement après vérification
-- du mot de passe. Sans cela, la table serait un annuaire ouvert : on
-- essaierait les numéros un à un pour savoir lesquels ont un compte.
DROP POLICY IF EXISTS user_phones_self_select ON user_phones;
CREATE POLICY user_phones_self_select ON user_phones
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS user_phones_self_upsert ON user_phones;
CREATE POLICY user_phones_self_upsert ON user_phones
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS user_phones_self_update ON user_phones;
CREATE POLICY user_phones_self_update ON user_phones
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS user_phones_self_delete ON user_phones;
CREATE POLICY user_phones_self_delete ON user_phones
  FOR DELETE USING (auth.uid() = user_id);
