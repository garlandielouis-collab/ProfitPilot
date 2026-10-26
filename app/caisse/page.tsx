'use client';

// ─────────────────────────────────────────────────────────────────────────────
// Kès — la caisse du jour (F08), le salaire du patron (F04), la caisse de
// chaque aide (F22, Elit)
//
// « Il ne sait pas si la caisse est juste, car il ne sait pas ce qu'elle
// devrait contenir » (§5.1). Le matin, l'argent de départ. Le soir, ce qu'il y
// a vraiment. Entre les deux, ProfitPilot calcule ce qui DEVRAIT y être : les
// ventes et les versements en espèces, moins les dépenses et le sòl payés en
// espèces. L'écart se lit d'un coup d'œil, et il reste écrit.
//
// Et le salaire du patron : « Biznis ou pa pòv. Se kay la k ap manje l » (§8).
// Il fixe un salaire par semaine ; ce qu'il prend pour la maison se compte
// contre lui, et le bilan du soir le prévient quand il le dépasse.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useState } from 'react';
import { Home } from 'lucide-react';
import { toast } from 'sonner';
import { ProtectedRoute } from '../../components/ProtectedRoute';
import { useLanguage } from '../../components/LanguageWrapper';
import { useCompanyContext } from '../../contexts/CompanyContext';
import { usePermissions } from '../../hooks/usePermissions';
import { Button, Card, FirstRun, Section, ScreenHeader, Stack } from '../../components/ds';
import {
  closeCashDay, getDayView, listCashClosings, openCashDay, type CashClosing, type DayView,
} from '../actions/evening';
import { saveKayeSettings } from '../actions/kaye';
import { listEmployees, type Employee } from '../actions/employees';
import { formatMoney } from '../../lib/eveningReport';
import { ENTRY_SAVED_EVENT, openExpenseSheet } from '../../lib/quickSheets';
import { cn } from '../../lib/utils';

const inputClass = 'amount min-h-13 w-full rounded-surface border border-border bg-surface px-4 text-body text-primary outline-none placeholder:text-muted focus:border-accent dark:border-dark-border dark:bg-dark-surface2 dark:text-dark-text';
const parse = (v: string) => Number(v.replace(',', '.'));

