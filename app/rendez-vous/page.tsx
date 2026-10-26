'use client';

// ─────────────────────────────────────────────────────────────────────────────
// Randevou — l'écran (F15)
//
// Les rendez-vous à venir, jour par jour. La veille, « Raple l » ouvre le
// message prérempli dans WhatsApp ; venu ou pas venu se note d'un tap — les
// absences, comptées, disent combien de créneaux elles coûtent.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useMemo, useState } from 'react';
import { MessageCircle, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { ProtectedRoute } from '../../components/ProtectedRoute';
import { useLanguage } from '../../components/LanguageWrapper';
import { useCompanyContext } from '../../contexts/CompanyContext';
import { Button, Card, FirstRun, Section, ScreenHeader, Stack } from '../../components/ds';
import {
  createAppointment, listAppointments, markReminderSent, setAppointmentStatus, type Appointment,
} from '../actions/appointments';
import { localDay, nextDay } from '../../lib/eveningReport';
import { cn } from '../../lib/utils';

const inputClass = 'min-h-13 w-full rounded-surface border border-border bg-surface px-4 text-body text-primary outline-none placeholder:text-muted focus:border-accent dark:border-dark-border dark:bg-dark-surface2 dark:text-dark-text';

function RendezVousInner() {
  const { t, language } = useLanguage();
  const { company } = useCompanyContext();
  const tz = company?.timezone || 'America/Port-au-Prince';
  const [list, setList] = useState<Appointment[] | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', phone: '', service: '', date: '', time: '10:00' });
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(() => {
    listAppointments().then((r) => { if (r.ok) setList(r.data); else { setList([]); toast.error(r.message); } }).catch(() => setList([]));
  }, []);
  useEffect(() => { load(); }, [load]);

  const today = localDay(new Date(), tz);
  const tomorrow = nextDay(today);

  const byDay = useMemo(() => {
    const map = new Map<string, Appointment[]>();
    for (const a of list ?? []) {
      if (a.status === 'cancelled') continue;
      const d = localDay(new Date(a.startsAt), tz);
      map.set(d, [...(map.get(d) ?? []), a]);
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [list, tz]);

  async function create() {
    if (!form.date) { toast.error(t({ fr: 'Choisissez le jour.', ht: 'Chwazi jou a.' })); return; }
    setBusy('create');
    // La date et l'heure sont celles du commerce ; le navigateur est dans le même fuseau.
    const res = await createAppointment({
      customerName: form.name, customerPhone: form.phone, service: form.service,
      startsAt: new Date(`${form.date}T${form.time}:00`).toISOString(),
    });
    setBusy(null);
    if (!res.ok) { toast.error(res.message); return; }
    toast.success(t({ fr: 'Rendez-vous noté.', ht: 'Randevou a note.' }));
    setForm({ name: '', phone: '', service: '', date: '', time: '10:00' });
    setShowForm(false);
    load();
  }

  async function status(a: Appointment, s: 'done' | 'no_show' | 'cancelled') {
    setBusy(`${a.id}-${s}`);
    const res = await setAppointmentStatus(a.id, s);
    setBusy(null);
    if (!res.ok) { toast.error(res.message); return; }
    load();
  }

  const timeOf = (iso: string) => new Date(iso).toLocaleTimeString(language === 'fr' ? 'fr-FR' : 'fr-HT', { hour: '2-digit', minute: '2-digit', timeZone: tz });
  const dayLabel = (d: string) => d === today ? t({ fr: 'Aujourd’hui', ht: 'Jodi a' })
    : d === tomorrow ? t({ fr: 'Demain', ht: 'Demen' })
    : new Date(`${d}T12:00:00`).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });

  return (
    <div className="pp-enter mx-auto w-full max-w-3xl px-4 py-6 sm:px-6">
      <Stack>
        <ScreenHeader
          title={t({ fr: 'Rendez-vous', ht: 'Randevou' })}
          subtitle={t({ fr: 'Un rappel la veille, un tap : moins d’absences, moins de créneaux perdus.', ht: 'Yon rapèl lavèy, yon tap : mwens moun ki pa vini, mwens tan pèdi.' })}
          action={!showForm ? (
            <Button variant="accent" size="md" onClick={() => setShowForm(true)}>
              <Plus className="h-5 w-5" aria-hidden />{t({ fr: 'Rendez-vous', ht: 'Randevou' })}
            </Button>
          ) : undefined}
        />

        {showForm && (
          <Section title={t({ fr: 'Nouveau rendez-vous', ht: 'Nouvo randevou' })}>
            <Card className="space-y-3 p-4">
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder={t({ fr: 'Client', ht: 'Kliyan' })} className={inputClass} />
              <input type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder={t({ fr: 'Téléphone (pour le rappel)', ht: 'Telefòn (pou rapèl la)' })} className={inputClass} />
              <input value={form.service} onChange={(e) => setForm({ ...form, service: e.target.value })} placeholder={t({ fr: 'Service (ex. : tresses)', ht: 'Sèvis (egz. : tès)' })} className={inputClass} />
              <div className="grid grid-cols-2 gap-2">
                <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} aria-label={t({ fr: 'Jour', ht: 'Jou' })} className={inputClass} />
                <input type="time" value={form.time} onChange={(e) => setForm({ ...form, time: e.target.value })} aria-label={t({ fr: 'Heure', ht: 'Lè' })} className={inputClass} />
              </div>
              <Button variant="accent" size="lg" block loading={busy === 'create'} onClick={create}>{t({ fr: 'Enregistrer', ht: 'Anrejistre' })}</Button>
            </Card>
          </Section>
        )}

        {list === null ? (
          <span className="pp-skeleton block h-32 rounded-surface" aria-hidden />
        ) : byDay.length === 0 ? (
          <FirstRun title={t({ fr: 'Aucun rendez-vous à venir', ht: 'Pa gen randevou k ap vini' })} />
        ) : (
          byDay.map(([day, items]) => (
            <Section key={day} title={dayLabel(day)}>
              <div className="space-y-2">
                {items.map((a) => (
                  <Card key={a.id} className={cn('space-y-2 p-4', a.status !== 'planned' && 'opacity-60')}>
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="min-w-0">
                        <span className="block truncate text-body font-bold text-primary dark:text-dark-text">{timeOf(a.startsAt)} · {a.customerName}</span>
                        {a.service && <span className="block text-note text-muted">{a.service}</span>}
                      </span>
                      {a.status === 'done' && <span className="text-note font-bold text-success">{t({ fr: 'Venu', ht: 'Vini' })}</span>}
                      {a.status === 'no_show' && <span className="text-note font-bold text-danger">{t({ fr: 'Absent', ht: 'Pa vini' })}</span>}
                    </div>
                    {a.status === 'planned' && (
                      <div className="grid grid-cols-3 gap-2">
                        <a
                          href={a.reminderLink}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={() => { void markReminderSent(a.id).then(load); }}
                          className={cn('pressable flex min-h-touch items-center justify-center gap-1 rounded-control text-note font-bold',
                            a.reminderSentAt ? 'bg-surface2 text-muted dark:bg-dark-surface2' : 'bg-accent text-accent-ink')}
                        >
                          <MessageCircle className="h-4 w-4" aria-hidden />
                          {a.reminderSentAt ? t({ fr: 'Rappelé', ht: 'Raple' }) : t({ fr: 'Rappeler', ht: 'Raple l' })}
                        </a>
                        <Button variant="quiet" size="sm" loading={busy === `${a.id}-done`} onClick={() => status(a, 'done')}>{t({ fr: 'Venu', ht: 'Vini' })}</Button>
                        <Button variant="quiet" size="sm" loading={busy === `${a.id}-no_show`} onClick={() => status(a, 'no_show')}>{t({ fr: 'Absent', ht: 'Pa vini' })}</Button>
                      </div>
                    )}
                  </Card>
                ))}
              </div>
            </Section>
          ))
        )}
      </Stack>
    </div>
  );
}

export default function RendezVousPage() {
  return (
    <ProtectedRoute>
      <RendezVousInner />
    </ProtectedRoute>
  );
}
