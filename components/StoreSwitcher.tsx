'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { Store, Plus, ChevronDown, Check } from 'lucide-react';
import { toast } from 'sonner';
import { switchStore, createStore } from '../app/actions/stores';
import { useCompany } from '../hooks/useCompany';
import { usePermissions } from '../hooks/usePermissions';
import { cn } from '../lib/utils';

type BizItem = { id: string; name: string };

export function StoreSwitcher() {
  const { allCompanies, company, refresh } = useCompany();
  const { canUse } = usePermissions();
  const canMulti = canUse('multi_stores');

  const [open,      setOpen]      = useState(false);
  const [creating,  setCreating]  = useState(false);
  const [newName,   setNewName]   = useState('');
  const [isPending, startTransition] = useTransition();
  const ref = useRef<HTMLDivElement>(null);

  const stores  = allCompanies;
  const activeId = company?.id ?? null;


  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  if (stores.length <= 1 && !canMulti) return null;

  const active = stores.find((s) => s.id === activeId) ?? stores[0];

  function handleSwitch(id: string) {
    startTransition(async () => {
      try {
        await switchStore(id);
        setOpen(false);
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
        const biz = await createStore(newName);
        toast.success(`Boutique "${biz.name}" créée`);
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
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 transition shadow-sm"
      >
        <Store className="h-3.5 w-3.5 text-[#0047AB]" />
        <span className="max-w-[120px] truncate">{active?.name ?? 'Boutique'}</span>
        <ChevronDown className={cn('h-3 w-3 text-slate-400 transition-transform', open && 'rotate-180')} />
      </button>

      {open && (
        <div className="absolute left-0 top-full z-50 mt-1 w-56 rounded-2xl border border-slate-200 bg-white shadow-lg overflow-hidden">
          <p className="px-3 py-2 text-[10px] uppercase tracking-widest text-slate-400 font-semibold border-b border-slate-100">
            Mes boutiques
          </p>
          <div className="max-h-48 overflow-y-auto">
            {stores.map((s) => (
              <button
                key={s.id}
                type="button"
                disabled={isPending}
                onClick={() => handleSwitch(s.id)}
                className="flex w-full items-center gap-2 px-3 py-2.5 text-sm text-slate-700 hover:bg-slate-50 transition"
              >
                <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-[#0047AB]/10">
                  <Store className="h-3.5 w-3.5 text-[#0047AB]" />
                </div>
                <span className="flex-1 truncate text-left">{s.name}</span>
                {s.id === activeId && <Check className="h-3.5 w-3.5 text-[#0047AB]" />}
              </button>
            ))}
          </div>

          {canMulti && (
            <div className="border-t border-slate-100">
              {creating ? (
                <div className="flex items-center gap-2 px-3 py-2">
                  <input
                    autoFocus
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleCreate(); if (e.key === 'Escape') setCreating(false); }}
                    placeholder="Nom de la boutique"
                    className="flex-1 rounded-lg border border-slate-200 px-2 py-1 text-xs outline-none focus:border-[#0047AB]"
                  />
                  <button
                    type="button"
                    onClick={handleCreate}
                    disabled={isPending || !newName.trim()}
                    className="rounded-lg bg-[#0047AB] px-2 py-1 text-xs text-white disabled:opacity-50"
                  >
                    OK
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setCreating(true)}
                  className="flex w-full items-center gap-2 px-3 py-2.5 text-xs text-[#0047AB] hover:bg-blue-50 transition font-medium"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Créer une boutique
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
