'use client';

// ─────────────────────────────────────────────────────────────────────────────
// Les contrats (§31, §32)
//
// Un contrat se distingue d'un autre document par une seule chose : il a une
// FIN. Cet écran est donc trié par cette fin, du plus proche au plus lointain,
// et les contrats sans date sont rejetés en queue — pas parce qu'ils comptent
// moins, mais parce qu'ils n'appellent aucune décision cette semaine.
//
// ── Ce que l'écran ne fait pas ──────────────────────────────────────────────
//
// Il ne signe rien. Le §40 dit explicitement de ne pas bâtir la signature
// électronique ; `signature_status` existe sur la ligne pour porter ce qu'un
// humain constate — « signé », « en attente » — et c'est tout. Une case à
// cocher qui prétendrait valoir signature serait pire que rien.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, FileSignature } from 'lucide-react';

import { listContracts, type ContractRow } from '../../actions/documentCompliance';
import { useLanguage } from '../../../components/LanguageWrapper';
import { usePermissions } from '../../../hooks/usePermissions';
import { PlanLockScreen } from '../../../components/PlanLock';
import { Button, Card, FirstRun, ScreenHeader } from '../../../components/ds';
import { ExpirationBadge, StatusBadge } from '../../../components/documents/DocumentBadges';

export default function ContractsPage() {
  const { t, language } = useLanguage();
  const { canUse, loading: permissionsLoading } = usePermissions();

  const [contracts, setContracts] = useState<ContractRow[]>([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState<string | null>(null);

  const allowed = canUse('document_contracts');

  useEffect(() => {
    if (!allowed) return;
    let cancelled = false;
    listContracts()
      .then((rows) => { if (!cancelled) { setContracts(rows); setError(null); } })
      .catch((err) => { if (!cancelled) setError(err instanceof Error ? err.message : 'Chargement impossible.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [allowed]);

  if (permissionsLoading) return null;

  if (!allowed) {
    return (
      <PlanLockScreen
        feature="document_contracts"
        title={t({ fr: 'Contrats', ht: 'Kontra' })}
        hint={t({
          fr: 'Vos engagements en cours, et la date à laquelle chacun se termine.',
          ht: 'Angajman ou yo, ak dat chak nan yo fini.',
        })}
      />
    );
  }

  // Ceux qui pressent d'abord : expirés, puis bientôt, puis le reste.
  const urgent = contracts.filter((c) => c.expiration === 'expired' || c.expiration === 'expiring_soon');
  const rest   = contracts.filter((c) => c.expiration !== 'expired' && c.expiration !== 'expiring_soon');

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
        title={t({ fr: 'Contrats', ht: 'Kontra' })}
        subtitle={t({
          fr: 'Bail, fournisseurs, employés — et quand chacun se termine',
          ht: 'Kontra kay, founisè, anplwaye — ak kilè chak fini',
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
      ) : contracts.length === 0 ? (
        <div className="mt-10">
          <FirstRun
            illustration={<FileSignature className="h-12 w-12" strokeWidth={1.2} aria-hidden />}
            title={t({ fr: 'Aucun contrat enregistré', ht: 'Pa gen kontra anrejistre' })}
            hint={t({
              fr: 'Déposez le bail du local ou l’accord d’un fournisseur, ou écrivez-en un depuis un modèle. La date de fin apparaîtra ici.',
              ht: 'Depoze kontra kay la oswa akò yon founisè, oswa ekri youn ak yon modèl. Dat fen an ap parèt isit.',
            })}
            action={
              <Link href="/documents/creer">
                <Button variant="accent" block>
                  {t({ fr: 'Écrire un contrat', ht: 'Ekri yon kontra' })}
                </Button>
              </Link>
            }
          />
        </div>
      ) : (
        <div className="mt-6 space-y-6">
          {urgent.length > 0 && (
            <div>
              <p className="mb-2 text-note font-bold uppercase tracking-widest text-muted dark:text-dark-muted">
                {t({ fr: 'À traiter', ht: 'Pou okipe' })}
              </p>
              <ContractList contracts={urgent} language={language} />
            </div>
          )}

          {rest.length > 0 && (
            <div>
              <p className="mb-2 text-note font-bold uppercase tracking-widest text-muted dark:text-dark-muted">
                {t({ fr: 'En cours', ht: 'An kou' })}
              </p>
              <ContractList contracts={rest} language={language} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ContractList({ contracts, language }: { contracts: ContractRow[]; language: 'fr' | 'ht' }) {
  const { t } = useLanguage();

  return (
    <ul className="space-y-2">
      {contracts.map((contract) => (
        <Card as="li" key={contract.id} interactive>
          <Link href={`/documents/${contract.id}`} className="flex min-h-touch items-center gap-3 px-4 py-3">
            <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-control bg-surface2 dark:bg-dark-surface2">
              <FileSignature className="h-5 w-5 text-muted" strokeWidth={1.6} aria-hidden />
            </span>

            <span className="min-w-0 flex-1">
              <span className="block truncate text-body font-bold text-primary dark:text-dark-text">
                {contract.name}
              </span>
              <span className="block truncate text-note text-muted dark:text-dark-muted">
                {(language === 'ht' ? contract.typeLabelHt : contract.typeLabelFr) ?? ''}
                {contract.expiresOn
                  ? ` · ${t({ fr: 'jusqu’au', ht: 'jiska' })} ${contract.expiresOn}`
                  : ` · ${t({ fr: 'sans date de fin', ht: 'san dat fen' })}`}
              </span>
            </span>

            <span className="flex flex-shrink-0 flex-wrap items-center justify-end gap-1.5">
              <ExpirationBadge expiration={contract.expiration} daysLeft={contract.daysLeft} />
              {contract.status !== 'active' && <StatusBadge status={contract.status} />}
            </span>
          </Link>
        </Card>
      ))}
    </ul>
  );
}