function CaisseInner() {
  const { t } = useLanguage();
  const { company, refresh } = useCompanyContext();
  const { can, canUse } = usePermissions();
  const seesCash = can('reports:read');

  const [view, setView] = useState<DayView | null>(null);
  const [closings, setClosings] = useState<CashClosing[]>([]);
  const [helpers, setHelpers] = useState<Employee[]>([]);
  const [opening, setOpening] = useState('');
  const [counted, setCounted] = useState('');
  const [salary, setSalary] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [helperCount, setHelperCount] = useState<Record<string, string>>({});

  const load = useCallback(() => {
    getDayView().then((r) => { if (r.ok) setView(r.data); }).catch(() => {});
    if (seesCash) listCashClosings().then((r) => { if (r.ok) setClosings(r.data); }).catch(() => {});
  }, [seesCash]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    window.addEventListener(ENTRY_SAVED_EVENT, load);
    return () => window.removeEventListener(ENTRY_SAVED_EVENT, load);
  }, [load]);
  useEffect(() => {
    setSalary(company?.kaye?.ownerWeeklySalary ? String(company.kaye.ownerWeeklySalary) : '');
  }, [company?.kaye?.ownerWeeklySalary]);
  useEffect(() => {
    if (!canUse('cash_control')) return;
    listEmployees().then((r) => {
      if (r.ok) setHelpers(r.data.filter((e) => e.role !== 'owner' && e.is_active));
    }).catch(() => {});
  }, [canUse]);

  if (!seesCash) {
    return (
      <FirstRun
        title={t({ fr: 'La caisse est tenue par le patron', ht: 'Se patwon an ki kenbe kès la' })}
        hint={t({ fr: 'Notez chaque vente : le compte du soir se fait de son côté.', ht: 'Note chak vant : se li ki konte kès la aswè.' })}
      />
    );
  }

  const r = view?.report;
  const m = (n: number) => formatMoney(n, r?.currency ?? 'HTG');
  const salaryValue = company?.kaye?.ownerWeeklySalary ?? null;
  const overSalary = r && salaryValue ? r.weekWithdrawals > salaryValue : false;
  const today = closings.find((c) => c.day === r?.day && c.memberUserId === null);

  async function saveOpening() {
    const v = parse(opening);
    if (!(v >= 0)) { toast.error(t({ fr: 'Tapez un montant.', ht: 'Tape yon montan.' })); return; }
    setBusy('opening');
    const res = await openCashDay({ openingCash: v });
    setBusy(null);
    if (!res.ok) { toast.error(res.message); return; }
    toast.success(t({ fr: 'Argent de départ noté.', ht: 'Kòb kòmansman an note.' }));
    setOpening('');
    load();
  }

  async function saveCount(memberUserId: string | null, raw: string) {
    const v = parse(raw);
    if (!(v >= 0)) { toast.error(t({ fr: 'Tapez ce qu’il y a dans la caisse.', ht: 'Tape sa ki nan kès la.' })); return; }
    setBusy(memberUserId ?? 'count');
    const res = await closeCashDay({ countedCash: v, memberUserId });
    setBusy(null);
    if (!res.ok) { toast.error(res.message); return; }
    const gap = res.data.gap;
    if (Math.abs(gap) < 1) toast.success(t({ fr: 'La caisse est juste.', ht: 'Kès la bon.' }));
    else if (gap < 0) toast.error(t({ fr: `Il manque ${m(-gap)}.`, ht: `Li manke ${m(-gap)}.` }));
    else toast.message(t({ fr: `Il y a ${m(gap)} de trop.`, ht: `Gen ${m(gap)} an plis.` }));
    if (memberUserId) setHelperCount((s) => ({ ...s, [memberUserId]: '' }));
    else setCounted('');
    load();
  }

  async function saveSalary() {
    const v = salary.trim() ? parse(salary) : null;
    if (v !== null && !(v >= 0)) { toast.error(t({ fr: 'Tapez un montant.', ht: 'Tape yon montan.' })); return; }
    setBusy('salary');
    const res = await saveKayeSettings({ ownerWeeklySalary: v });
    setBusy(null);
    if (!res.ok) { toast.error(res.message); return; }
    toast.success(t({ fr: 'Salaire enregistré.', ht: 'Salè a anrejistre.' }));
    await refresh();
    load();
  }

  return (
    <div className="pp-enter mx-auto w-full max-w-3xl px-4 py-6 sm:px-6">
      <Stack>
        <ScreenHeader
          title={t({ fr: 'Caisse', ht: 'Kès' })}
          subtitle={t({ fr: 'L’argent qui devrait être là, et celui qui y est.', ht: 'Kòb ki dwe la, ak kòb ki la vre.' })}
        />

        {/* ── Aujourd'hui ── */}
        <Section title={t({ fr: 'Aujourd’hui', ht: 'Jodi a' })}>
          <Card className="space-y-4 p-4">
            {r ? (
              <>
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-body text-text2 dark:text-dark-text2">{t({ fr: 'Caisse attendue', ht: 'Kès atandi' })}</span>
                  <span className="amount font-hero text-screen text-primary dark:text-dark-text">{m(r.expectedCash)}</span>
                </div>
                <dl className="grid grid-cols-2 gap-2 text-note">
                  <div className="rounded-control bg-surface p-2 dark:bg-dark-surface2">
                    <dt className="text-muted">{t({ fr: 'Entré en espèces', ht: 'Kach ki antre' })}</dt>
                    <dd className="amount font-bold text-primary dark:text-dark-text">+ {m(r.cashIn)}</dd>
                  </div>
                  <div className="rounded-control bg-surface p-2 dark:bg-dark-surface2">
                    <dt className="text-muted">{t({ fr: 'Sorti en espèces', ht: 'Kach ki soti' })}</dt>
                    <dd className="amount font-bold text-primary dark:text-dark-text">− {m(r.cashOut)}</dd>
                  </div>
                </dl>
                <p className="text-note text-muted dark:text-dark-muted">
                  {t({
                    fr: 'MonCash et NatCash ne sont pas dans le tiroir : ils ne comptent pas dans la caisse.',
                    ht: 'MonCash ak NatCash pa nan tiwa a : yo pa konte nan kès la.',
                  })}
                </p>
              </>
            ) : (
              <span className="pp-skeleton block h-20 rounded-control" aria-hidden />
            )}

            {view && !view.cashOpened && (
              <div className="space-y-2 border-t border-border pt-4 dark:border-dark-border">
                <label htmlFor="pp-opening" className="block text-note font-bold uppercase tracking-wide text-muted">
                  {t({ fr: 'Argent dans la caisse ce matin', ht: 'Kòb ki te nan kès la maten an' })}
                </label>
                <div className="flex gap-2">
                  <input id="pp-opening" inputMode="decimal" value={opening} onChange={(e) => setOpening(e.target.value)} placeholder="0" className={inputClass} />
                  <Button variant="quiet" size="lg" loading={busy === 'opening'} onClick={saveOpening}>{t({ fr: 'Noter', ht: 'Note' })}</Button>
                </div>
              </div>
            )}

            <div className="space-y-2 border-t border-border pt-4 dark:border-dark-border">
              <label htmlFor="pp-count" className="block text-note font-bold uppercase tracking-wide text-muted">
                {view?.cashClosed
                  ? t({ fr: 'Recompter la caisse', ht: 'Rekonte kès la' })
                  : t({ fr: 'Combien y a-t-il vraiment dans la caisse ?', ht: 'Konbyen ki genyen vre nan kès la ?' })}
              </label>
              <div className="flex gap-2">
                <input id="pp-count" inputMode="decimal" value={counted} onChange={(e) => setCounted(e.target.value)} placeholder="0" className={inputClass} />
                <Button variant="accent" size="lg" loading={busy === 'count'} onClick={() => saveCount(null, counted)}>{t({ fr: 'Compter', ht: 'Konte' })}</Button>
              </div>
              {today?.gap !== null && today?.gap !== undefined && (
                <p className={cn('text-body font-bold', Math.abs(today.gap) < 1 ? 'text-success' : 'text-danger')}>
                  {Math.abs(today.gap) < 1
                    ? t({ fr: 'Ce soir, la caisse était juste.', ht: 'Aswè a, kès la te bon.' })
                    : today.gap < 0
                      ? t({ fr: `Écart : il manquait ${m(-today.gap)}.`, ht: `Diferans : li te manke ${m(-today.gap)}.` })
                      : t({ fr: `Écart : ${m(today.gap)} de trop.`, ht: `Diferans : ${m(today.gap)} an plis.` })}
                </p>
              )}
            </div>
          </Card>
        </Section>

        {/* ── Salè mèt la (F04) ── */}
        <Section title={t({ fr: 'Votre salaire', ht: 'Salè mèt la' })}>
          <Card className="space-y-4 p-4">
            <p className="text-body text-text2 dark:text-dark-text2">
              {t({
                fr: 'Payez-vous un salaire. Le reste est pour le commerce : c’est lui qui rachète la marchandise.',
                ht: 'Peye tèt ou yon salè. Rès la se pou biznis la : se li k ap achte machandiz la ankò.',
              })}
            </p>
            {r && (
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-body text-text2 dark:text-dark-text2">{t({ fr: 'Pris pour la maison cette semaine', ht: 'Lajan lakay semèn sa a' })}</span>
                <span className={cn('amount text-card font-bold', overSalary ? 'text-danger' : 'text-primary dark:text-dark-text')}>
                  {m(r.weekWithdrawals)}{salaryValue ? ` / ${m(salaryValue)}` : ''}
                </span>
              </div>
            )}
            {overSalary && (
              <p className="text-body font-bold text-danger">
                {t({ fr: 'Vous avez dépassé votre salaire de la semaine.', ht: 'Ou depase salè semèn ou an.' })}
              </p>
            )}
            <div className="space-y-2">
              <label htmlFor="pp-salary" className="block text-note font-bold uppercase tracking-wide text-muted">
                {t({ fr: 'Mon salaire par semaine', ht: 'Salè m pa semèn' })}
              </label>
              <div className="flex gap-2">
                <input id="pp-salary" inputMode="decimal" value={salary} onChange={(e) => setSalary(e.target.value)} placeholder="0" className={inputClass} />
                <Button variant="quiet" size="lg" loading={busy === 'salary'} onClick={saveSalary}>{t({ fr: 'Enregistrer', ht: 'Anrejistre' })}</Button>
              </div>
            </div>
            <Button variant="outline" size="lg" block onClick={() => openExpenseSheet({ household: true })}>
              <Home className="h-5 w-5" aria-hidden />
              {t({ fr: 'Je prends de l’argent pour la maison', ht: 'M pran lajan pou lakay' })}
            </Button>
          </Card>
        </Section>

        {/* ── La caisse de chaque aide (F22, Elit) ── */}
        {canUse('cash_control') && helpers.length > 0 && (
          <Section title={t({ fr: 'La caisse de chaque aide', ht: 'Kès chak èd' })}>
            <Card className="divide-y divide-border p-0 dark:divide-dark-border">
              {helpers.map((h) => {
                const last = closings.find((c) => c.memberUserId === h.user_id);
                return (
                  <div key={h.id} className="space-y-2 p-4">
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="text-body font-bold text-primary dark:text-dark-text">{h.full_name || h.email || t({ fr: 'Aide', ht: 'Èd' })}</span>
                      {last?.gap !== null && last?.gap !== undefined && (
                        <span className={cn('text-note font-bold', Math.abs(last.gap) < 1 ? 'text-success' : 'text-danger')}>
                          {last.day} · {Math.abs(last.gap) < 1 ? t({ fr: 'juste', ht: 'bon' }) : m(last.gap)}
                        </span>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <input
                        inputMode="decimal"
                        aria-label={t({ fr: 'Argent remis par l’aide', ht: 'Kòb èd la remèt' })}
                        value={helperCount[h.user_id] ?? ''}
                        onChange={(e) => setHelperCount((s) => ({ ...s, [h.user_id]: e.target.value }))}
                        placeholder={t({ fr: 'Argent remis', ht: 'Kòb li remèt' })}
                        className={inputClass}
                      />
                      <Button variant="quiet" size="lg" loading={busy === h.user_id} onClick={() => saveCount(h.user_id, helperCount[h.user_id] ?? '')}>
                        {t({ fr: 'Compter', ht: 'Konte' })}
                      </Button>
                    </div>
                  </div>
                );
              })}
            </Card>
            <p className="text-note text-muted dark:text-dark-muted">
              {t({
                fr: 'L’argent attendu d’un aide : ce qu’il a encaissé lui-même en espèces, moins ce qu’il a dépensé.',
                ht: 'Kòb yon èd dwe remèt : sa li touche an kach, mwens sa li depanse.',
              })}
            </p>
          </Section>
        )}

        {/* ── Les derniers soirs ── */}
        {closings.length > 0 && (
          <Section title={t({ fr: 'Les derniers soirs', ht: 'Dènye swa yo' })}>
            <Card className="divide-y divide-border p-0 dark:divide-dark-border">
              {closings.map((c) => (
                <div key={`${c.day}-${c.memberUserId ?? 'shop'}`} className="flex items-center justify-between gap-3 px-4 py-3">
                  <span className="min-w-0">
                    <span className="block text-body text-primary dark:text-dark-text">{c.day}</span>
                    <span className="block text-note text-muted">{c.memberName ?? t({ fr: 'Caisse du commerce', ht: 'Kès biznis la' })}</span>
                  </span>
                  <span className="text-right">
                    <span className="amount block text-body font-bold text-primary dark:text-dark-text">{c.counted !== null ? m(c.counted) : '—'}</span>
                    {c.gap !== null && (
                      <span className={cn('block text-note font-bold', Math.abs(c.gap) < 1 ? 'text-success' : 'text-danger')}>
                        {Math.abs(c.gap) < 1 ? t({ fr: 'juste', ht: 'bon' }) : `${c.gap > 0 ? '+' : '−'} ${m(Math.abs(c.gap))}`}
                      </span>
                    )}
                  </span>
                </div>
              ))}
            </Card>
          </Section>
        )}
      </Stack>
    </div>
  );
}

export default function CaissePage() {
  return (
    <ProtectedRoute>
      <CaisseInner />
    </ProtectedRoute>
  );
}
