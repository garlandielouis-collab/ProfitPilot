'use client';

// ─────────────────────────────────────────────────────────────────────────────
// Documents — l'accueil du centre documentaire (§4, §6)
//
// L'ordre du §6 : score de santé → problèmes critiques → expirations proches →
// récemment modifiés → documents manquants → actions rapides.
//
// ── Le score et les manquants ───────────────────────────────────────────────
//
// Ils sont calculés par `getComplianceOverview()` (`lib/documents/health.ts`),
// sur le référentiel `document_requirements`. L'accueil n'en montre qu'une
// ligne — la note et le nombre de manquants — qui mène au détail sur
// `/documents/conformite`. Rien tant que l'offre ne couvre pas
// `document_health`, rien non plus en `first_run` : on ne note pas un classeur
// vide.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AlertTriangle, ArrowRight, CalendarClock, FolderOpen, PenLine, ShieldCheck, Upload } from 'lucide-react';

import {
  getDocumentsOverview, listDocumentTypes,
  type DocumentsOverview, type DocumentTypeOption,
} from '../actions/documents';
import { getComplianceOverview } from '../actions/documentCompliance';
import { usePermissions } from '../../hooks/usePermissions';
import { STATE_LABELS, type HealthScore } from '../../lib/documents/health';
import { useLanguage } from '../../components/LanguageWrapper';
import { Button, Card, FirstRun, ScreenHeader, Section, Stack } from '../../components/ds';
import { DocumentList } from '../../components/documents/DocumentList';
import { DocumentUploader } from '../../components/documents/DocumentUploader';
import { PlanTag } from '../../components/PlanLock';
import { CATEGORY_LABELS, CATEGORY_ORDER } from '../../lib/documents/types';
import { screenMessage, unwrap } from '../../lib/actionResult';

