-- ══════════════════════════════════════════════════════════════════════════════
-- EMPLOYEES HR MODULE — ProfitPilot
-- ══════════════════════════════════════════════════════════════════════════════

-- ── 0. Helper fn_set_updated_at (idempotent) ─────────────────────────────────
CREATE OR REPLACE FUNCTION fn_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

-- ── 1. Drop and recreate employees table ──────────────────────────────────────
-- Safe because this is initial setup. Drops old partial/wrong-schema table.
DROP TABLE IF EXISTS employees CASCADE;

CREATE TABLE employees (
  id               UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id       UUID         NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  first_name       TEXT         NOT NULL,
  last_name        TEXT         NOT NULL,
  email            TEXT,
  phone            TEXT,
  position         TEXT,
  avatar_url       TEXT,
  status           TEXT         NOT NULL DEFAULT 'actif'
                                CHECK (status IN ('actif', 'inactif', 'conge')),
  hire_date        DATE,
  salary           NUMERIC(12,2),
  salary_currency  TEXT         NOT NULL DEFAULT 'HTG',
  notes            TEXT,
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  deleted_at       TIMESTAMPTZ
);

COMMENT ON TABLE employees IS 'HR employee records. Distinct from business_members (access control).';

-- ── 2. Indexes ────────────────────────────────────────────────────────────────
CREATE INDEX idx_employees_company ON employees(company_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_employees_status  ON employees(company_id, status) WHERE deleted_at IS NULL;
CREATE INDEX idx_employees_email   ON employees(email) WHERE deleted_at IS NULL AND email IS NOT NULL;

-- ── 3. Trigger ────────────────────────────────────────────────────────────────
CREATE TRIGGER trg_employees_updated_at
  BEFORE UPDATE ON employees
  FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

-- ── 4. RLS ────────────────────────────────────────────────────────────────────
ALTER TABLE employees ENABLE ROW LEVEL SECURITY;

-- Owner: full access
CREATE POLICY "employees_owner_all" ON employees
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM businesses b
      WHERE b.id = employees.company_id
        AND b.owner_id = auth.uid()
    )
  );

-- Members: read-only (inlined — no dependency on fn_is_member)
CREATE POLICY "employees_member_view" ON employees
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM business_members bm
      WHERE bm.business_id = employees.company_id
        AND bm.user_id     = auth.uid()
        AND bm.is_active   = TRUE
    )
  );
