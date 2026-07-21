-- Login sessions table for security audit trail
CREATE TABLE IF NOT EXISTS login_sessions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  business_id  UUID REFERENCES businesses(id) ON DELETE SET NULL,
  ip           TEXT,
  user_agent   TEXT,
  browser      TEXT,
  device_type  TEXT,  -- 'desktop' | 'mobile' | 'tablet'
  os           TEXT,
  country      TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at   TIMESTAMPTZ DEFAULT NULL,
  revoked_by   UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_login_sessions_user_created
  ON login_sessions (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_login_sessions_business_created
  ON login_sessions (business_id, created_at DESC);

-- RLS
ALTER TABLE login_sessions ENABLE ROW LEVEL SECURITY;

-- Users can see their own sessions
CREATE POLICY "login_sessions_select_own"
  ON login_sessions FOR SELECT
  USING (user_id = auth.uid());

-- Authenticated users can insert their own session
CREATE POLICY "login_sessions_insert_own"
  ON login_sessions FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- Users can revoke their own sessions (update revoked_at only)
CREATE POLICY "login_sessions_update_own"
  ON login_sessions FOR UPDATE
  USING (user_id = auth.uid());
