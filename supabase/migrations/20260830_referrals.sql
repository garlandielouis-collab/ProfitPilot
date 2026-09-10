-- ─────────────────────────────────────────────────────────────────────────────
-- Le parrainage — un mois de Rapports pour qui amène un marchand
--
-- « Si un user parraine un client, qu'il bénéficie de la fonctionnalité de
--   rapport pour un mois gratuit. »
--
-- Trois tables, et une seule idée nouvelle : un DROIT peut désormais venir
-- d'ailleurs que de l'offre.
--
--   referral_codes   le code de parrainage d'un marchand (un seul, stable)
--   referrals        qui a amené qui — une ligne par filleul, jamais deux
--   feature_grants   un droit temporaire, posé PAR-DESSUS l'offre
--
-- ── Pourquoi `feature_grants` et pas une colonne sur l'abonnement ───────────
--
-- Parce qu'un mois de Rapports offert n'est pas un changement d'offre : le
-- marchand reste sur Esansyel, sa facture ne bouge pas, et à l'échéance il
-- retombe exactement où il était. Écrire le cadeau dans `subscriptions`
-- l'aurait fait passer pour un abonné Kwasans — auprès du code de facturation,
-- des relances, et de la page de prix. Un cadeau qui ment sur ce qu'il est
-- finit toujours par se facturer à quelqu'un.
--
-- La table est générique à dessein : `feature` est le nom d'une capacité du
-- registre (`lib/planFeatures.ts`). Demain, une compensation après une panne ou
-- une offre de bienvenue s'écrira ici sans nouvelle table.
--
-- ── Ce qui déclenche la récompense ─────────────────────────────────────────
--
-- La création du compte filleul, pas son abonnement. Un marchand qui en amène
-- un autre a fait son travail ; lui faire dépendre sa récompense d'une décision
-- d'achat qu'il ne contrôle pas, c'est un programme de parrainage que personne
-- ne relaie deux fois.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Le code ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS referral_codes (
  user_id     UUID        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  -- Court, en majuscules, sans I ni O ni 0 ni 1 : il se dicte au téléphone et
  -- se recopie sur WhatsApp sans qu'on confonde un zéro avec un O.
  code        TEXT        NOT NULL UNIQUE CHECK (code ~ '^[A-HJ-NP-Z2-9]{6}$'),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE referral_codes IS 'Le code de parrainage d''un marchand — un seul, stable, partageable.';

ALTER TABLE referral_codes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS referral_codes_self_select ON referral_codes;
CREATE POLICY referral_codes_self_select ON referral_codes
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS referral_codes_self_insert ON referral_codes;
CREATE POLICY referral_codes_self_insert ON referral_codes
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- ── Qui a amené qui ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS referrals (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id  UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- UNIQUE : un filleul ne compte qu'une fois, quoi qu'il arrive ensuite —
  -- sans quoi il suffirait de rejouer la réclamation pour empiler les mois.
  referred_id  UUID        NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  code         TEXT        NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT referrals_not_self CHECK (referrer_id <> referred_id)
);

CREATE INDEX IF NOT EXISTS referrals_referrer_idx ON referrals(referrer_id);

COMMENT ON TABLE referrals IS 'Un filleul, une ligne. La contrainte d''unicité est la règle du jeu.';

ALTER TABLE referrals ENABLE ROW LEVEL SECURITY;

-- Chacun voit les parrainages qui le concernent — les siens comme filleul,
-- les siens comme parrain. Personne ne voit ceux des autres.
DROP POLICY IF EXISTS referrals_own_select ON referrals;
CREATE POLICY referrals_own_select ON referrals
  FOR SELECT USING (auth.uid() = referrer_id OR auth.uid() = referred_id);

-- C'est le FILLEUL qui déclare son parrain, jamais l'inverse : on ne peut pas
-- s'attribuer des filleuls qu'on n'a pas amenés.
DROP POLICY IF EXISTS referrals_referred_insert ON referrals;
CREATE POLICY referrals_referred_insert ON referrals
  FOR INSERT WITH CHECK (auth.uid() = referred_id);

-- ── Les droits temporaires ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS feature_grants (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- Le nom d'une capacité du registre : 'monthly_reports', 'ai_assistant'…
  feature     TEXT        NOT NULL,
  expires_at  TIMESTAMPTZ NOT NULL,
  -- D'où vient le cadeau. Une seule ligne par (marchand, capacité, origine) :
  -- les parrainages successifs REPOUSSENT l'échéance au lieu d'empiler des
  -- lignes qu'il faudrait ensuite additionner.
  source      TEXT        NOT NULL DEFAULT 'referral',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, feature, source)
);

CREATE INDEX IF NOT EXISTS feature_grants_active_idx
  ON feature_grants(user_id, expires_at);

COMMENT ON TABLE feature_grants IS 'Un droit posé par-dessus l''offre, avec une date de fin. L''offre, elle, ne bouge pas.';

ALTER TABLE feature_grants ENABLE ROW LEVEL SECURITY;

-- Le marchand lit ses droits — c'est ce qui permet à l'écran de dire « offert
-- jusqu'au 30 septembre » plutôt que de le laisser deviner.
DROP POLICY IF EXISTS feature_grants_self_select ON feature_grants;
CREATE POLICY feature_grants_self_select ON feature_grants
  FOR SELECT USING (auth.uid() = user_id);

-- Aucune politique d'écriture : un droit ne s'accorde jamais depuis le
-- navigateur. Seul le serveur (clé de service) en pose, dans `grant_feature_days()`.

-- ── Poser un droit, sans course entre deux parrainages ──────────────────────
--
-- Deux filleuls qui s'inscrivent dans la même seconde, avec une lecture puis
-- une écriture côté application, se seraient écrasés l'un l'autre : le parrain
-- aurait gagné un mois au lieu de deux. `ON CONFLICT … DO UPDATE` fait le calcul
-- dans la base, en une seule instruction.
--
-- `GREATEST(expires_at, NOW())` : si le droit précédent est expiré, le nouveau
-- mois part d'aujourd'hui — pas de la date morte, qui offrirait un cadeau déjà
-- consommé.

CREATE OR REPLACE FUNCTION grant_feature_days(
  p_user    UUID,
  p_feature TEXT,
  p_days    INT,
  p_source  TEXT DEFAULT 'referral'
)
RETURNS TIMESTAMPTZ
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_expires TIMESTAMPTZ;
BEGIN
  INSERT INTO feature_grants (user_id, feature, expires_at, source)
  VALUES (p_user, p_feature, NOW() + (p_days || ' days')::INTERVAL, p_source)
  ON CONFLICT (user_id, feature, source) DO UPDATE
    SET expires_at = GREATEST(feature_grants.expires_at, NOW()) + (p_days || ' days')::INTERVAL,
        updated_at = NOW()
  RETURNING expires_at INTO v_expires;

  RETURN v_expires;
END;
$$;

-- La fonction est appelée par le serveur avec la clé de service. Personne
-- d'autre ne doit pouvoir s'offrir un mois de Rapports.
REVOKE ALL ON FUNCTION grant_feature_days(UUID, TEXT, INT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION grant_feature_days(UUID, TEXT, INT, TEXT) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION grant_feature_days(UUID, TEXT, INT, TEXT) TO service_role;

GRANT SELECT, INSERT         ON referral_codes  TO authenticated;
GRANT SELECT, INSERT         ON referrals       TO authenticated;
GRANT SELECT                 ON feature_grants  TO authenticated;
GRANT ALL                    ON referral_codes, referrals, feature_grants TO service_role;
