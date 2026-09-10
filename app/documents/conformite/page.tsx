'use client';

// ─────────────────────────────────────────────────────────────────────────────
// Le centre de conformité (§33, §35, §51, §64)
//
// Trois blocs, dans l'ordre où ils comptent : ce qui est déjà tombé, ce qui va
// tomber, et ce qui manque depuis toujours.
//
// ── La phrase que cet écran n'a pas le droit de dire ────────────────────────
//
// « Vous êtes en infraction. » Aucune ligne du référentiel livré ne porte de
// source réglementaire vérifiée ; l'application ne peut donc PAS parler
// d'obligation légale, et elle ne le fait pas. Elle dit « recommandé », elle
// explique pourquoi en termes de commerce — « sans ce papier, la banque refuse
// le dossier » — et quand une ligne portera une source, elle l'affichera avec
// un lien cliquable. C'est le §51 et le §83 pris au mot.
//
// ── Le calendrier ───────────────────────────────────────────────────────────
//
// Groupé par mois, et les documents DÉJÀ expirés sont sortis de la frise. Les
// laisser dans le mois où ils sont tombés les rendrait équivalents à ceux qui
// vont tomber — alors que l'un demande d'agir aujourd'hui et l'autre de noter
// une date.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, ArrowLeft, CalendarClock, ExternalLink, ShieldCheck } from 'lucide-react';

import {
  getComplianceCalendar, getComplianceOverview,
  type CalendarEntry, type CalendarMonth,
} from '../../actions/documentCompliance';
import { useLanguage } from '../../../components/LanguageWrapper';
import { usePermissions } from '../../../hooks/usePermissions';
import { PlanLockScreen } from '../../../components/PlanLock';
import { Badge, Button, Card, FirstRun, ScreenHeader, Section, Stack } from '../../../components/ds';
import { HealthScoreCard } from '../../../components/documents/HealthScoreCard';
import { MISSING_LABELS } from '../../../lib/documents/requirements';
import type { HealthScore } from '../../../lib/documents/health';

function monthLabel(month: string, language: 'fr' | 'ht'): string {
  return new Date(`${month}-01T00:00:00`).toLocaleDateString(
    language === 'ht' ? 'fr-HT' : 'fr-FR',
    { month: 'long', year: 'numeric' },
  );
}

