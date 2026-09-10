// ─────────────────────────────────────────────────────────────────────────────
// RBAC — Roles & Permissions
// ─────────────────────────────────────────────────────────────────────────────

// ── Les rôles, et pourquoi il y en a huit ───────────────────────────────────
//
// Cette union doit refléter EXACTEMENT l'énumération `member_role_type` en
// base, parce que `getBusinessContext()` lit `business_members.role` et le
// transtype ici sans filet.
//
// Elles avaient divergé. L'énumération portait `inventory_manager`, absent
// d'ici : `ROLE_PERMISSIONS['inventory_manager']` valait `undefined`, et
// `roleHasPermission()` renvoyait `false` pour tout. Un gestionnaire de stock
// ouvrait l'application sur une interface vide, sans un message pour lui dire
// pourquoi. Symétriquement, `manager` et `employee` vivaient ici sans exister
// en base — deux branches mortes, puisque l'énumération refusait de les écrire.
//
// La migration 20260910_member_role_reconciliation.sql a ajouté les deux
// manquants côté base ; `inventory_manager` rejoint le registre ici. Toute
// modification de cette liste doit désormais aller par paire.
export type Role =
  | 'owner'
  | 'admin'
  | 'manager'
  | 'cashier'
  | 'accountant'
  | 'inventory_manager'
  | 'employee'
  | 'viewer';

export type Permission =
  // Sales
  | 'sales:read'     | 'sales:create'  | 'sales:update'  | 'sales:delete'
  // Purchases
  | 'purchases:read' | 'purchases:create' | 'purchases:update' | 'purchases:delete'
  // Inventory & Products
  | 'inventory:read' | 'inventory:write'
  | 'products:read'  | 'products:write'
  // Expenses
  | 'expenses:read'  | 'expenses:create' | 'expenses:update' | 'expenses:delete'
  // Clients & Suppliers
  | 'clients:read'   | 'clients:write'
  | 'suppliers:read' | 'suppliers:write'
  // Financial
  | 'reports:read'   | 'reports:export'
  | 'debts:read'     | 'debts:write'
  // AI
  | 'ai:use'
  // Documents — le centre documentaire (§41)
  //
  // Trois permissions de lecture SÉPARÉES par sensibilité, et c'est le cœur du
  // modèle : `documents:read` ouvre l'opérationnel, pas les fiches de paie. Le
  // comptable lit le financier sans lire les RH ; le gérant lit le juridique
  // sans lire ni l'un ni l'autre. Une permission unique aurait rendu ces trois
  // phrases inexprimables.
  //
  // La même distinction existe en base, portée par `document_types.sensitivity`
  // et lue par `can_read_document()`. Les deux doivent rester d'accord.
  | 'documents:read'      | 'documents:create' | 'documents:update' | 'documents:delete'
  | 'documents:read_financial' | 'documents:read_hr' | 'documents:read_legal'
  | 'documents:share'     | 'documents:approve'
  | 'documents:manage_templates'
  // Team management
  | 'employees:read' | 'employees:invite' | 'employees:update' | 'employees:remove'
  // Company settings
  | 'settings:read'  | 'settings:write'
  // Multi-store
  | 'stores:read'    | 'stores:create'   | 'stores:switch';

export const ALL_PERMISSIONS: Permission[] = [
  'sales:read',      'sales:create',     'sales:update',     'sales:delete',
  'purchases:read',  'purchases:create', 'purchases:update', 'purchases:delete',
  'inventory:read',  'inventory:write',
  'products:read',   'products:write',
  'expenses:read',   'expenses:create',  'expenses:update',  'expenses:delete',
  'clients:read',    'clients:write',
  'suppliers:read',  'suppliers:write',
  'reports:read',    'reports:export',
  'debts:read',      'debts:write',
  'ai:use',
  'documents:read',           'documents:create',  'documents:update', 'documents:delete',
  'documents:read_financial', 'documents:read_hr', 'documents:read_legal',
  'documents:share',          'documents:approve', 'documents:manage_templates',
  'employees:read',  'employees:invite', 'employees:update', 'employees:remove',
  'settings:read',   'settings:write',
  'stores:read',     'stores:create',    'stores:switch',
];

