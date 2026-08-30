'use client';

import { useRef, useState, useTransition } from 'react';
import { Building2, Check, ChevronDown, Plus, Lock } from 'lucide-react';
import { toast } from 'sonner';
import { switchStore, createStore } from '../app/actions/stores';
import { useCompany } from '../hooks/useCompany';
import { usePermissions } from '../hooks/usePermissions';
import { usePlan } from '../hooks/usePlan';
import { planMaxStores } from '../lib/planFeatures';
import { cn } from '../lib/utils';

export function CompanySwitcher({ onNavigate }: { onNavigate?: () => void }) {
  const { allCompanies, company, refresh } = useCompany();
  const { canUse } = usePermissions();
  const { planKey } = usePlan();
  const canMulti = canUse('multi_stores');
  const maxStores = planMaxStores(planKey);
  const ownedCount = allCompanies.length;
  const atLimit = ownedCount >= maxStores;

  const [open,     setOpen]     = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName,  setNewName]  = useState('');
  const [isPending, startTransition] = useTransition();
  const ref = useRef<HTMLDivElement>(null);

  if (!company) return null;

  const initials = company.name.slice(0, 2).toUpperCase();

  function handleSwitch(id: string) {
    if (id === company?.id) { setOpen(false); return; }
    startTransition(async () => {
      try {
        await switchStore(id);
        setOpen(false);
        onNavigate?.();
        await refresh();
        window.location.reload();
      } catch (e: any) {
        toast.error(e.message);
      }
    });
  }

  function handleCreate() {
    if (!newName.trim()) return;
    startTransition(async () => {
      try {
        const biz = await createStore(newName.trim());
        toast.success(`Entreprise "${biz.name}" créée`);
        setNewName('');
        setCreating(false);
        setOpen(false);
        await refresh();
        window.location.reload();
      } catch (e: any) {
        toast.error(e.message);
      }
    });
  }

  return (
    <div ref={ref} className="relative px-3 pb-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={isPending}
        className="flex w-full items-center gap-2.5 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 transition hover:bg-slate-100 dark:border-slate-700 dark:bg-white/5 dark:hover:bg-white/10"
      >
        {/* Logo / avatar */}
        {company.logoUrl ? (
          <img
            src={company.logoUrl}
            alt={company.name}
            className="h-7 w-7 rounded-lg object-cover flex-shrink-0"
          />
        ) : (
          <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg bg-primary text-note font-bold text-white dark:bg-accent dark:text-primary">
            {initials}
          </div>
        )}

        <div className="min-w-0 flex-1 text-left">
          <p className="truncate text-xs font-semibold text-primary dark:text-white">{company.name}</p>
          {company.sector && (
            <p className="truncate text-note text-slate-400">{company.sector}</p>
          )}
        </div>

        {(allCompanies.length > 1 || canMulti) && (
          <ChevronDown className={cn('h-3.5 w-3.5 flex-shrink-0 text-slate-400 transition-transform', open && 'rotate-180')} />
        )}
      </button>

      {open && (allCompanies.length > 1 || canMulti) && (
        <div className="absolute left-3 right-3 top-full z-50 mt-1 rounded-2xl border border-slate-200 bg-white shadow-xl overflow-hidden dark:bg-dark-surface dark:border-slate-700">
          <p className="px-3 py-2 text-note uppercase tracking-widest text-slate-400 font-semibold border-b border-slate-100 dark:border-slate-800">
            Mes entreprises
          </p>

          <div className="max-h-52 overflow-y-auto">
            {allCompanies.map((biz) => (
              <button
                key={biz.id}
                type="button"
                disabled={isPending}
                onClick={() => handleSwitch(biz.id)}
                className="flex w-full items-center gap-2.5 px-3 py-2.5 text-sm text-slate-700 hover:bg-slate-50 transition dark:text-slate-300 dark:hover:bg-white/5"
              >
                <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-primary/10 text-note font-bold text-primary dark:bg-white/10 dark:text-white">
                  {biz.name.slice(0, 2).toUpperCase()}
                </div>
                <span className="flex-1 truncate text-left text-xs font-medium">{biz.name}</span>
                {biz.id === company.id && (
                  <Check className="h-3.5 w-3.5 text-primary" />
                )}
              </button>
            ))}
          </div>

          {canMulti && (
            <div className="border-t border-slate-100 dark:border-slate-800">
              {/* Compteur entreprises */}
              <div className="flex items-center justify-between px-3 py-1.5">
                <span className="text-note text-slate-400">
                  {ownedCount} / {maxStores} entreprise{maxStores > 1 ? 's' : ''}
                </span>
                {atLimit && (
                  <span className="flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-note font-semibold text-amber-700 dark:bg-amber-500/10 dark:text-amber-400">
                    <Lock className="h-2.5 w-2.5" /> Limite atteinte
                  </span>
                )}
              </div>

              {!atLimit && (
                creating ? (
                  <div className="flex items-center gap-2 px-3 py-2">
                    <input
                      autoFocus
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleCreate();
                        if (e.key === 'Escape') { setCreating(false); setNewName(''); }
                      }}
                      placeholder="Nom de l'entreprise"
                      className="flex-1 rounded-lg border border-slate-200 px-2 py-1 text-xs outline-none focus:border-primary dark:bg-white/5 dark:border-slate-700"
                    />
                    <button
                      type="button"
                      onClick={handleCreate}
                      disabled={isPending || !newName.trim()}
                      className="rounded-lg bg-primary px-2 py-1 text-xs font-semibold text-white disabled:opacity-50"
                    >
                      OK
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setCreating(true)}
                    className="flex w-full items-center gap-2 px-3 py-2.5 text-xs font-medium text-primary hover:bg-blue-50 transition dark:hover:bg-blue-500/10"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Nouvelle entreprise
                  </button>
                )
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
