'use client';

// ─────────────────────────────────────────────────────────────────────────────
// Sòl ak sabotaj — l'écran (F17)
//
// Une ligne par sòl : la cotisation, la prochaine date, ce qui est déjà versé,
// et la main. Un tap pour noter la cotisation du jour : elle sort de la caisse
// attendue, pas du profit.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useState } from 'react';
import { PiggyBank } from 'lucide-react';
import { toast } from 'sonner';
import { ProtectedRoute } from '../../components/ProtectedRoute';
import { useLanguage } from '../../components/LanguageWrapper';
import { Button, Card, FirstRun, Section, ScreenHeader, Stack } from '../../components/ds';
import { closeSol, createSol, listSol, recordSolPayment, type SolFrequency, type SolGroupView } from '../actions/sol';
import { formatMoney, localDay } from '../../lib/eveningReport';
import { cn } from '../../lib/utils';

const inputClass = 'min-h-13 w-full rounded-surface border border-border bg-surface px-4 text-body text-primary outline-none placeholder:text-muted focus:border-accent dark:border-dark-border dark:bg-dark-surface2 dark:text-dark-text';

function SolInner() {
  const { t } = useLanguage();
  const [groups, setGroups] = useState<SolGroupView[] | null>(null);
  const [kind, setKind] = useState<'sol' | 'sabotaj'>('sol');
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [frequency, setFrequency] = useState<SolFrequency>('weekly');
  const [hands, setHands] = useState('');
  const [start, setStart] = useState(() => localDay(new Date(), 'America/Port-au-Prince'));
  const [payout, setPayout] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  const load = useCallback(() => {
    listSol().then((r) => { if (r.ok) setGroups(r.data); else { setGroups([]); toast.error(r.message); } }).catch(() => setGroups([]));
  }, []);
  useEffect(() => { load(); }, [load]);

  const FREQ: Record<SolFrequency, { fr: string; ht: string }> = {
    daily:   { fr: 'Chaque jour', ht: 'Chak jou' },
    weekly:  { fr: 'Chaque semaine', ht: 'Chak semèn' },
    monthly: { fr: 'Chaque mois', ht: 'Chak mwa' },
  };

  async function create() {
    setBusy('create');
    const res = await createSol({
      kind, name: name || (kind === 'sol' ? 'Sòl' : 'Sabotaj'),
      contribution: Number(amount.replace(',', '.')), frequency,
      hands: hands ? Number(hands) : null, startDate: start, payoutDate: payout || null,
    });
    setBusy(null);
    if (!res.ok) { toast.error(res.message); return; }
    toast.success(t({ fr: 'Sòl enregistré.', ht: 'Sòl la anrejistre.' }));
    setName(''); setAmount(''); setHands(''); setPayout(''); setShowForm(false);
    load();
  }

  async function pay(g: SolGroupView, direction: 'in' | 'out') {
    setBusy(`${g.id}-${direction}`);
    const res = await recordSolPayment({
      solId: g.id, direction, amount: direction === 'out' ? g.contribution : (g.payoutAmount ?? g.contribution),
    });
    setBusy(null);
    if (!res.ok) { toast.error(res.message); return; }
    toast.success(direction === 'out'
      ? t({ fr: 'Cotisation notée : elle sort de la caisse.', ht: 'Kotizasyon an note : li soti nan kès la.' })
      : t({ fr: 'Main reçue : elle entre dans la caisse.', ht: 'Men an resevwa : li antre nan kès la.' }));
    load();
  }

  return (
    <div className="pp-enter mx-auto w-full max-w-3xl px-4 py-6 sm:px-6">
      <Stack>
        <ScreenHeader
          title={t({ fr: 'Sòl et sabotaj', ht: 'Sòl ak sabotaj' })}
          subtitle={t({ fr: 'Les cotisations sortent de la caisse, pas du profit. La veille, le bilan vous prévient.', ht: 'Kotizasyon yo soti nan kès la, pa nan pwofi a. Lavèy, rapò a avèti w.' })}
        />

        {groups === null ? (
          <span className="pp-skeleton block h-32 rounded-surface" aria-hidden />
        ) : groups.length === 0 && !showForm ? (
          <FirstRun
            illustration={<PiggyBank className="h-10 w-10 text-muted" aria-hidden />}
            title={t({ fr: 'Aucun sòl pour l’instant', ht: 'Pa gen sòl ankò' })}
            hint={t({ fr: 'Notez votre sòl ou votre sabotaj : la caisse attendue en tiendra compte.', ht: 'Note sòl ou oswa sabotaj ou : kès atandi a ap konte l.' })}
            action={<Button variant="accent" size="lg" block onClick={() => setShowForm(true)}>{t({ fr: 'Ajouter un sòl', ht: 'Ajoute yon sòl' })}</Button>}
          />
        ) : (
          <div className="space-y-3">
            {groups.map((g) => (
              <Card key={g.id} className="space-y-3 p-4">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="min-w-0">
                    <span className="block truncate text-card font-bold text-primary dark:text-dark-text">{g.name}</span>
                    <span className="block text-note text-muted">
                      {formatMoney(g.contribution, 'HTG')} · {t(FREQ[g.frequency])}
                      {g.nextDue ? ` · ${t({ fr: 'prochaine', ht: 'pwochen' })} ${g.nextDue}` : ''}
                    </span>
                  </span>
                  <span className="text-right text-note text-muted">
                    {t({ fr: 'Versé', ht: 'Vèse' })}<br />
                    <span className="amount text-body font-bold text-primary dark:text-dark-text">{formatMoney(g.paidIn, 'HTG')}</span>
                  </span>
                </div>
                {g.payoutDate && (
                  <p className="text-note text-text2 dark:text-dark-text2">
                    {t({ fr: `Votre main : ${g.payoutDate}`, ht: `Men pa w : ${g.payoutDate}` })}
                    {g.payoutAmount ? ` · ${formatMoney(g.payoutAmount, 'HTG')}` : ''}
                    {g.received > 0 ? ` · ${t({ fr: 'reçue', ht: 'resevwa' })}` : ''}
                  </p>
                )}
                <div className="grid grid-cols-2 gap-2">
                  <Button variant={g.paidToday ? 'quiet' : 'accent'} size="md" loading={busy === `${g.id}-out`} onClick={() => pay(g, 'out')}>
                    {g.paidToday ? t({ fr: 'Payé aujourd’hui ✓', ht: 'Peye jodi a ✓' }) : t({ fr: 'J’ai cotisé', ht: 'M kotize' })}
                  </Button>
                  <Button variant="outline" size="md" loading={busy === `${g.id}-in`} onClick={() => pay(g, 'in')}>
                    {t({ fr: 'J’ai reçu ma main', ht: 'M resevwa men m' })}
                  </Button>
                </div>
                <Button variant="link" size="sm" onClick={async () => { const r = await closeSol(g.id); if (r.ok) load(); else toast.error(r.message); }}>
                  {t({ fr: 'Sòl terminé', ht: 'Sòl la fini' })}
                </Button>
              </Card>
            ))}
            {!showForm && (
              <Button variant="quiet" size="lg" block onClick={() => setShowForm(true)}>{t({ fr: 'Ajouter un sòl', ht: 'Ajoute yon sòl' })}</Button>
            )}
          </div>
        )}

        {showForm && (
          <Section title={t({ fr: 'Nouveau sòl', ht: 'Nouvo sòl' })}>
            <Card className="space-y-3 p-4">
              <div className="grid grid-cols-2 gap-2" role="radiogroup">
                {(['sol', 'sabotaj'] as const).map((k) => (
                  <button key={k} type="button" role="radio" aria-checked={kind === k} onClick={() => setKind(k)}
                    className={cn('pressable min-h-touch rounded-control text-body font-bold', kind === k ? 'bg-primary text-white' : 'bg-surface2 text-primary dark:bg-dark-surface2 dark:text-dark-text')}>
                    {k === 'sol' ? 'Sòl' : 'Sabotaj'}
                  </button>
                ))}
              </div>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder={t({ fr: 'Nom (ex. : sòl du marché)', ht: 'Non (egz. : sòl mache a)' })} className={inputClass} />
              <input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder={t({ fr: 'Cotisation (G)', ht: 'Kotizasyon (G)' })} className={`${inputClass} amount`} />
              <div className="grid grid-cols-3 gap-2" role="radiogroup">
                {(Object.keys(FREQ) as SolFrequency[]).map((f) => (
                  <button key={f} type="button" role="radio" aria-checked={frequency === f} onClick={() => setFrequency(f)}
                    className={cn('pressable min-h-touch rounded-control text-note font-bold', frequency === f ? 'bg-primary text-white' : 'bg-surface2 text-primary dark:bg-dark-surface2 dark:text-dark-text')}>
                    {t(FREQ[f])}
                  </button>
                ))}
              </div>
              <label className="block space-y-1">
                <span className="text-note font-bold uppercase tracking-wide text-muted">{t({ fr: 'Première cotisation', ht: 'Premye kotizasyon' })}</span>
                <input type="date" value={start} onChange={(e) => setStart(e.target.value)} className={inputClass} />
              </label>
              <input inputMode="numeric" value={hands} onChange={(e) => setHands(e.target.value.replace(/\D/g, ''))} placeholder={t({ fr: 'Nombre de mains (facultatif)', ht: 'Konbyen men (si w konnen)' })} className={inputClass} />
              <label className="block space-y-1">
                <span className="text-note font-bold uppercase tracking-wide text-muted">{t({ fr: 'Date de votre main (facultatif)', ht: 'Dat men pa w (si w konnen)' })}</span>
                <input type="date" value={payout} onChange={(e) => setPayout(e.target.value)} className={inputClass} />
              </label>
              <Button variant="accent" size="lg" block loading={busy === 'create'} onClick={create}>{t({ fr: 'Enregistrer', ht: 'Anrejistre' })}</Button>
            </Card>
          </Section>
        )}
      </Stack>
    </div>
  );
}

export default function SolPage() {
  return (
    <ProtectedRoute>
      <SolInner />
    </ProtectedRoute>
  );
}
