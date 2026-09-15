'use client';

// ─────────────────────────────────────────────────────────────────────────────
// Éditer un document écrit (§20, §38)
//
// L'écran est mince : il charge, il confie l'édition à `DocumentEditor`, il
// enregistre. Toute la matière est ailleurs — c'est voulu, parce que le même
// éditeur servira au Studio IA (Phase 5) sans être réécrit.
//
// ── Un document déposé n'arrive jamais ici ──────────────────────────────────
//
// Un PDF scanné n'a pas de blocs à modifier. Si l'adresse est forcée à la main,
// l'écran le dit et renvoie sur la fiche, où le bon geste — déposer une
// nouvelle version — se trouve.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

import { getDocument, type DocumentDetail } from '../../../actions/documents';
import { saveDocumentContent } from '../../../actions/documentTemplates';
import { useLanguage } from '../../../../components/LanguageWrapper';
import { usePermissions } from '../../../../hooks/usePermissions';
import { Button, Card, ScreenHeader } from '../../../../components/ds';
import { DocumentEditor } from '../../../../components/documents/DocumentEditor';
import type { PlainBlock } from '../../../../lib/documents/blocks';
import { screenMessage, unwrap } from '../../../../lib/actionResult';

export default function EditDocumentPage() {
  const { t } = useLanguage();
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = params?.id;

  const { can } = usePermissions();

  const [doc, setDoc]         = useState<DocumentDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);
  const [saved, setSaved]     = useState<number | null>(null);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    getDocument(id)
      .then(unwrap)
      .then((result) => { if (!cancelled) setDoc(result); })
      .catch((err) => { if (!cancelled) setError(screenMessage(err, 'Chargement impossible.')); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [id]);

  const save = useCallback(async (blocks: PlainBlock[]) => {
    if (!id) return;
    const result = await saveDocumentContent(id, blocks);
    setSaved(result.changed ? result.version : null);
  }, [id]);

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <span className="h-8 w-8 animate-spin rounded-pill border-2 border-border border-t-primary"
              aria-label={t({ fr: 'Chargement', ht: 'Chajman' })} />
      </div>
    );
  }

  if (error || !doc) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-8">
        <Card className="px-4 py-6 text-center">
          <p className="text-body text-text2 dark:text-dark-text2">
            {error ?? t({ fr: 'Ce document est introuvable.', ht: 'Dokiman sa a pa jwenn.' })}
          </p>
          <div className="mt-4">
            <Link href="/documents/bibliotheque">
              <Button variant="quiet">{t({ fr: 'Retour à la bibliothèque', ht: 'Tounen nan bibliyotèk la' })}</Button>
            </Link>
          </div>
        </Card>
      </div>
    );
  }

  if (!doc.contentBlocks) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-8">
        <Card className="px-4 py-6 text-center">
          <p className="text-body text-text2 dark:text-dark-text2">
            {t({
              fr: 'Ce document est un fichier déposé : son contenu ne se modifie pas ici. Déposez-en une nouvelle version depuis sa fiche.',
              ht: 'Dokiman sa a se yon fichye ou depoze : kontni l pa chanje isit. Depoze yon nouvo vèsyon nan fich li.',
            })}
          </p>
          <div className="mt-4">
            <Link href={`/documents/${doc.id}`}>
              <Button variant="quiet">{t({ fr: 'Voir la fiche', ht: 'Wè fich la' })}</Button>
            </Link>
          </div>
        </Card>
      </div>
    );
  }

  if (!can('documents:update')) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-8">
        <Card className="px-4 py-6 text-center">
          <p className="text-body text-text2 dark:text-dark-text2">
            {t({
              fr: 'Votre rôle ne permet pas de modifier ce document.',
              ht: 'Wòl ou pa pèmèt ou chanje dokiman sa a.',
            })}
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-8">
      <Link
        href={`/documents/${doc.id}`}
        className="pressable mb-4 inline-flex min-h-touch items-center gap-2 text-note font-bold text-muted dark:text-dark-muted"
      >
        <ArrowLeft className="h-4 w-4" strokeWidth={1.8} aria-hidden />
        {t({ fr: 'Fiche du document', ht: 'Fich dokiman an' })}
      </Link>

      <ScreenHeader
        title={doc.name}
        subtitle={saved
          ? t({ fr: `Version ${saved} enregistrée`, ht: `Vèsyon ${saved} anrejistre` })
          : t({ fr: 'Chaque enregistrement garde le passé', ht: 'Chak anrejistreman kenbe sa ki te la anvan' })}
      />

      <div className="mt-6">
        <DocumentEditor
          initial={doc.contentBlocks}
          onSave={save}
          onCancel={() => router.push(`/documents/${doc.id}`)}
        />
      </div>
    </div>
  );
}
