-- ═════════════════════════════════════════════════════════════════════════════
-- Les vocaux — commande vocale, phase 1 (spécification « commande vocale et
-- matériel de caisse », §2)
--
-- Une ligne par vocal traité. Elle sert à trois choses :
--   · la limite d'usage : 50 vocaux par jour et par commerce (décision du
--     26/10/2026), réglable par `VOICE_DAILY_LIMIT` côté serveur ;
--   · la transcription brute, gardée avec ce qu'elle est devenue (§2.2 : « utile
--     pour le débogage et l'amélioration ») ;
--   · le lien vers les opérations confirmées.
--
-- L'AUDIO n'est jamais stocké : il est transcrit puis oublié (§2.4).
-- Purement additive : aucune table existante ne change.
-- ═════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS voice_notes (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id      UUID        NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  user_id          UUID        REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
  -- 'pending' : reçu, en cours ; 'ready' : brouillons rendus ; 'manual' :
  -- extraction impossible, la transcription est rendue pour saisie à la main ;
  -- 'failed' : transcription impossible.
  status           TEXT        NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending', 'ready', 'manual', 'failed')),
  transcription    TEXT,
  drafts           JSONB,
  provider         TEXT,
  attempts         SMALLINT    NOT NULL DEFAULT 0,
  -- Les brouillons confirmés : [{ "key": "…", "type": "sale", "ids": ["…"] }, …]
  -- (un second « Konfime » sur le même brouillon ne crée rien).
  confirmed        JSONB       NOT NULL DEFAULT '[]'::jsonb,
  recorded_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_voice_notes_biz_created ON voice_notes(business_id, created_at DESC);

ALTER TABLE voice_notes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS voice_notes_member_rw ON voice_notes;
CREATE POLICY voice_notes_member_rw ON voice_notes
  FOR ALL USING (is_business_member(business_id)) WITH CHECK (is_business_member(business_id));
GRANT SELECT, INSERT, UPDATE ON voice_notes TO authenticated;
