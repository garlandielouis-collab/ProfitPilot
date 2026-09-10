'use client';

import { useEffect, useState, useTransition } from 'react';
import { ProtectedRoute } from '../../components/ProtectedRoute';
import { Users, Mail, Shield, Trash2, UserPlus, Crown, Eye } from 'lucide-react';
import { toast } from 'sonner';
import { usePermissions } from '../../hooks/usePermissions';
import {
  listEmployees,
  inviteEmployee,
  updateEmployeeRole,
  removeEmployee,
  type Employee,
  type EmployeeRole,
} from '../actions/employees';

const ROLE_LABELS: Record<EmployeeRole, string> = {
  owner:   'Propriétaire',
  manager: 'Gérant',
  cashier: 'Caissier',
  viewer:  'Lecteur',
};

const ROLE_ICONS: Record<EmployeeRole, typeof Crown> = {
  owner:   Crown,
  manager: Shield,
  cashier: Users,
  viewer:  Eye,
};

const ROLE_COLORS: Record<EmployeeRole, string> = {
  owner:   'text-amber-600 bg-amber-50 border-amber-200',
  manager: 'text-blue-600 bg-blue-50 border-blue-200',
  cashier: 'text-emerald-600 bg-emerald-50 border-emerald-200',
  viewer:  'text-slate-500 bg-slate-50 border-slate-200',
};

function EmployeesPage() {
  const { can } = usePermissions();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<EmployeeRole>('cashier');
  const [isPending, startTransition] = useTransition();

  function load() {
    listEmployees()
      .then(setEmployees)
      .catch((e) => toast.error(e.message))
      .finally(() => setLoading(false));
  }

  useEffect(() => { load(); }, []);

  function handleInvite() {
    if (!inviteEmail.trim()) return;
    startTransition(async () => {
      try {
        await inviteEmployee(inviteEmail.trim(), inviteRole);
        toast.success(`Invitation envoyée à ${inviteEmail}`);
        setInviteEmail('');
        load();
      } catch (e: any) {
        toast.error(e.message);
      }
    });
  }

  function handleRoleChange(memberId: string, role: EmployeeRole) {
    startTransition(async () => {
      try {
        await updateEmployeeRole(memberId, role);
        toast.success('Rôle mis à jour');
        load();
      } catch (e: any) {
        toast.error(e.message);
      }
    });
  }

  function handleRemove(memberId: string, name: string) {
    if (!confirm(`Retirer ${name} de l'équipe ?`)) return;
    startTransition(async () => {
      try {
        await removeEmployee(memberId);
        toast.success('Membre retiré');
        load();
      } catch (e: any) {
        toast.error(e.message);
      }
    });
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-primary">Équipe</h1>
        <p className="text-sm text-slate-500 mt-1">Gérez les membres de votre boutique et leurs accès.</p>
      </div>

      {/* Invite form */}
      <div className="rounded-surface border border-slate-200 bg-white p-6 space-y-4">
        <h2 className="text-sm font-semibold text-primary flex items-center gap-2">
          <UserPlus className="h-4 w-4" />
          Inviter un employé
        </h2>
        <div className="flex flex-col sm:flex-row gap-3">
          <input
            type="email"
            value={inviteEmail}
            onChange={(e) => setInviteEmail(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleInvite()}
            placeholder="adresse@email.com"
            className="flex-1 rounded-xl border border-slate-200 px-4 py-2.5 text-sm outline-none focus:border-primary transition"
          />
          <select
            value={inviteRole}
            onChange={(e) => setInviteRole(e.target.value as EmployeeRole)}
            className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-primary transition bg-white"
          >
            <option value="cashier">Caissier</option>
            <option value="manager">Gérant</option>
            <option value="viewer">Lecteur</option>
          </select>
          <button
            type="button"
            onClick={handleInvite}
            disabled={isPending || !inviteEmail.trim()}
            className="flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-white hover:bg-primary-h transition disabled:opacity-50"
          >
            <Mail className="h-4 w-4" />
            Inviter
          </button>
        </div>
        <p className="text-xs text-slate-400">
          Un email d&apos;invitation sera envoyé. Si la personne a déjà un compte ProfitPilot, elle sera ajoutée directement.
        </p>
      </div>

      {/* Employee list */}
      <div className="rounded-surface border border-slate-200 bg-white overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100">
          <h2 className="text-sm font-semibold text-primary flex items-center gap-2">
            <Users className="h-4 w-4" />
            Membres ({employees.length})
          </h2>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
        ) : employees.length === 0 ? (
          <p className="px-6 py-10 text-center text-sm text-slate-400">Aucun membre. Invitez votre premier employé ci-dessus.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {employees.map((emp) => {
              const RoleIcon = ROLE_ICONS[emp.role];
              const displayName = emp.full_name ?? emp.email ?? emp.user_id.slice(0, 8);
              return (
                <li key={emp.id} className="flex items-center gap-4 px-6 py-4">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-sm font-bold text-slate-600 flex-shrink-0">
                    {(emp.full_name ?? emp.email ?? '?').slice(0, 2).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-primary truncate">{displayName}</p>
                    {emp.email && emp.full_name && (
                      <p className="text-xs text-slate-400 truncate">{emp.email}</p>
                    )}
                    {!emp.is_active && (
                      <span className="text-xs text-red-400">Inactif</span>
                    )}
                  </div>

                  <span className={`hidden sm:flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${ROLE_COLORS[emp.role]}`}>
                    <RoleIcon className="h-4 w-4" />
                    {ROLE_LABELS[emp.role]}
                  </span>

                  {emp.role !== 'owner' && (
                    <div className="flex items-center gap-2">
                      <select
                        value={emp.role}
                        onChange={(e) => handleRoleChange(emp.id, e.target.value as EmployeeRole)}
                        disabled={isPending}
                        className="rounded-lg border border-slate-200 px-2 py-1 text-xs outline-none bg-white hover:border-primary transition"
                      >
                        <option value="manager">Gérant</option>
                        <option value="cashier">Caissier</option>
                        <option value="viewer">Lecteur</option>
                      </select>
                      <button
                        type="button"
                        onClick={() => handleRemove(emp.id, displayName)}
                        disabled={isPending}
                        className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-500 transition"
                        title="Retirer"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

export default function EmployeesPageWrapper() {
  return (
    <ProtectedRoute>
      <EmployeesPage />
    </ProtectedRoute>
  );
}
