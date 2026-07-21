-- ─────────────────────────────────────────────────────────────────────────────
-- RBAC: rbac_roles, rbac_permissions, rbac_role_permissions, employee_roles
-- Prefixed with "rbac_" to avoid conflicts with system/existing tables.
-- Self-contained: no dependency on other migrations.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 0. Helper (idempotent) ────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION fn_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

-- ── 1. rbac_permissions (global catalog) ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS rbac_permissions (
  name        TEXT PRIMARY KEY,
  label       TEXT NOT NULL,
  category    TEXT NOT NULL,
  description TEXT
);

-- ── 2. rbac_roles ─────────────────────────────────────────────────────────────
-- System roles: company_id IS NULL
-- Custom roles: company_id = business UUID
CREATE TABLE IF NOT EXISTS rbac_roles (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  UUID        REFERENCES businesses(id) ON DELETE CASCADE,
  name        TEXT        NOT NULL,
  label       TEXT        NOT NULL,
  color       TEXT        NOT NULL DEFAULT '#64748b',
  is_system   BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Partial unique indexes to handle nullable company_id correctly
CREATE UNIQUE INDEX IF NOT EXISTS rbac_roles_system_uq
  ON rbac_roles (name) WHERE company_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS rbac_roles_company_uq
  ON rbac_roles (company_id, name) WHERE company_id IS NOT NULL;

-- ── 3. rbac_role_permissions ──────────────────────────────────────────────────
-- No FK on permission_name — validated at application level to avoid
-- issues with pre-existing tables or partial migrations.
CREATE TABLE IF NOT EXISTS rbac_role_permissions (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      UUID        REFERENCES businesses(id) ON DELETE CASCADE,
  role_name       TEXT        NOT NULL,
  permission_name TEXT        NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS rbac_rp_system_uq
  ON rbac_role_permissions (role_name, permission_name) WHERE company_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS rbac_rp_company_uq
  ON rbac_role_permissions (company_id, role_name, permission_name) WHERE company_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_rbac_rp_lookup
  ON rbac_role_permissions (company_id, role_name);

-- ── 4. employee_roles ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS employee_roles (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  UUID        NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  user_id     UUID        NOT NULL,
  role_name   TEXT        NOT NULL,
  assigned_by UUID,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (company_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_employee_roles_lookup
  ON employee_roles (company_id, user_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- Seed rbac_permissions catalog
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO rbac_permissions (name, label, category, description) VALUES
  ('sales:read',       'Voir les ventes',          'Ventes',       'Consulter la liste et le détail des ventes'),
  ('sales:create',     'Créer une vente',           'Ventes',       'Enregistrer une nouvelle vente'),
  ('sales:update',     'Modifier une vente',        'Ventes',       'Modifier une vente existante'),
  ('sales:delete',     'Supprimer une vente',       'Ventes',       'Supprimer une vente'),
  ('purchases:read',   'Voir les achats',           'Achats',       'Consulter les achats fournisseurs'),
  ('purchases:create', 'Créer un achat',            'Achats',       'Enregistrer un achat'),
  ('purchases:update', 'Modifier un achat',         'Achats',       'Modifier un achat existant'),
  ('purchases:delete', 'Supprimer un achat',        'Achats',       'Supprimer un achat'),
  ('inventory:read',   'Voir l''inventaire',        'Inventaire',   'Consulter le stock'),
  ('inventory:write',  'Modifier l''inventaire',    'Inventaire',   'Ajuster le stock manuellement'),
  ('products:read',    'Voir les produits',         'Produits',     'Consulter le catalogue produits'),
  ('products:write',   'Gérer les produits',        'Produits',     'Créer, modifier, supprimer des produits'),
  ('expenses:read',    'Voir les dépenses',         'Dépenses',     'Consulter les dépenses'),
  ('expenses:create',  'Créer une dépense',         'Dépenses',     'Enregistrer une dépense'),
  ('expenses:update',  'Modifier une dépense',      'Dépenses',     'Modifier une dépense existante'),
  ('expenses:delete',  'Supprimer une dépense',     'Dépenses',     'Supprimer une dépense'),
  ('clients:read',     'Voir les clients',          'Clients',      'Consulter la liste des clients'),
  ('clients:write',    'Gérer les clients',         'Clients',      'Créer et modifier des clients'),
  ('suppliers:read',   'Voir les fournisseurs',     'Fournisseurs', 'Consulter les fournisseurs'),
  ('suppliers:write',  'Gérer les fournisseurs',    'Fournisseurs', 'Créer et modifier des fournisseurs'),
  ('reports:read',     'Voir les rapports',         'Finance',      'Consulter les rapports financiers'),
  ('reports:export',   'Exporter les rapports',     'Finance',      'Exporter les rapports en PDF/Excel'),
  ('debts:read',       'Voir les dettes',           'Finance',      'Consulter les dettes clients'),
  ('debts:write',      'Gérer les dettes',          'Finance',      'Enregistrer et modifier les dettes'),
  ('ai:use',           'Utiliser Pilot AI',         'Intelligence', 'Accéder à l''assistant IA'),
  ('employees:read',   'Voir les employés',         'Équipe',       'Consulter la liste des employés'),
  ('employees:invite', 'Inviter un employé',        'Équipe',       'Envoyer une invitation par email'),
  ('employees:update', 'Modifier un employé',       'Équipe',       'Modifier les infos d''un employé'),
  ('employees:remove', 'Retirer un employé',        'Équipe',       'Désactiver ou supprimer un employé'),
  ('settings:read',    'Voir les paramètres',       'Paramètres',   'Accéder aux paramètres de l''entreprise'),
  ('settings:write',   'Modifier les paramètres',   'Paramètres',   'Modifier les paramètres et l''abonnement'),
  ('stores:read',      'Voir les boutiques',        'Boutiques',    'Voir la liste des boutiques'),
  ('stores:create',    'Créer une boutique',        'Boutiques',    'Ajouter une nouvelle boutique'),
  ('stores:switch',    'Changer de boutique',       'Boutiques',    'Basculer entre les boutiques')
ON CONFLICT (name) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────────
-- Seed system roles
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO rbac_roles (company_id, name, label, color, is_system)
SELECT NULL, v.name, v.label, v.color, TRUE
FROM (VALUES
  ('owner',      'Propriétaire',   '#001F3F'),
  ('admin',      'Administrateur', '#7c3aed'),
  ('manager',    'Gérant',         '#2563eb'),
  ('cashier',    'Caissier',       '#0891b2'),
  ('accountant', 'Comptable',      '#059669'),
  ('employee',   'Employé',        '#d97706'),
  ('viewer',     'Lecteur',        '#64748b')
) AS v(name, label, color)
WHERE NOT EXISTS (
  SELECT 1 FROM rbac_roles r WHERE r.company_id IS NULL AND r.name = v.name
);

-- ─────────────────────────────────────────────────────────────────────────────
-- Seed system role_permissions
-- ─────────────────────────────────────────────────────────────────────────────

-- owner: all permissions
INSERT INTO rbac_role_permissions (company_id, role_name, permission_name)
SELECT NULL, 'owner', p.name FROM rbac_permissions p
WHERE NOT EXISTS (
  SELECT 1 FROM rbac_role_permissions rp
  WHERE rp.company_id IS NULL AND rp.role_name = 'owner' AND rp.permission_name = p.name
);

-- admin: all except stores:create
INSERT INTO rbac_role_permissions (company_id, role_name, permission_name)
SELECT NULL, 'admin', p.name FROM rbac_permissions p
WHERE p.name <> 'stores:create'
  AND NOT EXISTS (
    SELECT 1 FROM rbac_role_permissions rp
    WHERE rp.company_id IS NULL AND rp.role_name = 'admin' AND rp.permission_name = p.name
  );

-- manager
INSERT INTO rbac_role_permissions (company_id, role_name, permission_name)
SELECT NULL, 'manager', v.p
FROM (VALUES
  ('sales:read'),('sales:create'),('sales:update'),
  ('purchases:read'),('purchases:create'),('purchases:update'),
  ('inventory:read'),('inventory:write'),
  ('products:read'),('products:write'),
  ('expenses:read'),('expenses:create'),('expenses:update'),
  ('clients:read'),('clients:write'),
  ('suppliers:read'),('suppliers:write'),
  ('reports:read'),('reports:export'),
  ('debts:read'),('debts:write'),
  ('ai:use'),('employees:read'),('settings:read'),
  ('stores:read'),('stores:switch')
) AS v(p)
WHERE NOT EXISTS (
  SELECT 1 FROM rbac_role_permissions rp
  WHERE rp.company_id IS NULL AND rp.role_name = 'manager' AND rp.permission_name = v.p
);

-- cashier
INSERT INTO rbac_role_permissions (company_id, role_name, permission_name)
SELECT NULL, 'cashier', v.p
FROM (VALUES
  ('sales:read'),('sales:create'),
  ('inventory:read'),('products:read'),
  ('expenses:read'),('expenses:create'),
  ('clients:read'),('debts:read'),('stores:switch')
) AS v(p)
WHERE NOT EXISTS (
  SELECT 1 FROM rbac_role_permissions rp
  WHERE rp.company_id IS NULL AND rp.role_name = 'cashier' AND rp.permission_name = v.p
);

-- accountant
INSERT INTO rbac_role_permissions (company_id, role_name, permission_name)
SELECT NULL, 'accountant', v.p
FROM (VALUES
  ('sales:read'),('purchases:read'),('expenses:read'),
  ('reports:read'),('reports:export'),
  ('debts:read'),('inventory:read'),
  ('products:read'),('clients:read'),('suppliers:read')
) AS v(p)
WHERE NOT EXISTS (
  SELECT 1 FROM rbac_role_permissions rp
  WHERE rp.company_id IS NULL AND rp.role_name = 'accountant' AND rp.permission_name = v.p
);

-- employee
INSERT INTO rbac_role_permissions (company_id, role_name, permission_name)
SELECT NULL, 'employee', v.p
FROM (VALUES
  ('sales:read'),('sales:create'),
  ('products:read'),('inventory:read'),
  ('clients:read'),('expenses:read'),('expenses:create')
) AS v(p)
WHERE NOT EXISTS (
  SELECT 1 FROM rbac_role_permissions rp
  WHERE rp.company_id IS NULL AND rp.role_name = 'employee' AND rp.permission_name = v.p
);

-- viewer
INSERT INTO rbac_role_permissions (company_id, role_name, permission_name)
SELECT NULL, 'viewer', v.p
FROM (VALUES
  ('sales:read'),('purchases:read'),('inventory:read'),
  ('products:read'),('expenses:read'),('clients:read'),
  ('suppliers:read'),('reports:read'),('debts:read'),('stores:read')
) AS v(p)
WHERE NOT EXISTS (
  SELECT 1 FROM rbac_role_permissions rp
  WHERE rp.company_id IS NULL AND rp.role_name = 'viewer' AND rp.permission_name = v.p
);

-- ─────────────────────────────────────────────────────────────────────────────
-- RLS
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE rbac_permissions      ENABLE ROW LEVEL SECURITY;
ALTER TABLE rbac_roles            ENABLE ROW LEVEL SECURITY;
ALTER TABLE rbac_role_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE employee_roles        ENABLE ROW LEVEL SECURITY;

-- rbac_permissions: anyone authenticated can read
DROP POLICY IF EXISTS "rbac_permissions_read" ON rbac_permissions;
CREATE POLICY "rbac_permissions_read" ON rbac_permissions
  FOR SELECT USING (TRUE);

-- rbac_roles: system roles readable by all; company roles by members
DROP POLICY IF EXISTS "rbac_roles_read" ON rbac_roles;
CREATE POLICY "rbac_roles_read" ON rbac_roles
  FOR SELECT USING (
    company_id IS NULL OR
    EXISTS (
      SELECT 1 FROM business_members bm
      WHERE bm.business_id = rbac_roles.company_id
        AND bm.user_id = auth.uid()
        AND bm.is_active = TRUE
    )
  );

DROP POLICY IF EXISTS "rbac_roles_owner_manage" ON rbac_roles;
CREATE POLICY "rbac_roles_owner_manage" ON rbac_roles
  FOR ALL USING (
    company_id IS NOT NULL AND
    EXISTS (
      SELECT 1 FROM businesses b
      WHERE b.id = rbac_roles.company_id AND b.owner_id = auth.uid()
    )
  );

-- rbac_role_permissions: system readable by all; company by members
DROP POLICY IF EXISTS "rbac_rp_read" ON rbac_role_permissions;
CREATE POLICY "rbac_rp_read" ON rbac_role_permissions
  FOR SELECT USING (
    company_id IS NULL OR
    EXISTS (
      SELECT 1 FROM business_members bm
      WHERE bm.business_id = rbac_role_permissions.company_id
        AND bm.user_id = auth.uid()
        AND bm.is_active = TRUE
    )
  );

DROP POLICY IF EXISTS "rbac_rp_owner_manage" ON rbac_role_permissions;
CREATE POLICY "rbac_rp_owner_manage" ON rbac_role_permissions
  FOR ALL USING (
    company_id IS NOT NULL AND
    EXISTS (
      SELECT 1 FROM businesses b
      WHERE b.id = rbac_role_permissions.company_id AND b.owner_id = auth.uid()
    )
  );

-- employee_roles: members read; owner manage
DROP POLICY IF EXISTS "employee_roles_read" ON employee_roles;
CREATE POLICY "employee_roles_read" ON employee_roles
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM business_members bm
      WHERE bm.business_id = employee_roles.company_id
        AND bm.user_id = auth.uid()
        AND bm.is_active = TRUE
    )
  );

DROP POLICY IF EXISTS "employee_roles_owner_manage" ON employee_roles;
CREATE POLICY "employee_roles_owner_manage" ON employee_roles
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM businesses b
      WHERE b.id = employee_roles.company_id AND b.owner_id = auth.uid()
    )
  );
