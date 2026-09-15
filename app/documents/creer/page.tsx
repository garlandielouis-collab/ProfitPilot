'use client';

// ─────────────────────────────────────────────────────────────────────────────
// Créer un document (§18)
//
// Le §18 propose trois portes : vierge, modèle, IA. Deux sont ouvertes ici ; la
// troisième arrive avec le Studio (Phase 5) et n'est PAS affichée en attendant.
// Montrer une porte fermée avec « bientôt » sur la façade, c'est la promesse
// que le §83 interdit — on annonce ce qui existe.
//
// ── Pourquoi la page vierge d'abord ─────────────────────────────────────────
//
// Parce qu'elle marche pour tout le monde, à toutes les offres, et qu'elle
// demande une seule chose : un nom. Le modèle demande de choisir dans une
// liste, une langue, parfois un client — c'est plus rapide au bout du compte,
// mais c'est plus long à commencer.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, ArrowRight, FileText, LayoutTemplate } from 'lucide-react';

import { createBlankDocument } from '../../actions/documentTemplates';
import { useLanguage } from '../../../components/LanguageWrapper';
import { usePermissions } from '../../../hooks/usePermissions';
import { PlanTag } from '../../../components/PlanLock';
import { Button, Card, ScreenHeader } from '../../../components/ds';
import { unwrap, screenMessage  } from '../../../lib/actionResult';

export default function CreateDocumentPage() {
  const { t } = useLanguage();
  const router = useRouter();
  const { can, canUse } = usePermissions();

  const [name, setName]       = useState('');
  const [busy, setBusy]       = useState(false);
  const [error, setError]     = useState<string | null>(null);

  const mayCreate    = can('documents:create');
  const hasTemplates = canUse('document_templates');

  const createBlank = useCallback(async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setError(t({ fr: 'Donnez un nom au document.', ht: 'Bay dokiman an yon non.' }));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const { id } = unwrap(await createBlankDocument({ name: trimmed }));
      router.push(`/documents/${id}/editer`);
    } catch (err) {
      setError(screenMessage(err, 'Création impossible.'));
      setBusy(false);
    }
  }, [name, router, t]);

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
        title={t({ fr: 'Créer un document', ht: 'Kreye yon dokiman' })}
        subtitle={t({
          fr: 'Un document écrit ici se range, se cherche et s’imprime comme un document déposé.',
          ht: 'Yon dokiman ou ekri isit ap klase, ap chèche epi ap enprime menm jan ak yon dokiman ou depoze.',
        })}
      />

      {!mayCreate && (
        <Card className="mt-6 px-4 py-5">
          <p className="text-body text-text2 dark:text-dark-text2">
            {t({
              fr: 'Votre rôle ne permet pas de créer des documents.',
              ht: 'Wòl ou pa pèmèt ou kreye dokiman.',
            })}
          </p>
        </Card>
      )}

      {mayCreate && (
        <div className="mt-6 space-y-4">
          {/* ── Page vierge ─────────────────────────────────────────────── */}
          <Card className="p-5">
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-control bg-surface2 dark:bg-dark-surface2">
                <FileText className="h-5 w-5 text-muted" strokeWidth={1.6} aria-hidden />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-body font-bold text-primary dark:text-dark-text">
                  {t({ fr: 'Partir d’une page vierge', ht: 'Kòmanse ak yon paj vid' })}
                </p>
                <p className="mt-1 text-note text-muted dark:text-dark-muted">
                  {t({
                    fr: 'Vous écrivez tout. Titre, paragraphes, tableau, signatures.',
                    ht: 'Se ou ki ekri tout. Tit, paragraf, tablo, siyati.',
                  })}
                </p>
              </div>
            </div>

            <div className="mt-4 flex flex-col gap-2 sm:flex-row">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') void createBlank(); }}
                placeholder={t({ fr: 'Nom du document', ht: 'Non dokiman an' })}
                aria-label={t({ fr: 'Nom du document', ht: 'Non dokiman an' })}
                maxLength={200}
                className="min-h-action w-full rounded-surface border border-border bg-white px-4 text-body text-primary outline-none placeholder:text-muted focus:border-primary/40 dark:border-dark-border dark:bg-dark-surface dark:text-dark-text"
              />
              <Button
                variant="accent"
                loading={busy}
                loadingLabel={t({ fr: 'Création…', ht: 'Ap kreye…' })}
                onClick={() => void createBlank()}
              >
                {t({ fr: 'Créer', ht: 'Kreye' })}
              </Button>
            </div>

            {error && <p className="mt-3 text-note text-danger" role="alert">{error}</p>}
          </Card>

          {/* ── Modèle ──────────────────────────────────────────────────── */}
          <Card interactive={hasTemplates} className="p-5">
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-control bg-surface2 dark:bg-dark-surface2">
                <LayoutTemplate className="h-5 w-5 text-muted" strokeWidth={1.6} aria-hidden />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="text-body font-bold text-primary dark:text-dark-text">
                    {t({ fr: 'Partir d’un modèle', ht: 'Kòmanse ak yon modèl' })}
                  </p>
                  <PlanTag feature="document_templates" />
                </div>
                <p className="mt-1 text-note text-muted dark:text-dark-muted">
                  {t({
                    fr: 'Contrat de travail, reconnaissance de dette, devis, procédure — le texte est écrit, vos informations sont déjà dedans.',
                    ht: 'Kontra travay, rekonesans dèt, deviz, pwosedi — tèks la ekri deja, enfòmasyon ou yo deja ladan l.',
                  })}
                </p>
              </div>
            </div>

            {hasTemplates && (
              <div className="mt-4">
                <Link href="/documents/modeles">
                  <Button variant="soft" block
                          icon={<ArrowRight className="h-4 w-4" strokeWidth={1.8} aria-hidden />}>
                    {t({ fr: 'Voir les modèles', ht: 'Wè modèl yo' })}
                  </Button>
                </Link>
              </div>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}
