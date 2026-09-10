-- ─────────────────────────────────────────────────────────────────────────────
-- Le parrainage, deuxième étage — l'échelle des récompenses
--
-- Le premier jet récompensait l'INSCRIPTION d'un filleul par un mois de
-- Rapports. C'était généreux et c'était le trou : une inscription ne coûte
-- rien à fabriquer, et un mois d'une capacité payante s'échangeait donc contre
-- une adresse e-mail. On garde toute la mécanique (`referral_codes`,
-- `referrals`, `feature_grants`, `grant_feature_days`) et on la range sur
-- TROIS BARREAUX, du moins cher au plus cher :
--
--   1. INSCRIT      le filleul crée son compte
--                   → +10 questions à l'assistant, +10 fiches produits
--                     (proposition 2 : coût marginal quasi nul)
--   2. ACTIF        7 jours plus tard, et il a vraiment vendu
--                   → 7 jours de Relance WhatsApp — la capacité de l'étage
--                     AU-DESSUS, datée, avec un compte à rebours
--   3. PAYANT       le filleul paie son premier mois
--                   → 30 jours de Rapports + un BON DE RÉDUCTION sur l'offre
--                     au-dessus de celle du parrain (proposition 1)
--
-- ── Le principe directeur ──────────────────────────────────────────────────
--
-- On ne récompense JAMAIS par un mois gratuit de l'offre que le marchand paie
-- déjà : ça détruit le revenu et ça retire toute raison de monter. On
-- récompense en MONNAIE D'UPGRADE — des choses qui n'existent qu'à l'étage
-- au-dessus. Le parrainage finance la montée en gamme au lieu de la bloquer.
--
-- ── Ce que ce fichier ajoute ───────────────────────────────────────────────
--
--   referrals.*        les dates des trois barreaux — un barreau franchi une
--                      seule fois, et la date le prouve
--   quota_grants       un plafond relevé (questions IA, fiches produits)
--   upgrade_credits    un bon de réduction, sur une offre précise, avec un
--                      nombre de mois et une échéance
--   ai_usage           le compteur mensuel de questions — sans lui, aucun
--                      « +10 questions » ne veut rien dire
--   payments.*         ce qui a été réellement remisé, et avec quels bons
--
-- Aucune de ces tables n'est inscriptible depuis le navigateur. Une récompense
-- qu'on peut s'écrire soi-même n'est pas une récompense, c'est un formulaire.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Les trois barreaux, datés sur la ligne de parrainage ─────────────────
--
-- Des DATES et pas des booléens : « depuis quand » est la seule chose qui
-- permette, six mois plus tard, de répondre à un marchand qui conteste, et de
-- rejouer un barreau manqué sans rejouer les autres.

ALTER TABLE referrals
  ADD COLUMN IF NOT EXISTS signup_rewarded_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS activated_at       TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS paid_at            TIMESTAMPTZ,
  -- L'offre que le filleul a payée. Sert au suivi, jamais au calcul de la
  -- récompense : celle-ci dépend de l'offre du PARRAIN, pas de la sienne.
  ADD COLUMN IF NOT EXISTS paid_plan_key      TEXT;

COMMENT ON COLUMN referrals.activated_at IS 'Filleul actif : compte assez vieux ET ventes réellement enregistrées.';
COMMENT ON COLUMN referrals.paid_at       IS 'Premier mois encaissé du filleul — le seul barreau qui déclenche une réduction.';

-- Le balayage quotidien cherche les filleuls pas encore actifs : c'est cet
-- index qu'il utilise.
CREATE INDEX IF NOT EXISTS referrals_pending_activation_idx
  ON referrals(created_at) WHERE activated_at IS NULL;

-- ── 2. Les plafonds relevés ────────────────────────────────────────────────
--
-- Un quota n'est pas une capacité : `feature_grants` ouvre une PORTE
-- (« vous avez les Rapports »), `quota_grants` déplace un MUR (« vous avez 60
-- produits au lieu de 50 »). Deux tables, parce que le code qui les lit ne se
-- pose pas la même question — l'un demande oui/non, l'autre demande combien.
--
-- Une seule ligne par (marchand, quota, origine) : les parrainages successifs
-- ADDITIONNENT dans la même ligne, sous plafond. Sans quoi il faudrait sommer
-- des lignes à chaque lecture, et le plafond « +50 au maximum » se
-- contournerait en empilant.

