'use client';

import { useEffect, useState, useTransition } from 'react';
import {
  listRoles,
  listPermissions,
  getCompanyRbacMatrix,
  saveRolePermissions,
  createCustomRole,
  deleteCustomRole,
  type RbacRole,
  type PermissionRecord,
} from '../actions/rbac';
import { ROLE_ORDER, ROLE_COLORS, ROLE_LABELS } from '../../lib/rbac';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const SYSTEM_ROLES = ROLE_ORDER;

const COLOR_PRESETS = [
  '#001F3F', '#64748b', '#1d4ed8', '#0891b2',
  '#50c878', '#d97706', '#dc2626', '#64748b',
];

function Badge({ label, color }: { label: string; color: string }) {
  return (
    <span
      className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold text-white"
      style={{ backgroundColor: color }}
    >
      {label}
    </span>
  );
}

function Spinner() {
  return <div className="h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-[#001F3F]" />;
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function RolesPage() {
  const [roles,       setRoles]       = useState<RbacRole[]>([]);
  const [permissions, setPermissions] = useState<PermissionRecord[]>([]);
  const [matrix,      setMatrix]      = useState<Record<string, string[]>>({});
  const [activeRole,  setActiveRole]  = useState<string>('owner');
  const [draft,       setDraft]       = useState<Record<string, Set<string>>>({});
  const [loading,     setLoading]     = useState(true);
  const [saving,      setSaving]      = useState(false);
  const [saved,       setSaved]       = useState(false);
  const [error,       setError]       = useState('');

  // New role modal
  const [showNewRole, setShowNewRole] = useState(false);
  const [newName,     setNewName]     = useState('');
  const [newLabel,    setNewLabel]    = useState('');
  const [newColor,    setNewColor]    = useState(COLOR_PRESETS[4]);
  const [creating,    startCreating]  = useTransition();

  // Delete
  const [confirmDelete, setConfirmDelete] = useState<RbacRole | null>(null);
  const [deleting,      startDeleting]    = useTransition();

  // Load data
  useEffect(() => {
    Promise.all([listRoles(), listPermissions(), getCompanyRbacMatrix()])
      .then(([r, p, m]) => {
        setRoles(r);
        setPermissions(p);
        setMatrix(m);
        const d: Record<string, Set<string>> = {};
        for (const [role, perms] of Object.entries(m)) {
          d[role] = new Set(perms);
        }
        setDraft(d);
      })
      .catch(() => setError('Erreur chargement des données.'))
      .finally(() => setLoading(false));
  }, []);

  // Group permissions by category
  const byCategory: Record<string, PermissionRecord[]> = {};
  for (const p of permissions) {
    if (!byCategory[p.category]) byCategory[p.category] = [];
    byCategory[p.category].push(p);
  }

  const currentDraft = draft[activeRole] ?? new Set<string>();

  function toggle(permName: string) {
    if (activeRole === 'owner') return; // owner is immutable
    setDraft((prev) => {
      const next = new Set(prev[activeRole] ?? []);
      if (next.has(permName)) next.delete(permName);
      else next.add(permName);
      return { ...prev, [activeRole]: next };
    });
    setSaved(false);
  }

  function toggleCategory(category: string) {
    if (activeRole === 'owner') return;
    const catPerms = byCategory[category]?.map((p) => p.name) ?? [];
    const allOn    = catPerms.every((p) => currentDraft.has(p));
    setDraft((prev) => {
      const next = new Set(prev[activeRole] ?? []);
      if (allOn) catPerms.forEach((p) => next.delete(p));
      else       catPerms.forEach((p) => next.add(p));
      return { ...prev, [activeRole]: next };
    });
    setSaved(false);
  }

  async function handleSave() {
    setSaving(true);
    setError('');
    try {
      await saveRolePermissions(activeRole, Array.from(currentDraft));
      setSaved(true);
    } catch (e: any) {
      setError(e.message ?? 'Erreur sauvegarde.');
    } finally {
      setSaving(false);
    }
  }

  function handleCreateRole() {
    if (!newLabel.trim()) return;
    startCreating(async () => {
      try {
        const role = await createCustomRole(newName || newLabel, newLabel, newColor, []);
        setRoles((prev) => [...prev, role]);
        setDraft((prev) => ({ ...prev, [role.name]: new Set() }));
        setActiveRole(role.name);
        setShowNewRole(false);
        setNewName(''); setNewLabel(''); setNewColor(COLOR_PRESETS[4]);
      } catch (e: any) {
        setError(e.message);
      }
    });
  }

  function handleDelete(role: RbacRole) {
    startDeleting(async () => {
      try {
        await deleteCustomRole(role.id);
        setRoles((prev) => prev.filter((r) => r.id !== role.id));
        if (activeRole === role.name) setActiveRole('owner');
        setConfirmDelete(null);
      } catch (e: any) {
        setError(e.message);
      }
    });
  }

  const activeRoleObj = roles.find((r) => r.name === activeRole);
  const isOwner       = activeRole === 'owner';
  const isSystemRole  = activeRoleObj?.is_system ?? true;

  if (loading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">

      {/* Header */}
      <div className="mb-8 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-primary">Rôles & Permissions</h1>
          <p className="mt-1 text-sm text-slate-500">
            Définissez les accès de chaque rôle. Les modifications s&apos;appliquent immédiatement.
          </p>
        </div>
        <button
          onClick={() => setShowNewRole(true)}
          className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-primary-h"
        >
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Nouveau rôle
        </button>
      </div>

      {error && (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
          {error}
        </div>
      )}

      <div className="flex gap-6">

        {/* ── Left: role list ── */}
        <div className="w-56 flex-shrink-0 space-y-1">
          <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-slate-400">Rôles</p>

          {roles.map((role) => (
            <button
              key={role.id}
              onClick={() => { setActiveRole(role.name); setSaved(false); setError(''); }}
              className={[
                'group flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition',
                activeRole === role.name
                  ? 'bg-nav-active text-primary'
                  : 'text-slate-600 hover:bg-slate-50 hover:text-primary',
              ].join(' ')}
            >
              <span
                className="h-3 w-3 flex-shrink-0 rounded-full"
                style={{ backgroundColor: role.color }}
              />
              <span className="flex-1 truncate text-left">{role.label}</span>
              {!role.is_system && (
                <button
                  onClick={(e) => { e.stopPropagation(); setConfirmDelete(role); }}
                  className="hidden rounded p-0.5 text-slate-300 hover:text-red-500 group-hover:block"
                >
                  <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </button>
          ))}
        </div>

        {/* ── Right: permissions matrix ── */}
        <div className="flex-1">
          {/* Role header */}
          <div className="mb-6 flex items-center justify-between rounded-2xl border border-slate-200 bg-white px-6 py-4">
            <div className="flex items-center gap-3">
              <span
                className="flex h-10 w-10 items-center justify-center rounded-xl text-white text-sm font-bold"
                style={{ backgroundColor: activeRoleObj?.color ?? '#64748b' }}
              >
                {activeRoleObj?.label?.[0] ?? '?'}
              </span>
              <div>
                <p className="font-bold text-primary">{activeRoleObj?.label}</p>
                <p className="text-xs text-slate-400">
                  {currentDraft.size} permission{currentDraft.size !== 1 ? 's' : ''} activée{currentDraft.size !== 1 ? 's' : ''}
                  {isOwner && ' · Rôle immuable'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              {saved && (
                <span className="flex items-center gap-1.5 text-sm text-emerald-600">
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Enregistré
                </span>
              )}
              <button
                onClick={handleSave}
                disabled={saving || isOwner}
                className="min-h-touch min-w-touch flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white transition hover:bg-primary-h disabled:opacity-40"
              >
                {saving ? <Spinner /> : null}
                Enregistrer
              </button>
            </div>
          </div>

          {/* Permission categories */}
          <div className="space-y-4">
            {Object.entries(byCategory).map(([category, perms]) => {
              const allOn  = perms.every((p) => currentDraft.has(p.name));
              const someOn = perms.some((p) => currentDraft.has(p.name));

              return (
                <div key={category} className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
                  {/* Category header */}
                  <button
                    onClick={() => toggleCategory(category)}
                    disabled={isOwner}
                    className="flex w-full items-center justify-between px-5 py-3.5 text-left hover:bg-slate-50 disabled:cursor-default"
                  >
                    <span className="text-sm font-semibold text-primary">{category}</span>
                    <div className="flex items-center gap-3">
                      <span className={`text-xs ${someOn ? 'text-emerald-600 font-medium' : 'text-slate-400'}`}>
                        {perms.filter((p) => currentDraft.has(p.name)).length}/{perms.length}
                      </span>
                      {/* Category toggle */}
                      <div className={[
                        'relative h-5 w-9 rounded-full transition',
                        isOwner ? 'opacity-60' : '',
                        allOn ? 'bg-emerald-500' : someOn ? 'bg-emerald-200' : 'bg-slate-200',
                      ].join(' ')}>
                        <div className={[
                          'absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all',
                          allOn ? 'left-4' : 'left-0.5',
                        ].join(' ')} />
                      </div>
                    </div>
                  </button>

                  {/* Permissions list */}
                  <div className="divide-y divide-slate-100 border-t border-slate-100">
                    {perms.map((perm) => {
                      const on = currentDraft.has(perm.name);
                      return (
                        <button
                          key={perm.name}
                          onClick={() => toggle(perm.name)}
                          disabled={isOwner}
                          className="flex w-full items-center justify-between px-5 py-3 text-left text-sm transition hover:bg-slate-50 disabled:cursor-default"
                        >
                          <div>
                            <span className={`font-medium ${on ? 'text-slate-800' : 'text-slate-400'}`}>
                              {perm.label}
                            </span>
                            {perm.description && (
                              <p className="mt-0.5 text-xs text-slate-400">{perm.description}</p>
                            )}
                          </div>
                          {/* Toggle */}
                          <div className={[
                            'relative ml-4 h-5 w-9 flex-shrink-0 rounded-full transition',
                            isOwner ? 'opacity-60' : '',
                            on ? 'bg-emerald-500' : 'bg-slate-200',
                          ].join(' ')}>
                            <div className={[
                              'absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all',
                              on ? 'left-4' : 'left-0.5',
                            ].join(' ')} />
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── New Role Modal ── */}
      {showNewRole && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-3xl bg-white p-8 shadow-2xl">
            <h2 className="mb-6 text-xl font-bold text-primary">Créer un rôle personnalisé</h2>

            <div className="space-y-4">
              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-widest text-slate-500">
                  Nom du rôle *
                </label>
                <input
                  value={newLabel}
                  onChange={(e) => setNewLabel(e.target.value)}
                  placeholder="Ex: Superviseur"
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-800 outline-none focus:border-primary/40 focus:ring-2 focus:ring-primary/10"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-widest text-slate-500">
                  Couleur
                </label>
                <div className="flex items-center gap-2 flex-wrap">
                  {COLOR_PRESETS.map((c) => (
                    <button
                      key={c}
                      onClick={() => setNewColor(c)}
                      className={`h-8 w-8 rounded-full transition ${newColor === c ? 'ring-2 ring-offset-2 ring-slate-400' : ''}`}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
              </div>
            </div>

            <div className="mt-6 flex gap-3">
              <button
                onClick={() => { setShowNewRole(false); setNewLabel(''); }}
                className="flex-1 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-600 transition hover:bg-slate-50"
              >
                Annuler
              </button>
              <button
                onClick={handleCreateRole}
                disabled={!newLabel.trim() || creating}
                className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-primary-h disabled:opacity-40"
              >
                {creating ? <Spinner /> : null}
                Créer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete Confirm Modal ── */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-3xl bg-white p-8 shadow-2xl text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-red-100">
              <svg className="h-7 w-7 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </div>
            <h2 className="text-lg font-bold text-slate-800">Supprimer le rôle ?</h2>
            <p className="mt-2 text-sm text-slate-500">
              Le rôle <strong>{confirmDelete.label}</strong> sera supprimé définitivement.
            </p>
            <div className="mt-6 flex gap-3">
              <button
                onClick={() => setConfirmDelete(null)}
                className="flex-1 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50"
              >
                Annuler
              </button>
              <button
                onClick={() => handleDelete(confirmDelete)}
                disabled={deleting}
                className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-red-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-40"
              >
                {deleting ? <Spinner /> : null}
                Supprimer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
