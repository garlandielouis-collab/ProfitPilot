-- ══════════════════════════════════════════════════════════════════════════════
-- ACTIVITY LOGS — ProfitPilot
-- Immutable audit trail per company. INSERT only; no UPDATE/DELETE via RLS.
-- ══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS activity_logs (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  UUID        NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  user_id     UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  action      TEXT        NOT NULL,          -- 'create' | 'update' | 'delete' | 'archive' | 'login' | …
  entity      TEXT        NOT NULL,          -- 'sale' | 'product' | 'client' | 'expense' | 'company' | …
  entity_id   TEXT,                          -- UUID or human-readable ref of the affected record
  old_values  JSONB,
  new_values  JSONB,
  ip          TEXT,
  user_agent  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Fast lookup by company (list page) and by user (who did what)
CREATE INDEX IF NOT EXISTS idx_activity_logs_company
  ON activity_logs (company_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_activity_logs_user
  ON activity_logs (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_activity_logs_entity
  ON activity_logs (company_id, entity, created_at DESC);

-- ── RLS ──────────────────────────────────────────────────────────────────────

ALTER TABLE activity_logs ENABLE ROW LEVEL SECURITY;

-- Owner and members of the company can read their own logs
CREATE POLICY "activity_logs_read" ON activity_logs
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM businesses b
      WHERE b.id = activity_logs.company_id
        AND b.owner_id = auth.uid()
    )
    OR
    EXISTS (
      SELECT 1 FROM business_members bm
      WHERE bm.business_id = activity_logs.company_id
        AND bm.user_id     = auth.uid()
        AND bm.is_active   = TRUE
    )
  );

-- Service role only can insert (enforced by using service role key in the helper)
-- But we also allow authenticated users to insert their own logs
CREATE POLICY "activity_logs_insert" ON activity_logs
  FOR INSERT WITH CHECK (
    user_id = auth.uid()
    AND (
      EXISTS (
        SELECT 1 FROM businesses b
        WHERE b.id = activity_logs.company_id
          AND b.owner_id = auth.uid()
      )
      OR
      EXISTS (
        SELECT 1 FROM business_members bm
        WHERE bm.business_id = activity_logs.company_id
          AND bm.user_id     = auth.uid()
          AND bm.is_active   = TRUE
      )
    )
  );

-- No update or delete — logs are immutable