CREATE TABLE IF NOT EXISTS quota_grants (
  user_id     UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- 'ai_questions' | 'products' — les clés vivent dans `lib/quotas.ts`.
  quota       TEXT        NOT NULL,
  amount      INT         NOT NULL DEFAULT 0 CHECK (amount >= 0),
  source      TEXT        NOT NULL DEFAULT 'referral',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, quota, source)
);

COMMENT ON TABLE quota_grants IS 'Un plafond relevé par-dessus l''offre. L''offre, elle, ne bouge pas.';

ALTER TABLE quota_grants ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS quota_grants_self_select ON quota_grants;
CREATE POLICY quota_grants_self_select ON quota_grants
  FOR SELECT USING (auth.uid() = user_id);

-- Aucune politique d'écriture : seul `add_quota_grant()` en pose.

-- Ajoute au plafond, sans jamais dépasser `p_cap`.
--
-- Le plafond s'applique À L'INSERTION comme à la mise à jour : un premier
-- parrainage qui apporterait plus que le maximum doit être écrêté lui aussi.
-- `p_cap` à NULL veut dire « sans plafond » (les questions IA n'en ont pas).
CREATE OR REPLACE FUNCTION add_quota_grant(
  p_user   UUID,
  p_quota  TEXT,
  p_amount INT,
  p_cap    INT  DEFAULT NULL,
  p_source TEXT DEFAULT 'referral'
)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cap    INT := COALESCE(p_cap, 2147483647);
  v_amount INT;
BEGIN
  INSERT INTO quota_grants (user_id, quota, amount, source)
  VALUES (p_user, p_quota, LEAST(p_amount, v_cap), p_source)
  ON CONFLICT (user_id, quota, source) DO UPDATE
    SET amount     = LEAST(quota_grants.amount + p_amount, v_cap),
        updated_at = NOW()
  RETURNING amount INTO v_amount;

  RETURN v_amount;
END;
$$;

REVOKE ALL ON FUNCTION add_quota_grant(UUID, TEXT, INT, INT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION add_quota_grant(UUID, TEXT, INT, INT, TEXT) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION add_quota_grant(UUID, TEXT, INT, INT, TEXT) TO service_role;

-- ── 3. Les bons de réduction vers l'offre du dessus ────────────────────────
--
-- UN FILLEUL PAYANT = UN BON. Pas une remise permanente posée sur le compte :
-- un bon nominatif, qui vise une offre précise, qui vaut un nombre de mois
-- fini, et qui s'éteint tout seul s'il n'est pas utilisé.
--
-- `target_plan_key` à NULL = « valable sur n'importe quelle offre ». C'est le
-- bon de bienvenue du filleul (−50 % sur son premier mois) : il ne sait pas
-- encore quelle offre il prendra, et on n'a aucune raison de le pousser vers
-- l'une plutôt que l'autre à cet instant.
--
-- Ce qui n'est PAS ici, volontairement : le pourcentage effectivement appliqué.
-- Il se recalcule à l'encaissement, sous plafond global, à partir des bons
-- vivants. Un pourcentage figé aurait vieilli — et un bon écrit hier ne doit
-- pas pouvoir remiser un tarif d'après-demain sous le plancher.

CREATE TABLE IF NOT EXISTS upgrade_credits (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- Clé technique d'offre ('Business Pilot', 'Expert'…) ou NULL = toute offre.
  target_plan_key TEXT,
  percent_off     INT         NOT NULL CHECK (percent_off BETWEEN 1 AND 100),
  months_total    INT         NOT NULL CHECK (months_total >= 1),
  months_used     INT         NOT NULL DEFAULT 0 CHECK (months_used >= 0),
  -- 'referral_paid' (le parrain) | 'welcome' (le filleul) | 'manual'
  source          TEXT        NOT NULL DEFAULT 'referral_paid',
  referral_id     UUID        REFERENCES referrals(id) ON DELETE CASCADE,
  expires_at      TIMESTAMPTZ NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT upgrade_credits_not_overused CHECK (months_used <= months_total),
  -- Une même ligne de parrainage produit au plus un bon par origine : celui du
  -- parrain ('referral_paid') et celui du filleul ('welcome') cohabitent, mais
  -- rejouer l'encaissement n'en fabrique pas un troisième.
  UNIQUE (referral_id, source)
);

CREATE INDEX IF NOT EXISTS upgrade_credits_usable_idx
  ON upgrade_credits(user_id, target_plan_key, expires_at)
  WHERE months_used < months_total;

COMMENT ON TABLE upgrade_credits IS 'Un bon de réduction daté, vers une offre précise. Jamais une remise permanente.';

ALTER TABLE upgrade_credits ENABLE ROW LEVEL SECURITY;

-- Le marchand lit ses bons — l'écran de parrainage et la caisse en ont besoin
-- pour annoncer le montant qu'il paiera réellement.
DROP POLICY IF EXISTS upgrade_credits_self_select ON upgrade_credits;
CREATE POLICY upgrade_credits_self_select ON upgrade_credits
  FOR SELECT USING (auth.uid() = user_id);

-- Émet un bon, une seule fois par (parrainage, origine).
--
-- Rend l'identifiant du bon, ou NULL s'il existait déjà — ce qui arrive dès
-- qu'un encaissement est rejoué. Le silence est la bonne réponse : le bon est
-- là, il n'y a rien à faire de plus.
CREATE OR REPLACE FUNCTION mint_upgrade_credit(
  p_user     UUID,
  p_plan     TEXT,
  p_percent  INT,
  p_months   INT,
  p_days     INT,
  p_source   TEXT,
  p_referral UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id UUID;
BEGIN
  INSERT INTO upgrade_credits (
    user_id, target_plan_key, percent_off, months_total, source, referral_id, expires_at
  )
  VALUES (
    p_user, p_plan, p_percent, p_months, p_source, p_referral,
    NOW() + (p_days || ' days')::INTERVAL
  )
  ON CONFLICT (referral_id, source) DO NOTHING
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

-- Consomme un mois sur chacun des bons désignés.
--
-- Le filtre est REJOUÉ ici — bon vivant, mois restants — parce qu'entre le
-- devis affiché à la caisse et l'encaissement, il peut s'être écoulé des jours.
-- Rend le nombre de bons réellement décomptés.
CREATE OR REPLACE FUNCTION consume_upgrade_credits(p_ids UUID[])
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INT;
BEGIN
  UPDATE upgrade_credits
     SET months_used = months_used + 1,
         updated_at  = NOW()
   WHERE id = ANY(p_ids)
     AND months_used < months_total
     AND expires_at > NOW();

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION mint_upgrade_credit(UUID, TEXT, INT, INT, INT, TEXT, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION mint_upgrade_credit(UUID, TEXT, INT, INT, INT, TEXT, UUID) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION mint_upgrade_credit(UUID, TEXT, INT, INT, INT, TEXT, UUID) TO service_role;

REVOKE ALL ON FUNCTION consume_upgrade_credits(UUID[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION consume_upgrade_credits(UUID[]) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION consume_upgrade_credits(UUID[]) TO service_role;

-- ── 4. Le compteur de questions ────────────────────────────────────────────
--
-- Les offres annoncent « 30 questions par mois » depuis le premier jour, et
-- personne ne les comptait : l'assistant vérifiait l'offre, jamais le nombre.
-- Un « +10 questions par filleul » posé au-dessus d'un plafond qui n'existe pas
-- serait une récompense fictive — et ce produit n'affiche pas de chiffres qui
-- ne sont pas vrais.
--
-- Le compteur vit dans SA table, et pas dans `ai_messages` : une question coûte
-- de l'argent au moment où elle part vers le modèle, qu'elle soit ensuite
-- enregistrée dans une conversation ou non.

CREATE TABLE IF NOT EXISTS ai_usage (
  user_id    UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- Premier jour du mois. Le mois civil, parce que c'est ce que le marchand lit
  -- sur la page de prix : « 30 questions par mois ».
  period     DATE        NOT NULL,
  used       INT         NOT NULL DEFAULT 0 CHECK (used >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, period)
);

COMMENT ON TABLE ai_usage IS 'Questions posées à l''assistant, par marchand et par mois civil.';

ALTER TABLE ai_usage ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ai_usage_self_select ON ai_usage;
CREATE POLICY ai_usage_self_select ON ai_usage
  FOR SELECT USING (auth.uid() = user_id);

-- Décompte une question, ou refuse.
--
-- ── Deux réservoirs, dans cet ordre ────────────────────────────────────────
--
--   1. le quota MENSUEL de l'offre (30 sur Kwasans), qui se remet à zéro le
--      1ᵉʳ du mois et ne se reporte pas ;
--   2. le PAQUET gagné par parrainage (+10 par filleul), qui ne se remet pas à
--      zéro et se vide question par question.
--
-- L'ordre n'est pas neutre : servir le paquet en premier reviendrait à faire
-- payer au marchand ses questions offertes avec celles qu'il a déjà achetées.
-- Il ne pioche dans son paquet que quand son offre est épuisée — ce qui est
-- exactement le moment où il sent la limite, et donc le moment où le paquet se
-- remarque.
--
-- Le paquet est aussi ce qui ouvre l'assistant à un marchand Esansyel, dont le
-- quota d'offre vaut zéro. C'est le but : l'assistant est le meilleur
-- avant-goût des offres du dessus, et un avant-goût qu'on ne peut pas goûter
-- n'en est pas un.
--
-- Le test et l'incrément sont la MÊME instruction (`… AND used < p_allowance`) :
-- deux onglets ouverts sur l'assistant ne doivent pas pouvoir passer la 30ᵉ
-- question deux fois. `p_allowance` négatif = illimité (offre Elit).
CREATE OR REPLACE FUNCTION consume_ai_question(p_user UUID, p_allowance INT)
RETURNS TABLE (allowed BOOLEAN, used INT, bonus_left INT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_period DATE := date_trunc('month', NOW())::DATE;
  v_used   INT;
  v_bonus  INT;
BEGIN
  INSERT INTO ai_usage (user_id, period, used)
  VALUES (p_user, v_period, 0)
  ON CONFLICT (user_id, period) DO NOTHING;

  IF p_allowance < 0 THEN
    UPDATE ai_usage AS u SET used = u.used + 1, updated_at = NOW()
     WHERE u.user_id = p_user AND u.period = v_period
     RETURNING u.used INTO v_used;
    RETURN QUERY SELECT TRUE, v_used, 0;
    RETURN;
  END IF;

  -- Réservoir 1 : le quota de l'offre.
  UPDATE ai_usage AS u SET used = u.used + 1, updated_at = NOW()
   WHERE u.user_id = p_user AND u.period = v_period AND u.used < p_allowance
   RETURNING u.used INTO v_used;

  IF v_used IS NOT NULL THEN
    SELECT COALESCE(SUM(g.amount), 0) INTO v_bonus
      FROM quota_grants AS g
     WHERE g.user_id = p_user AND g.quota = 'ai_questions';
    RETURN QUERY SELECT TRUE, v_used, v_bonus;
    RETURN;
  END IF;

  -- Réservoir 2 : le paquet gagné. `FOR UPDATE` verrouille la ligne choisie —
  -- sans lui, deux questions simultanées décrémenteraient le même solde une
  -- seule fois.
  WITH pick AS (
    SELECT g.source
      FROM quota_grants AS g
     WHERE g.user_id = p_user AND g.quota = 'ai_questions' AND g.amount > 0
     ORDER BY g.updated_at
     LIMIT 1
     FOR UPDATE
  )
  UPDATE quota_grants AS g
     SET amount = g.amount - 1, updated_at = NOW()
    FROM pick
   WHERE g.user_id = p_user AND g.quota = 'ai_questions' AND g.source = pick.source
  RETURNING g.amount INTO v_bonus;

  IF v_bonus IS NULL THEN
    SELECT u.used INTO v_used
      FROM ai_usage AS u WHERE u.user_id = p_user AND u.period = v_period;
    RETURN QUERY SELECT FALSE, COALESCE(v_used, 0), 0;
    RETURN;
  END IF;

  UPDATE ai_usage AS u SET used = u.used + 1, updated_at = NOW()
   WHERE u.user_id = p_user AND u.period = v_period
   RETURNING u.used INTO v_used;

  RETURN QUERY SELECT TRUE, v_used, v_bonus;
END;
$$;

REVOKE ALL ON FUNCTION consume_ai_question(UUID, INT) FROM PUBLIC;
REVOKE ALL ON FUNCTION consume_ai_question(UUID, INT) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION consume_ai_question(UUID, INT) TO service_role;

-- ── 5. Ce que le paiement doit garder ──────────────────────────────────────
--
-- Sans ces colonnes, un encaissement remisé serait indistinguable d'un
-- encaissement partiel : `amount_htg` seul ne dit pas s'il manque 40 % ou si
-- 40 % ont été offerts. Et `credit_ids` est ce qui permet de ne décompter les
-- bons qu'à l'APPROBATION — un paiement refusé ne doit pas brûler un bon.

ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS base_amount_htg    NUMERIC,
  ADD COLUMN IF NOT EXISTS discount_percent   INT    NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS credit_ids         UUID[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS credits_settled_at TIMESTAMPTZ;

COMMENT ON COLUMN payments.credit_ids IS 'Bons appliqués au devis. Décomptés à l''approbation, jamais avant.';

GRANT SELECT ON quota_grants, upgrade_credits, ai_usage TO authenticated;
GRANT ALL    ON quota_grants, upgrade_credits, ai_usage TO service_role;
