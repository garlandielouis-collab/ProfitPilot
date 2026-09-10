'use client';

// ─────────────────────────────────────────────────────────────────────────────
// La bibliothèque de modèles (§19, §53)
//
// Une liste, six familles, et une feuille qui pose les trois seules questions
// qui restent : dans quelle langue, pour qui, sous quel nom.
//
// ── Le choix de la langue est en tête, et il est irréversible ───────────────
//
// Un contrat de travail est en français OU en créole. Le proposer en fin de
// parcours, après avoir choisi l'employé, obligerait à tout recommencer pour
// se corriger. Le poser en premier, avec le français par défaut — la langue
// des documents administratifs haïtiens — évite la question dans la plupart
// des cas.
//
// ── Ce que la feuille demande, et ce qu'elle ne demande pas ─────────────────
//
// Elle ne demande QUE ce que le modèle réclame vraiment : un modèle qui parle
// d'un employé demande un employé, les autres non. C'est `variables` sur la
// ligne du modèle qui le dit — d'où sa présence en base à côté du corps.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { AlertTriangle, ArrowLeft, FileSignature } from 'lucide-react';

import {
  createDocumentFromTemplate, listDocumentTemplates,
  type TemplateSummary,
} from '../../actions/documentTemplates';
import { listCustomersLight, listEmployeesLight, listSuppliersLight } from '../../actions/documentSources';
import { useLanguage } from '../../../components/LanguageWrapper';
import { usePermissions } from '../../../hooks/usePermissions';
import { PlanLockScreen } from '../../../components/PlanLock';
import {
  BottomSheet, Button, Card, FilterPill, FirstRun, ScreenHeader, SelectField,
} from '../../../components/ds';
import { scopesRequired, type VariableScope } from '../../../lib/documents/variables';
import {
  CATEGORY_LABELS, CATEGORY_ORDER, type DocumentCategory,
} from '../../../lib/documents/types';
import type { BlockLanguage } from '../../../lib/documents/blocks';

type Option = { id: string; label: string };

