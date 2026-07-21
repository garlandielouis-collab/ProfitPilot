-- ══════════════════════════════════════════════════════════════════════════════
-- EMPLOYEE INVITATIONS — ProfitPilot
-- Secure token-based invitation system for HR employees
-- ══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS employee_invitations (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   UUID        NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  employee_id  UUID        REFERENCES employees(id) ON DELETE SET NULL,
  email        TEXT        NOT NULL,
  role         TEXT        NOT NULL DEFAULT 'viewer',
  token        TEXT        NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(32), 'hex'),
  invited_by   UUID        NOT NULL REFERENCES auth.users(id),
  accepted_at  TIMESTAMPTZ,
  expires_at   TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '7 days',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE employee_invitations IS 'Invitation tokens for onboarding HR employees onto ProfitPilot.';

CREATE INDEX IF NOT EXISTS idx_emp_inv_token      ON employee_invitations(token)      WHERE accepted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_emp_inv_company    ON employee_invitations(company_id) WHERE accepted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_emp_inv_email      ON employee_invitations(email)      WHERE accepted_at IS NULL;

-- RLS
ALTER TABLE employee_invitations ENABLE ROW LEVEL SECURITY;

-- Owner can manage all invitations for their company
CREATE POLICY "emp_inv_owner_all" ON employee_invitations
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM businesses b
      WHERE b.id = employee_invitations.company_id
        AND b.owner_id = auth.uid()
    )
  );

-- Anyone can read their own invitation by email (used during accept flow)
-- Note: token validation is done via service role in API route (bypasses RLS)
