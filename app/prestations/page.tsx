'use client';

// ─────────────────────────────────────────────────────────────────────────────
// Ce que coûte une prestation — l'écran (F14)
//
// Pour chaque service : son prix, ce qu'il consomme (mèches, produits, pièces)
// et ce qu'il laisse vraiment. Classés du plus rentable au moins rentable sur
// les trente derniers jours — « le classement des services » que l'étude
// promet en Elit se lit ici dès que les coûts sont saisis.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { ProtectedRoute } from '../../components/ProtectedRoute';
import { useLanguage } from '../../components/LanguageWrapper';
import { Button, Card, FirstRun, ScreenHeader, Stack } from '../../components/ds';
import { listServiceCosts, saveServiceConsumables, type Consumable, type ServiceCost } from '../actions/serviceCosts';
import { formatMoney } from '../../lib/eveningReport';
import { cn } from '../../lib/utils';

const inputClass = 'min-h-13 w-full rounded-surface border border-border bg-surface px-3 text-body text-primary outline-none placeholder:text-muted focus:border-accent dark:border-dark-border dark:bg-dark-surface2 dark:text-dark-text';

function ServiceCard({ service, onSaved }: { service: ServiceCost; onSaved: () => void }) {
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<Array<Consumable & { key: string }>>(
    service.consumables.map((c) => ({ ...c, key: crypto.randomUUID() })),
  );
  const [busy, setBusy] = useState(false);
  const cost = rows.reduce((s, r) => s + (Number(r.cost) || 0), 0);
  const profit = service.price - cost;

  async function save() {
    setBusy(true);
    const res = await saveServiceConsumables(service.id, rows.map(({ label, cost: c }) => ({ label, cost: Number(c) || 0 })));
    setBusy(false);
    if (!res.ok) { toast.error(res.message); return; }
    toast.success(t({ fr: 'Coût enregistré : la marge de chaque vente en tient compte.', ht: 'Pri a anrejistre : maj chak vant ap konte l.' }));
    setOpen(false);
    onSaved();
  }

  return (
    <Card className="space-y-3 p-4">
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="pressable flex w-full items-baseline justify-between gap-3 text-left">
        <span className="min-w-0">
          <span className="block truncate text-card font-bold text-primary dark:text-dark-text">{service.name}</span>
          <span className="block text-note text-muted">
            {t({ fr: `Prix ${formatMoney(service.price, 'HTG')} · produits ${formatMoney(service.cost, 'HTG')}`, ht: `Pri ${formatMoney(service.price, 'HTG')} · pwodui ${formatMoney(service.cost, 'HTG')}` })}
            {service.soldLast30 > 0 ? ` · ${service.soldLast30}× ${t({ fr: 'en 30 j', ht: 'nan 30 jou' })}` : ''}
          </span>
        </span>
        <span className="text-right">
          <span className="block text-note text-muted">{t({ fr: 'Il vous reste', ht: 'Sa k rete w' })}</span>
          <span className={cn('amount block font-hero text-card', service.profit < 0 ? 'text-danger' : 'text-success')}>{formatMoney(service.profit, 'HTG')}</span>
        </span>
      </button>

      {open && (
        <div className="space-y-2 border-t border-border pt-3 dark:border-dark-border">
          {rows.map((r) => (
            <div key={r.key} className="flex items-center gap-2">
              <input value={r.label} onChange={(e) => setRows((p) => p.map((x) => x.key === r.key ? { ...x, label: e.target.value } : x))}
                placeholder={t({ fr: 'Produit utilisé (ex. : mèches)', ht: 'Pwodui ou sèvi (egz. : mèch)' })} className={inputClass} />
              <input inputMode="decimal" value={String(r.cost || '')} onChange={(e) => setRows((p) => p.map((x) => x.key === r.key ? { ...x, cost: Number(e.target.value.replace(',', '.')) || 0 } : x))}
                placeholder="G" aria-label={t({ fr: 'Coût par prestation', ht: 'Pri pou chak sèvis' })} className={`${inputClass} amount w-28 flex-none`} />
              <button type="button" onClick={() => setRows((p) => p.filter((x) => x.key !== r.key))}
                aria-label={t({ fr: 'Retirer', ht: 'Retire' })} className="pressable flex h-touch w-touch flex-none items-center justify-center rounded-surface text-muted hover:bg-surface">
                <Trash2 className="h-5 w-5" aria-hidden />
              </button>
            </div>
          ))}
          <Button variant="quiet" size="md" block onClick={() => setRows((p) => [...p, { key: crypto.randomUUID(), label: '', cost: 0 }])}>
            <Plus className="h-5 w-5" aria-hidden />{t({ fr: 'Ajouter un produit utilisé', ht: 'Ajoute yon pwodui ou sèvi' })}
          </Button>
          <p className={cn('text-body font-bold', profit < 0 ? 'text-danger' : 'text-primary dark:text-dark-text')}>
            {profit < 0
              ? t({ fr: `À ce prix, vous perdez ${formatMoney(-profit, 'HTG')} par prestation.`, ht: `Nan pri sa a, ou pèdi ${formatMoney(-profit, 'HTG')} chak fwa.` })
              : t({ fr: `Il vous reste ${formatMoney(profit, 'HTG')} par prestation.`, ht: `Sa k rete w : ${formatMoney(profit, 'HTG')} chak fwa.` })}
          </p>
          <Button variant="accent" size="lg" block loading={busy} onClick={save}>{t({ fr: 'Enregistrer', ht: 'Anrejistre' })}</Button>
        </div>
      )}
    </Card>
  );
}

function PrestationsInner() {
  const { t } = useLanguage();
  const [list, setList] = useState<ServiceCost[] | null>(null);
  const load = useCallback(() => {
    listServiceCosts().then((r) => { if (r.ok) setList(r.data); else { setList([]); toast.error(r.message); } }).catch(() => setList([]));
  }, []);
  useEffect(() => { load(); }, [load]);

  return (
    <div className="pp-enter mx-auto w-full max-w-3xl px-4 py-6 sm:px-6">
      <Stack>
        <ScreenHeader
          title={t({ fr: 'Ce que coûte chaque service', ht: 'Sa chak sèvis koute w' })}
          subtitle={t({ fr: 'Le prix moins les produits utilisés : ce qui vous reste vraiment.', ht: 'Pri a mwens pwodui ou sèvi yo : sa k rete w vre.' })}
        />
        {list === null ? (
          <span className="pp-skeleton block h-32 rounded-surface" aria-hidden />
        ) : list.length === 0 ? (
          <FirstRun
            title={t({ fr: 'Aucun service enregistré', ht: 'Pa gen sèvis ki anrejistre' })}
            hint={t({ fr: 'Choisissez vos services les plus fréquents à l’installation.', ht: 'Chwazi sèvis ou fè pi souvan yo nan enstalasyon an.' })}
            action={<Link href="/demarrage?step=2"><Button variant="accent" size="lg" block>{t({ fr: 'Choisir mes services', ht: 'Chwazi sèvis mwen yo' })}</Button></Link>}
          />
        ) : (
          <div className="space-y-3">{list.map((s) => <ServiceCard key={s.id} service={s} onSaved={load} />)}</div>
        )}
      </Stack>
    </div>
  );
}

export default function PrestationsPage() {
  return (
    <ProtectedRoute>
      <PrestationsInner />
    </ProtectedRoute>
  );
}