export default function TemplatesPage() {
  const { t, language } = useLanguage();
  const router = useRouter();
  const { can, canUse, loading: permissionsLoading } = usePermissions();

  const [templates, setTemplates] = useState<TemplateSummary[]>([]);
  const [category, setCategory]   = useState<DocumentCategory | 'all'>('all');
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState<string | null>(null);

  const [chosen, setChosen] = useState<TemplateSummary | null>(null);

  const allowed = canUse('document_templates') && can('documents:read');

  useEffect(() => {
    if (!allowed) return;
    let cancelled = false;
    setLoading(true);
    listDocumentTemplates(category)
      .then((rows) => { if (!cancelled) { setTemplates(rows); setError(null); } })
      .catch((err) => { if (!cancelled) setError(err instanceof Error ? err.message : 'Chargement impossible.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [allowed, category]);

  if (permissionsLoading) return null;

  if (!canUse('document_templates')) {
    return (
      <PlanLockScreen
        feature="document_templates"
        title={t({ fr: 'Modèles de documents', ht: 'Modèl dokiman' })}
        hint={t({
          fr: 'Contrats, devis, procédures — écrits, avec vos informations déjà dedans.',
          ht: 'Kontra, deviz, pwosedi — ekri deja, ak enfòmasyon ou yo ladan l.',
        })}
      />
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-8">
      <Link
        href="/documents/creer"
        className="pressable mb-4 inline-flex min-h-touch items-center gap-2 text-note font-bold text-muted dark:text-dark-muted"
      >
        <ArrowLeft className="h-4 w-4" strokeWidth={1.8} aria-hidden />
        {t({ fr: 'Créer un document', ht: 'Kreye yon dokiman' })}
      </Link>

      <ScreenHeader
        title={t({ fr: 'Modèles', ht: 'Modèl' })}
        subtitle={t({
          fr: 'Le texte est écrit. Vos informations se remplissent seules.',
          ht: 'Tèks la ekri deja. Enfòmasyon ou yo antre pou kont yo.',
        })}
      />

      <div className="-mx-4 mt-6 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">
        <FilterPill
          label={t({ fr: 'Tout', ht: 'Tout' })}
          selected={category === 'all'}
          onClick={() => setCategory('all')}
        />
        {CATEGORY_ORDER.map((key) => (
          <FilterPill
            key={key}
            label={t(CATEGORY_LABELS[key])}
            selected={category === key}
            onClick={() => setCategory(category === key ? 'all' : key)}
          />
        ))}
      </div>

      <div className="mt-6">
        {error ? (
          <Card className="px-4 py-5">
            <p className="text-body text-danger" role="alert">{error}</p>
          </Card>
        ) : loading ? (
          <div className="flex justify-center py-10">
            <span className="h-6 w-6 animate-spin rounded-pill border-2 border-border border-t-primary" />
          </div>
        ) : templates.length === 0 ? (
          <FirstRun
            title={t({ fr: 'Aucun modèle dans cette famille', ht: 'Pa gen modèl nan fanmi sa a' })}
            hint={t({
              fr: 'Choisissez une autre famille, ou partez d’une page vierge.',
              ht: 'Chwazi yon lòt fanmi, oswa kòmanse ak yon paj vid.',
            })}
            action={
              <Link href="/documents/creer">
                <Button variant="accent" block>
                  {t({ fr: 'Page vierge', ht: 'Paj vid' })}
                </Button>
              </Link>
            }
          />
        ) : (
          <ul className="space-y-2">
            {templates.map((template) => (
              <Card as="li" key={template.id} interactive>
                <button
                  type="button"
                  onClick={() => setChosen(template)}
                  className="flex min-h-touch w-full items-center gap-3 px-4 py-3 text-left"
                >
                  <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-control bg-surface2 dark:bg-dark-surface2">
                    <FileSignature className="h-5 w-5 text-muted" strokeWidth={1.6} aria-hidden />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-body font-bold text-primary dark:text-dark-text">
                      {language === 'ht' ? template.titleHt : template.titleFr}
                    </span>
                    <span className="block text-note text-muted dark:text-dark-muted">
                      {(language === 'ht' ? template.summaryHt : template.summaryFr)
                        ?? t(CATEGORY_LABELS[template.category])}
                    </span>
                  </span>
                  {template.requiresProfessionalReview && (
                    <AlertTriangle
                      className="h-4 w-4 flex-shrink-0 text-warning"
                      strokeWidth={1.8}
                      aria-label={t({ fr: 'À faire vérifier', ht: 'Pou fè verifye' })}
                    />
                  )}
                </button>
              </Card>
            ))}
          </ul>
        )}
      </div>

      {chosen && (
        <UseTemplateSheet
          template={chosen}
          onClose={() => setChosen(null)}
          onCreated={(id) => router.push(`/documents/${id}/editer`)}
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// La feuille — trois questions, pas une de plus
// ─────────────────────────────────────────────────────────────────────────────

function UseTemplateSheet({
  template, onClose, onCreated,
}: {
  template: TemplateSummary;
  onClose: () => void;
  onCreated: (documentId: string) => void;
}) {
  const { t, language: uiLanguage } = useLanguage();

  const scopes = useMemo(() => scopesRequired(template.variables), [template.variables]);

  const [documentLanguage, setDocumentLanguage] = useState<BlockLanguage>(uiLanguage === 'ht' ? 'ht' : 'fr');
  const [name, setName]   = useState('');
  const [source, setSource] = useState<Record<VariableScope, string>>({
    company: '', date: '', customer: '', employee: '', supplier: '',
  });

  const [options, setOptions] = useState<Partial<Record<VariableScope, Option[]>>>({});
  const [busy, setBusy]   = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Les listes ne se chargent que si le modèle en a besoin — et une seule fois.
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const next: Partial<Record<VariableScope, Option[]>> = {};
      await Promise.all(scopes.map(async (scope) => {
        try {
          if (scope === 'customer') next.customer = await listCustomersLight();
          if (scope === 'employee') next.employee = await listEmployeesLight();
          if (scope === 'supplier') next.supplier = await listSuppliersLight();
        } catch {
          // Une liste indisponible n'empêche pas d'écrire le document : les
          // variables concernées deviendront des traits à remplir à la main.
        }
      }));
      if (!cancelled) setOptions(next);
    };
    void load();
    return () => { cancelled = true; };
  }, [scopes]);

  const title = documentLanguage === 'ht' ? template.titleHt : template.titleFr;

  const create = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const { id } = await createDocumentFromTemplate({
        templateId: template.id,
        name: name.trim() || undefined,
        language: documentLanguage,
        sources: {
          customerId: source.customer || undefined,
          employeeId: source.employee || undefined,
          supplierId: source.supplier || undefined,
        },
      });
      onCreated(id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Création impossible.');
      setBusy(false);
    }
  }, [template.id, name, documentLanguage, source, onCreated]);

  return (
    <BottomSheet
      open
      onClose={onClose}
      title={title}
      footer={
        <div className="flex gap-3">
          <Button variant="quiet" onClick={onClose} disabled={busy}>
            {t({ fr: 'Annuler', ht: 'Anile' })}
          </Button>
          <Button
            variant="accent"
            block
            loading={busy}
            loadingLabel={t({ fr: 'Création…', ht: 'Ap kreye…' })}
            onClick={() => void create()}
          >
            {t({ fr: 'Créer le document', ht: 'Kreye dokiman an' })}
          </Button>
        </div>
      }
    >
      {template.requiresProfessionalReview && (
        <p className="mb-4 rounded-control border border-amber-300 bg-amber-50 px-4 py-3 text-note text-amber-900">
          {t({
            fr: 'Ce modèle engage juridiquement. Faites-le vérifier par un professionnel avant de le signer — l’application ne donne pas de conseil juridique.',
            ht: 'Modèl sa a gen valè legal. Fè yon pwofesyonèl verifye l anvan ou siyen — aplikasyon an pa bay konsèy jiridik.',
          })}
        </p>
      )}

      <SelectField
        label={t({ fr: 'Langue du document', ht: 'Lang dokiman an' })}
        hint={t({
          fr: 'Un document réel est écrit dans une seule langue. Ce choix ne se change plus ensuite.',
          ht: 'Yon vre dokiman ekri nan yon sèl lang. Chwa sa a p ap chanje apre.',
        })}
        value={documentLanguage}
        onChange={(e) => setDocumentLanguage(e.target.value === 'ht' ? 'ht' : 'fr')}
        options={[
          { value: 'fr', label: 'Français' },
          { value: 'ht', label: 'Kreyòl' },
        ]}
      />

      {scopes.includes('customer') && (
        <SelectField
          label={t({ fr: 'Client concerné', ht: 'Kliyan ki konsène' })}
          value={source.customer}
          onChange={(e) => setSource((s) => ({ ...s, customer: e.target.value }))}
          options={[
            { value: '', label: t({ fr: 'À remplir à la main', ht: 'Pou ranpli alamen' }) },
            ...(options.customer ?? []).map((o) => ({ value: o.id, label: o.label })),
          ]}
        />
      )}

      {scopes.includes('employee') && (
        <SelectField
          label={t({ fr: 'Employé concerné', ht: 'Anplwaye ki konsène' })}
          value={source.employee}
          onChange={(e) => setSource((s) => ({ ...s, employee: e.target.value }))}
          options={[
            { value: '', label: t({ fr: 'À remplir à la main', ht: 'Pou ranpli alamen' }) },
            ...(options.employee ?? []).map((o) => ({ value: o.id, label: o.label })),
          ]}
        />
      )}

      {scopes.includes('supplier') && (
        <SelectField
          label={t({ fr: 'Fournisseur concerné', ht: 'Founisè ki konsène' })}
          value={source.supplier}
          onChange={(e) => setSource((s) => ({ ...s, supplier: e.target.value }))}
          options={[
            { value: '', label: t({ fr: 'À remplir à la main', ht: 'Pou ranpli alamen' }) },
            ...(options.supplier ?? []).map((o) => ({ value: o.id, label: o.label })),
          ]}
        />
      )}

      <label className="mt-4 block">
        <span className="text-note font-bold text-primary dark:text-dark-text">
          {t({ fr: 'Nom du document', ht: 'Non dokiman an' })}
        </span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={title}
          maxLength={200}
          className="mt-1 min-h-action w-full rounded-surface border border-border bg-white px-4 text-body text-primary outline-none placeholder:text-muted focus:border-primary/40 dark:border-dark-border dark:bg-dark-surface dark:text-dark-text"
        />
      </label>

      {error && <p className="mt-3 text-note text-danger" role="alert">{error}</p>}
    </BottomSheet>
  );
}
