// ─────────────────────────────────────────────────────────────────────────────
// RBAC — Roles & Permissions
// ─────────────────────────────────────────────────────────────────────────────

export type Role =
  | 'owner'
  | 'admin'
  | 'manager'
  | 'cashier'
  | 'accountant'
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
  ],

  employee: [
    'sales:read',     'sales:create',
    'products:read',
    'inventory:read',
    'clients:read',
    'expenses:read',  'expenses:create',
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
  owner:      'Propriétaire',
  admin:      'Administrateur',
  manager:    'Gérant',
  cashier:    'Caissier',
  accountant: 'Comptable',
  employee:   'Employé',
  viewer:     'Lecteur',
};

export const ROLE_COLORS: Record<Role, string> = {
  owner:      '#001F3F',
  admin:      '#7c3aed',
  manager:    '#2563eb',
  cashier:    '#0891b2',
  accountant: '#059669',
  employee:   '#d97706',
  viewer:     '#64748b',
};

export const ROLE_ORDER: Role[] = ['owner', 'admin', 'manager', 'cashier', 'accountant', 'employee', 'viewer'];

/** Returns true if the given string is a valid Role */
export function isValidRole(r: string): r is Role {
  return ROLE_ORDER.includes(r as Role);
}