export default function CompliancePage() {
  const { t, language } = useLanguage();
  const { canUse, loading: permissionsLoading } = usePermissions();

  const [score, setScore]       = useState<HealthScore | null>(null);
  const [expired, setExpired]   = useState<CalendarEntry[]>([]);
  const [upcoming, setUpcoming] = useState<CalendarMonth[]>([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);

  const allowed = canUse('document_compliance') || canUse('document_health');

  useEffect(() => {
    if (!allowed) return;
    let cancelled = false;

    // Le score et le calendrier sont gardés par deux capacités différentes :
    // une offre peut couvrir l'une sans l'autre, et l'écran doit alors montrer
    // ce qu'elle couvre plutôt que de refuser en bloc.
    Promise.allSettled([getComplianceOverview(), getComplianceCalendar()])
      .then(([overview, calendar]) => {
        if (cancelled) return;
        if (overview.status === 'fulfilled') setScore(overview.value);
        if (calendar.status === 'fulfilled') {
          setExpired(calendar.value.expired);
          setUpcoming(calendar.value.upcoming);
        }
        if (overview.status === 'rejected' && calendar.status === 'rejected') {
          setError(overview.reason instanceof Error ? overview.reason.message : 'Chargement impossible.');
        }
      })
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [allowed]);

  if (permissionsLoading) return null;

  if (!allowed) {
    return (
      <PlanLockScreen
        feature="document_compliance"
        title={t({ fr: 'Conformité', ht: 'Konfòmite' })}
        hint={t({
          fr: 'Le score de vos papiers, ce qui expire, et ce qui manque.',
          ht: 'Nòt papye ou yo, sa k ap ekspire, ak sa ki manke.',
        })}
      />
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-8">
      <Link
        href="/documents"
        className="pressable mb-4 inline-flex min-h-touch items-center gap-2 text-note font-bold text-muted dark:text-dark-muted"
      >
        <ArrowLeft className="h-4 w-4" strokeWidth={1.8} aria-hidden />
        {t({ fr: 'Documents', ht: 'Dokiman' })}
      </Link>

      <ScreenHeader
        title={t({ fr: 'Conformité', ht: 'Konfòmite' })}
        subtitle={t({
          fr: 'Ce qui est en règle, ce qui expire, ce qui manque',
          ht: 'Sa ki an règ, sa k ap ekspire, sa ki manke',
        })}
      />

      {loading ? (
        <div className="flex justify-center py-16">
          <span className="h-6 w-6 animate-spin rounded-pill border-2 border-border border-t-primary" />
        </div>
      ) : error ? (
        <Card className="mt-6 px-4 py-5">
          <p className="text-body text-danger" role="alert">{error}</p>
        </Card>
      ) : score?.state === 'first_run' ? (
        <div className="mt-10">
          <FirstRun
            illustration={<ShieldCheck className="h-12 w-12" strokeWidth={1.2} aria-hidden />}
            title={t({ fr: 'Rien à mesurer pour le moment', ht: 'Pa gen anyen pou mezire pou kounye a' })}
            hint={t({
              fr: 'Le score de vos papiers se calcule sur ce que vous avez déposé. Déposez un premier document — une patente, un bail — et il apparaîtra ici.',
              ht: 'Nòt papye ou yo kalkile sou sa ou depoze. Depoze yon premye dokiman — yon patant, yon kontra kay — epi l ap parèt isit.',
            })}
            action={
              <Link href="/documents">
                <Button variant="accent" block>
                  {t({ fr: 'Aller aux documents', ht: 'Ale nan dokiman yo' })}
                </Button>
              </Link>
            }
          />
        </div>
      ) : (
        <Stack className="mt-6">
          {score && <HealthScoreCard score={score} />}

          {/* ── Déjà expiré : rien ne passe avant ─────────────────────────── */}
          {expired.length > 0 && (
            <Section title={t({ fr: 'Expiré', ht: 'Ekspire' })}>
              <ul className="space-y-2">
                {expired.map((entry) => (
                  <Card as="li" key={entry.id} interactive>
                    <Link href={`/documents/${entry.id}`} className="flex min-h-touch items-center gap-3 px-4 py-3">
                      <AlertTriangle className="h-5 w-5 flex-shrink-0 text-danger" strokeWidth={1.8} aria-hidden />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-body font-bold text-primary dark:text-dark-text">
                          {entry.name}
                        </span>
                        <span className="block text-note text-danger">
                          {t({
                            fr: `Expiré depuis ${Math.abs(entry.daysLeft)} jour${Math.abs(entry.daysLeft) > 1 ? 's' : ''}`,
                            ht: `Ekspire depi ${Math.abs(entry.daysLeft)} jou`,
                          })}
                        </span>
                      </span>
                    </Link>
                  </Card>
                ))}
              </ul>
            </Section>
          )}

          {/* ── Le calendrier (§35) ───────────────────────────────────────── */}
          {upcoming.length > 0 && (
            <Section title={t({ fr: 'Les mois qui viennent', ht: 'Mwa k ap vini yo' })}>
              <div className="space-y-4">
                {upcoming.map((month) => (
                  <div key={month.month}>
                    <p className="mb-2 text-note font-bold uppercase tracking-widest text-muted dark:text-dark-muted">
                      {monthLabel(month.month, language)}
                    </p>
                    <ul className="space-y-2">
                      {month.entries.map((entry) => (
                        <Card as="li" key={entry.id} interactive>
                          <Link href={`/documents/${entry.id}`} className="flex min-h-touch items-center gap-3 px-4 py-3">
                            <CalendarClock
                              className={`h-5 w-5 flex-shrink-0 ${entry.expiration === 'expiring_soon' ? 'text-warning' : 'text-muted'}`}
                              strokeWidth={1.8} aria-hidden
                            />
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-body font-bold text-primary dark:text-dark-text">
                                {entry.name}
                              </span>
                              <span className="block text-note text-muted dark:text-dark-muted">
                                {(language === 'ht' ? entry.typeLabelHt : entry.typeLabelFr)
                                  ?? t({ fr: 'Sans type', ht: 'San kalite' })}
                              </span>
                            </span>
                            <span className="amount flex-shrink-0 text-note text-muted dark:text-dark-muted">
                              {t({ fr: `J-${entry.daysLeft}`, ht: `J-${entry.daysLeft}` })}
                            </span>
                          </Link>
                        </Card>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </Section>
          )}

          {expired.length === 0 && upcoming.length === 0 && (
            <Card className="flex items-center gap-3 px-4 py-4">
              <CalendarClock className="h-5 w-5 flex-shrink-0 text-success" strokeWidth={1.8} aria-hidden />
              <p className="text-body text-text2 dark:text-dark-text2">
                {t({
                  fr: 'Aucune échéance dans les six prochains mois.',
                  ht: 'Pa gen okenn dat limit nan sis mwa k ap vini yo.',
                })}
              </p>
            </Card>
          )}

          {/* ── Ce qui manque (§51) ───────────────────────────────────────── */}
          {score && score.missing.length > 0 && (
            <Section title={t({ fr: 'Ce qui manque', ht: 'Sa ki manke' })}>
              <ul className="space-y-2">
                {score.missing.map((item) => (
                  <Card as="li" key={item.id} className="px-4 py-3">
                    <div className="flex items-start gap-3">
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-2">
                          <span className="text-body font-bold text-primary dark:text-dark-text">
                            {language === 'ht' ? item.typeLabelHt : item.typeLabelFr}
                          </span>
                          <Badge tone={item.reason === 'expired' ? 'danger' : 'neutral'}>
                            {t(MISSING_LABELS[item.reason])}
                          </Badge>
                        </span>

                        <span className="mt-1 block text-note text-text2 dark:text-dark-text2">
                          {t(item.rationale)}
                        </span>

                        {/* §51 : la source, quand elle existe, est cliquable.
                            Sans source, aucune mention d'obligation — et c'est
                            la contrainte SQL qui le garantit, pas cet écran. */}
                        {item.sourceUrl && (
                          <a
                            href={item.sourceUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="mt-2 inline-flex min-h-touch items-center gap-1.5 text-note font-semibold text-primary hover:underline dark:text-accent"
                          >
                            {t({ fr: 'Voir la source', ht: 'Wè sous la' })}
                            <ExternalLink className="h-3.5 w-3.5" strokeWidth={1.8} aria-hidden />
                          </a>
                        )}
                      </span>

                      {item.documentId && (
                        <Link href={`/documents/${item.documentId}`}
                              className="pressable flex-shrink-0 text-note font-semibold text-primary dark:text-accent">
                          {t({ fr: 'Voir', ht: 'Wè' })}
                        </Link>
                      )}
                    </div>
                  </Card>
                ))}
              </ul>

              <p className="mt-3 text-note text-muted dark:text-dark-muted">
                {t({
                  fr: 'Ces documents sont recommandés, pas exigés par la loi : ProfitPilot ne donne pas de conseil juridique.',
                  ht: 'Dokiman sa yo se rekòmandasyon, se pa lalwa ki mande yo : ProfitPilot pa bay konsèy jiridik.',
                })}
              </p>
            </Section>
          )}
        </Stack>
      )}
    </div>
  );
}
