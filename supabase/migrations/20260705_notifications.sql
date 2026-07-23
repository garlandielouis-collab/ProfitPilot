-- ── Notifications ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS notifications (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,  -- recipient
  triggered_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,          -- actor
  type         TEXT NOT NULL,    -- 'sale_created' | 'stock_low' | 'employee_created' | ...
  title        TEXT NOT NULL,
  body         TEXT,
  entity       TEXT,             -- 'sale' | 'product' | 'expense' | ...
  entity_id    TEXT,
  data         JSONB,
  read_at      TIMESTAMPTZ DEFAULT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_read
  ON notifications (user_id, read_at, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notifications_company_created
  ON notifications (company_id, created_at DESC);

-- RLS
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "notifications_select_own"
  ON notifications FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "notifications_update_own"
  ON notifications FOR UPDATE
  USING (user_id = auth.uid());

-- Service role inserts (bypasses RLS via service key)
CREATE POLICY "notifications_insert_service"
  ON notifications FOR INSERT
  WITH CHECK (true);

-- ── Notification preferences ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS notification_preferences (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  type       TEXT NOT NULL,   -- notification type or 'all'
  enabled    BOOLEAN NOT NULL DEFAULT true,
  UNIQUE (user_id, company_id, type)
);

ALTER TABLE notification_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "notif_prefs_own"
  ON notification_preferences FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ── Enable Realtime ────────────────────────────────────────────────────────────
-- Run in Supabase dashboard under Database → Replication → supabase_realtime
-- publication, or enable via the Realtime tab. SQL equivalent:
ALTER PUBLICATION supabase_realtime ADD TABLE notifications;
