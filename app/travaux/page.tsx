'use client';

// ─────────────────────────────────────────────────────────────────────────────
// Fich travay — l'écran (F13)
//
// Trois colonnes de la vie d'un travail : ap travay → pare → livre. Sur chaque
// fiche : le client, le travail, l'avance, le solde. « Li pare » ouvre le
// message pour le client ; « Livré » encaisse le solde s'il paie en repartant.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useState } from 'react';
import { MessageCircle, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { ProtectedRoute } from '../../components/ProtectedRoute';
import { useLanguage } from '../../components/LanguageWrapper';
import { Button, Card, FirstRun, Section, ScreenHeader, Stack } from '../../components/ds';
import { createWorkOrder, listWorkOrders, setWorkOrderStatus, type WorkOrder, type WorkStatus } from '../actions/workOrders';
import { formatMoney } from '../../lib/eveningReport';
import { notifyEntrySaved } from '../../lib/quickSheets';
import { cn } from '../../lib/utils';

const inputClass = 'min-h-13 w-full rounded-surface border border-border bg-surface px-4 text-body text-primary outline-none placeholder:text-muted focus:border-accent dark:border-dark-border dark:bg-dark-surface2 dark:text-dark-text';

const STATUS: Record<Exclude<WorkStatus, 'cancelled'>, { fr: string; ht: string }> = {
  in_progress: { fr: 'En cours', ht: 'Ap travay' },
  ready:       { fr: 'Prêt', ht: 'Pare' },
  delivered:   { fr: 'Livré', ht: 'Livre' },
};

function TravauxInner() {
  const { t } = useLanguage();
  const [orders, setOrders] = useState<WorkOrder[] | null>(null);
  const [tab, setTab] = useState<Exclude<WorkStatus, 'cancelled'>>('in_progress');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', phone: '', description: '', price: '', deposit: '', due: '' });
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(() => {
    listWorkOrders().then((r) => { if (r.ok) setOrders(r.data); else { setOrders([]); toast.error(r.message); } }).catch(() => setOrders([]));
  }, []);
  useEffect(() => { load(); }, [load]);

  async function create() {
    setBusy('create');
    const res = await createWorkOrder({
      customerName: form.name, customerPhone: form.phone, description: form.description,
      price: Number(form.price.replace(',', '.')), deposit: Number((form.deposit || '0').replace(',', '.')),
      dueDate: form.due || null,
    });
    setBusy(null);
    if (!res.ok) { toast.error(res.message); return; }
    toast.success(t({ fr: 'Fiche créée. Le solde est dans le cahier de crédit.', ht: 'Fich la kreye. Balans lan nan kaye kredi a.' }));
    setForm({ name: '', phone: '', description: '', price: '', deposit: '', due: '' });
    setShowForm(false);
    notifyEntrySaved();
    load();
  }

  async function move(o: WorkOrder, status: WorkStatus, collect = false) {
    setBusy(`${o.id}-${status}`);
    const res = await setWorkOrderStatus(o.id, status, collect);
    setBusy(null);
    if (!res.ok) { toast.error(res.message); return; }
    if (status === 'ready' && o.customerPhone) window.open(o.readyLink, '_blank', 'noopener');
    notifyEntrySaved();
    load();
  }

  const visible = (orders ?? []).filter((o) => o.status === tab);
  const count = (s: WorkStatus) => (orders ?? []).filter((o) => o.status === s).length;

  return (
    <div className="pp-enter mx-auto w-full max-w-3xl px-4 py-6 sm:px-6">
      <Stack>
        <ScreenHeader
          title={t({ fr: 'Fiches de travail', ht: 'Fich travay' })}
          subtitle={t({ fr: 'L’avance n’est pas du profit : le solde, c’est votre argent.', ht: 'Avans la pa pwofi. Balans lan se kòb ou.' })}
          action={!showForm ? (
            <Button variant="accent" size="md" onClick={() => setShowForm(true)}>
              <Plus className="h-5 w-5" aria-hidden />{t({ fr: 'Fiche', ht: 'Fich' })}
            </Button>
          ) : undefined}
        />

        {showForm && (
          <Section title={t({ fr: 'Nouveau travail', ht: 'Nouvo travay' })}>
            <Card className="space-y-3 p-4">
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder={t({ fr: 'Client', ht: 'Kliyan' })} className={inputClass} />
              <input type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder={t({ fr: 'Téléphone (pour « li pare »)', ht: 'Telefòn (pou « li pare »)' })} className={inputClass} />
              <input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder={t({ fr: 'Le travail (ex. : écran Samsung A12)', ht: 'Travay la (egz. : ekran Samsung A12)' })} className={inputClass} />
              <div className="grid grid-cols-2 gap-2">
                <input inputMode="decimal" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} placeholder={t({ fr: 'Prix (G)', ht: 'Pri (G)' })} className={`${inputClass} amount`} />
                <input inputMode="decimal" value={form.deposit} onChange={(e) => setForm({ ...form, deposit: e.target.value })} placeholder={t({ fr: 'Avance (G)', ht: 'Avans (G)' })} className={`${inputClass} amount`} />
              </div>
              <label className="block space-y-1">
                <span className="text-note font-bold uppercase tracking-wide text-muted">{t({ fr: 'Prêt pour le (facultatif)', ht: 'Pare pou (si w konnen)' })}</span>
                <input type="date" value={form.due} onChange={(e) => setForm({ ...form, due: e.target.value })} className={inputClass} />
              </label>
              <Button variant="accent" size="lg" block loading={busy === 'create'} onClick={create}>{t({ fr: 'Créer la fiche', ht: 'Kreye fich la' })}</Button>
            </Card>
          </Section>
        )}

        <div className="grid grid-cols-3 gap-2" role="tablist">
          {(Object.keys(STATUS) as Array<Exclude<WorkStatus, 'cancelled'>>).map((s) => (
            <button key={s} type="button" role="tab" aria-selected={tab === s} onClick={() => setTab(s)}
              className={cn('pressable min-h-touch rounded-control text-body font-bold transition-colors duration-press', tab === s ? 'bg-primary text-white' : 'bg-surface2 text-primary hover:bg-border dark:bg-dark-surface2 dark:text-dark-text')}>
              {t(STATUS[s])} · {count(s)}
            </button>
          ))}
        </div>

        {orders === null ? (
          <span className="pp-skeleton block h-32 rounded-surface" aria-hidden />
        ) : visible.length === 0 ? (
          <FirstRun
            title={tab === 'in_progress' ? t({ fr: 'Aucun travail en cours', ht: 'Pa gen travay k ap fèt' }) : t({ fr: 'Rien ici', ht: 'Pa gen anyen la' })}
            hint={tab === 'in_progress' ? t({ fr: 'Chaque travail confié devient une fiche : avance, solde, et le message « li pare ».', ht: 'Chak travay yo konfye w vin tounen yon fich : avans, balans, ak mesaj « li pare ».' }) : undefined}
          />
        ) : (
          <div className="space-y-3">
            {visible.map((o) => (
              <Card key={o.id} className="space-y-3 p-4">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="min-w-0">
                    <span className="block truncate text-card font-bold text-primary dark:text-dark-text">{o.description}</span>
                    <span className="block text-note text-muted">{o.customerName}{o.dueDate ? ` · ${t({ fr: 'pour le', ht: 'pou' })} ${o.dueDate}` : ''}</span>
                  </span>
                  <span className="text-right">
                    <span className="block text-note text-muted">{t({ fr: 'Reste à payer', ht: 'Ki rete' })}</span>
                    <span className={cn('amount block font-hero text-card', o.balance > 0 ? 'text-primary dark:text-dark-text' : 'text-success')}>{formatMoney(o.balance, 'HTG')}</span>
                  </span>
                </div>
                <p className="text-note text-text2 dark:text-dark-text2">
                  {t({ fr: `Prix ${formatMoney(o.price, 'HTG')} · avance ${formatMoney(o.deposit, 'HTG')}`, ht: `Pri ${formatMoney(o.price, 'HTG')} · avans ${formatMoney(o.deposit, 'HTG')}` })}
                </p>
                {o.status === 'in_progress' && (
                  <Button variant="accent" size="md" block loading={busy === `${o.id}-ready`} onClick={() => move(o, 'ready')}>
                    <MessageCircle className="h-5 w-5" aria-hidden />
                    {t({ fr: 'C’est prêt — prévenir le client', ht: 'Li pare — avèti kliyan an' })}
                  </Button>
                )}
                {o.status === 'ready' && (
                  <div className="grid grid-cols-2 gap-2">
                    <Button variant="accent" size="md" loading={busy === `${o.id}-delivered`} onClick={() => move(o, 'delivered', o.balance > 0)}>
                      {o.balance > 0 ? t({ fr: 'Livré et payé', ht: 'Livre epi peye' }) : t({ fr: 'Livré', ht: 'Livre' })}
                    </Button>
                    {o.balance > 0 ? (
                      <Button variant="outline" size="md" onClick={() => move(o, 'delivered', false)}>{t({ fr: 'Livré, payera plus tard', ht: 'Livre, l ap peye pita' })}</Button>
                    ) : (
                      <a href={o.readyLink} target="_blank" rel="noopener noreferrer" className="pressable flex min-h-action items-center justify-center rounded-surface border border-border text-body font-bold text-primary dark:border-dark-border dark:text-dark-text">
                        {t({ fr: 'Relancer', ht: 'Raple l' })}
                      </a>
                    )}
                  </div>
                )}
              </Card>
            ))}
          </div>
        )}
      </Stack>
    </div>
  );
}

export default function TravauxPage() {
  return (
    <ProtectedRoute>
      <TravauxInner />
    </ProtectedRoute>
  );
}