export const PERMISSION_CATEGORIES: Record<string, Permission[]> = {
  'Ventes':       ['sales:read', 'sales:create', 'sales:update', 'sales:delete'],
  'Achats':       ['purchases:read', 'purchases:create', 'purchases:update', 'purchases:delete'],
  'Inventaire':   ['inventory:read', 'inventory:write'],
  'Produits':     ['products:read', 'products:write'],
  'Dépenses':     ['expenses:read', 'expenses:create', 'expenses:update', 'expenses:delete'],
  'Clients':      ['clients:read', 'clients:write'],
  'Fournisseurs': ['suppliers:read', 'suppliers:write'],
  'Finance':      ['reports:read', 'reports:export', 'debts:read', 'debts:write'],
  'Intelligence': ['ai:use'],
  'Documents':    ['documents:read', 'documents:create', 'documents:update', 'documents:delete',
                   'documents:read_financial', 'documents:read_hr', 'documents:read_legal',
                   'documents:share', 'documents:approve', 'documents:manage_templates'],
  'Équipe':       ['employees:read', 'employees:invite', 'employees:update', 'employees:remove'],
  'Paramètres':   ['settings:read', 'settings:write'],
  'Boutiques':    ['stores:read', 'stores:create', 'stores:switch'],
};

export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  owner: ALL_PERMISSIONS,

  admin: ALL_PERMISSIONS.filter((p) => p !== 'stores:create'),

  manager: [
    'sales:read',     'sales:create',     'sales:update',
    'purchases:read', 'purchases:create', 'purchases:update',
    'inventory:read', 'inventory:write',
    'products:read',  'products:write',
    'expenses:read',  'expenses:create',  'expenses:update',
    'clients:read',   'clients:write',
    'suppliers:read', 'suppliers:write',
    'reports:read',   'reports:export',
    'debts:read',     'debts:write',
    'ai:use',
    // Il pilote l'opérationnel et signe les contrats fournisseurs : le
    // juridique lui est ouvert. Le financier et les dossiers du personnel ne le
    // sont pas — ce sont les deux seules choses qu'un gérant n'a pas à voir.
    'documents:read',  'documents:create', 'documents:update',
    'documents:read_legal', 'documents:share', 'documents:approve',
    'employees:read',
    'settings:read',
    'stores:read',    'stores:switch',
  ],

  cashier: [
    'sales:read',     'sales:create',
    'inventory:read',
    'products:read',
    'expenses:read',  'expenses:create',
    'clients:read',
    'debts:read',
    // Déposer la photo d'un reçu depuis le comptoir, et relire ce qu'on lui a
    // explicitement partagé. Rien d'autre.
    'documents:read', 'documents:create',
    'stores:switch',
  ],

  accountant: [
    'sales:read',
    'purchases:read',
    'expenses:read',
    'reports:read',   'reports:export',
    'debts:read',
    'inventory:read',
    'products:read',
    'clients:read',
    'suppliers:read',
    // Le seul rôle non dirigeant à qui les documents financiers sont ouverts —
    // c'est sa raison d'être. Les dossiers du personnel restent fermés.
    'documents:read', 'documents:create', 'documents:read_financial',
  ],

  // Le rôle qui existait en base sans exister ici. Sans cette entrée,
  // `roleHasPermission()` lui refusait absolument tout.
  inventory_manager: [
    'inventory:read', 'inventory:write',
    'products:read',  'products:write',
    'purchases:read', 'purchases:create',
    'suppliers:read',
    'sales:read',
    'documents:read', 'documents:create', 'documents:update',
  ],

  employee: [
    'sales:read',     'sales:create',
    'products:read',
    'inventory:read',
    'clients:read',
    'expenses:read',  'expenses:create',
    'documents:read', 'documents:create',
  ],

  viewer: [
    'sales:read',
    'purchases:read',
    'inventory:read',
    'products:read',
    'expenses:read',
    'clients:read',
    'suppliers:read',
    'reports:read',
    'debts:read',
    'documents:read',
    'stores:read',
  ],
};

export function roleHasPermission(role: Role, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
}

export function getPermissionsForRole(role: Role): Permission[] {
  return ROLE_PERMISSIONS[role] ?? [];
}

export const ROLE_LABELS: Record<Role, string> = {
  owner:             'Propriétaire',
  admin:             'Administrateur',
  manager:           'Gérant',
  cashier:           'Caissier',
  accountant:        'Comptable',
  inventory_manager: 'Gestionnaire de stock',
  employee:          'Employé',
  viewer:            'Lecteur',
};

export const ROLE_COLORS: Record<Role, string> = {
  owner:             '#001F3F',
  admin:             '#7c3aed',
  manager:           '#2563eb',
  cashier:           '#0891b2',
  accountant:        '#059669',
  inventory_manager: '#0d9488',
  employee:          '#d97706',
  viewer:            '#64748b',
};

export const ROLE_ORDER: Role[] = [
  'owner', 'admin', 'manager', 'cashier', 'accountant', 'inventory_manager', 'employee', 'viewer',
];

/** Returns true if the given string is a valid Role */
export function isValidRole(r: string): r is Role {
  return ROLE_ORDER.includes(r as Role);
}