export default function DocumentsPage() {
  const { t } = useLanguage();
  const router = useRouter();

  const [data, setData]   = useState<DocumentsOverview | null>(null);
  const [types, setTypes] = useState<DocumentTypeOption[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [uploadOpen, setUploadOpen] = useState(false);

  const reload = useCallback(async () => {
    try {
      const [overview, catalogue] = await Promise.all([
        getDocumentsOverview(),
        listDocumentTypes().then(unwrap),
      ]);
      setData(overview);
      setTypes(catalogue);
    } catch (err) {
      setError(screenMessage(err, 'Chargement impossible.'));
    }
  }, []);

  useEffect(() => { void reload(); }, [reload]);

  // Lu seulement si l'offre le couvre : l'action exige `document_health`, et
  // un refus serveur ne doit pas vider l'accueil.
  const { canUse, loading: permissionsLoading } = usePermissions();
  const healthAllowed = !permissionsLoading && canUse('document_health');
  const [health, setHealth] = useState<HealthScore | null>(null);

  useEffect(() => {
    if (!healthAllowed) return;
    let cancelled = false;
    getComplianceOverview()
      .then((score) => { if (!cancelled) setHealth(score); })
      .catch(() => { /* un raccourci en moins, l'accueil reste lisible */ });
    return () => { cancelled = true; };
  }, [healthAllowed]);

  if (error && !data) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-8">
        <div className="flex items-start gap-2 rounded-control bg-danger-sub px-3 py-3">
          <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-danger" strokeWidth={1.8} aria-hidden />
          <p className="text-body text-danger">{error}</p>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <span
          className="h-8 w-8 animate-spin rounded-pill border-2 border-border border-t-primary"
          aria-label={t({ fr: 'Chargement', ht: 'Chajman' })}
        />
      </div>
    );
  }

  const uploader = (
    <DocumentUploader
      open={uploadOpen}
      onClose={() => setUploadOpen(false)}
      types={types}
      onUploaded={(id) => router.push(`/documents/${id}`)}
    />
  );

  // ── Premier accueil : le classeur est vide, et il le dit (§68) ────────────
  if (data.empty) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-8">
        <ScreenHeader
          title={t({ fr: 'Documents', ht: 'Dokiman' })}
          subtitle={t({
            fr: 'Les papiers du commerce, à un seul endroit',
            ht: 'Papye komès la, nan yon sèl kote',
          })}
        />

        <div className="mt-10">
          <FirstRun
            illustration={<FolderOpen className="h-12 w-12" strokeWidth={1.2} aria-hidden />}
            title={t({
              fr: 'Aucun document pour le moment',
              ht: 'Pa gen dokiman pou kounye a',
            })}
            hint={t({
              fr: 'Patente, contrat de bail, factures de fournisseurs : déposez-les ici et vous saurez toujours où ils sont — et quand ils expirent.',
              ht: 'Patant, kontra kay, fakti founisè : depoze yo la epi w ap toujou konnen kote yo ye — ak ki lè yo ekspire.',
            })}
            action={
              <div className="flex flex-col gap-2">
                <Button variant="accent" block icon={<Upload className="h-4 w-4" strokeWidth={1.8} aria-hidden />}
                        onClick={() => setUploadOpen(true)}>
                  {t({ fr: 'Déposer un document', ht: 'Depoze yon dokiman' })}
                </Button>
                <Link href="/documents/creer">
                  <Button variant="quiet" block icon={<PenLine className="h-4 w-4" strokeWidth={1.8} aria-hidden />}>
                    {t({ fr: 'Écrire un document', ht: 'Ekri yon dokiman' })}
                  </Button>
                </Link>
              </div>
            }
          />
        </div>

        {uploader}
      </div>
    );
  }

  const categoryTally = CATEGORY_ORDER
    .map((category) => ({
      category,
      count: data.byCategory.find((c) => c.category === category)?.count ?? 0,
    }))
    .filter((c) => c.count > 0);

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-8">
      <ScreenHeader
        title={t({ fr: 'Documents', ht: 'Dokiman' })}
        subtitle={t({
          fr: `${data.total} document${data.total > 1 ? 's' : ''} rangé${data.total > 1 ? 's' : ''}`,
          ht: `${data.total} dokiman klase`,
        })}
        action={
          <div className="flex gap-2">
            {/* Déposer reste l'action principale — c'est le geste de tous les
                jours. Écrire est à côté, en second : on n'écrit un contrat que
                de temps en temps, mais on le cherche là où on l'a écrit. */}
            <Link href="/documents/creer">
              <Button size="sm" variant="quiet"
                      icon={<PenLine className="h-4 w-4" strokeWidth={1.8} aria-hidden />}>
                {t({ fr: 'Écrire', ht: 'Ekri' })}
              </Button>
            </Link>
            <Button size="sm" variant="accent"
                    icon={<Upload className="h-4 w-4" strokeWidth={1.8} aria-hidden />}
                    onClick={() => setUploadOpen(true)}>
              {t({ fr: 'Déposer', ht: 'Depoze' })}
            </Button>
          </div>
        }
      />

      <Stack className="mt-6">
        {/* ── La note d'abord (§6), en une ligne ─────────────────────────── */}
        {health && health.total !== null && (
          <Card interactive>
            <Link href="/documents/conformite" className="flex min-h-touch items-center gap-3 px-4 py-3">
              <ShieldCheck className="h-5 w-5 flex-shrink-0 text-muted" strokeWidth={1.8} aria-hidden />
              <span className="min-w-0 flex-1">
                <span className="block text-body font-bold text-primary dark:text-dark-text">
                  {t({ fr: 'Santé des papiers', ht: 'Sante papye yo' })}{' '}
                  <span className="amount">{health.total}</span>
                  <span className="font-normal text-muted dark:text-dark-muted"> / 100</span>
                </span>
                <span className="block truncate text-note text-muted dark:text-dark-muted">
                  {t(STATE_LABELS[health.state])}
                  {' · '}
                  {health.missing.length === 0
                    ? t({ fr: 'rien ne manque', ht: 'anyen pa manke' })
                    : t({
                        fr: `${health.missing.length} document${health.missing.length > 1 ? 's' : ''} manquant${health.missing.length > 1 ? 's' : ''} ou à renouveler`,
                        ht: `${health.missing.length} dokiman ki manke oswa pou renouvle`,
                      })}
                </span>
              </span>
              <ArrowRight className="h-4 w-4 flex-shrink-0 text-muted" strokeWidth={1.8} aria-hidden />
            </Link>
          </Card>
        )}

        {/* ── Ce qui est déjà dépassé. Rien ne passe avant. ───────────────── */}
        {data.expired.length > 0 && (
          <Section title={t({ fr: 'Expiré', ht: 'Ekspire' })}>
            <DocumentList documents={data.expired} />
          </Section>
        )}

        {/* ── Ce qui va l'être, dans les trente jours ─────────────────────── */}
        {data.expiringSoon.length > 0 && (
          <Section title={t({ fr: 'À renouveler bientôt', ht: 'Pou renouvle byento' })}>
            <DocumentList documents={data.expiringSoon} />
          </Section>
        )}

        {/* ── L'absence d'échéance est elle-même une information ──────────── */}
        {data.expired.length === 0 && data.expiringSoon.length === 0 && (
          <Card className="flex items-center gap-3 px-4 py-4">
            <CalendarClock className="h-5 w-5 flex-shrink-0 text-success" strokeWidth={1.8} aria-hidden />
            <p className="text-body text-text2 dark:text-dark-text2">
              {t({
                fr: 'Aucune échéance dans les trente prochains jours.',
                ht: 'Pa gen okenn dat limit nan trant jou k ap vini yo.',
              })}
            </p>
          </Card>
        )}

        {/* ── Récemment modifiés ─────────────────────────────────────────── */}
        {data.recent.length > 0 && (
          <Section
            title={t({ fr: 'Derniers documents', ht: 'Dènye dokiman yo' })}
            action={
              <Link href="/documents/bibliotheque"
                    className="pressable inline-flex min-h-touch items-center gap-1 text-note font-bold text-primary dark:text-dark-text">
                {t({ fr: 'Tout voir', ht: 'Wè tout' })}
                <ArrowRight className="h-4 w-4" strokeWidth={1.8} aria-hidden />
              </Link>
            }
          >
            <DocumentList documents={data.recent} />
          </Section>
        )}

        {/* ── Les autres écrans du module ─────────────────────────────────
            Le §2 en demandait douze au menu ; ils sont ici, à l'intérieur de
            /documents, sous forme de destinations plutôt que d'entrées de
            barre latérale. Les pastilles disent celles que l'offre ne couvre
            pas encore — et le clic mène à l'écran qui l'explique. */}
        <Section title={t({ fr: 'Aller plus loin', ht: 'Ale pi lwen' })}>
          <ul className="space-y-2">
            {[
              { href: '/documents/conformite', feature: 'document_compliance' as const,
                label: { fr: 'Conformité', ht: 'Konfòmite' },
                hint:  { fr: 'Le score de vos papiers, et ce qui manque', ht: 'Nòt papye ou yo, ak sa ki manke' } },
              { href: '/documents/contrats', feature: 'document_contracts' as const,
                label: { fr: 'Contrats', ht: 'Kontra' },
                hint:  { fr: 'Vos engagements et leur date de fin', ht: 'Angajman ou yo ak dat yo fini' } },
              { href: '/documents/modeles', feature: 'document_templates' as const,
                label: { fr: 'Modèles', ht: 'Modèl' },
                hint:  { fr: 'Contrats et procédures déjà rédigés', ht: 'Kontra ak pwosedi ki ekri deja' } },
            ].map((entry) => (
              <Card as="li" key={entry.href} interactive>
                <Link href={entry.href} className="flex min-h-touch items-center gap-3 px-4 py-3">
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="text-body font-bold text-primary dark:text-dark-text">
                        {t(entry.label)}
                      </span>
                      <PlanTag feature={entry.feature} />
                    </span>
                    <span className="block truncate text-note text-muted dark:text-dark-muted">
                      {t(entry.hint)}
                    </span>
                  </span>
                  <ArrowRight className="h-4 w-4 flex-shrink-0 text-muted" strokeWidth={1.8} aria-hidden />
                </Link>
              </Card>
            ))}
          </ul>
        </Section>

        {/* ── La répartition : elle sert de raccourci, pas de décoration ──── */}
        {categoryTally.length > 0 && (
          <Section title={t({ fr: 'Par famille', ht: 'Pa fanmi' })}>
            <div className="flex flex-wrap gap-2">
              {categoryTally.map(({ category, count }) => (
                <Link
                  key={category}
                  href={`/documents/bibliotheque?categorie=${category}`}
                  className="pressable inline-flex min-h-touch items-center gap-2 rounded-pill bg-surface2 px-4 text-note font-bold text-text2 hover:bg-border dark:bg-dark-surface2 dark:text-dark-text2"
                >
                  {t(CATEGORY_LABELS[category])}
                  <span className="amount text-muted">{count}</span>
                </Link>
              ))}
            </div>
          </Section>
        )}
      </Stack>

      {uploader}
    </div>
  );
}
