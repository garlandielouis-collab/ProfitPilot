'use client';

// ─────────────────────────────────────────────────────────────────────────────
// La fiche d'un document (§15)
//
// Deux colonnes sur un écran large, deux blocs empilés sur un téléphone :
// l'aperçu d'abord, les informations ensuite. C'est l'ordre dans lequel on
// vérifie un papier — on le regarde, puis on lit ce qu'on en sait.
//
// ── L'aperçu ────────────────────────────────────────────────────────────────
//
// Le fichier n'est jamais servi depuis le bucket : l'`src` pointe sur
// `/api/documents/[id]/file`, qui vérifie l'accès puis redirige vers une URL
// signée de soixante secondes. Le navigateur ne connaît donc jamais le chemin
// de stockage, et un lien copié depuis l'inspecteur ne vaut rien une minute
// plus tard.
//
// Les formats que le navigateur ne sait pas rendre — Word, Excel — n'ont pas
// d'aperçu bricolé. Une carte le dit et propose le téléchargement. Un aperçu
// faux serait pire que pas d'aperçu.
//
// ── Ce que l'écran refuse de faire ──────────────────────────────────────────
//
// Il ne masque pas les boutons qu'il ne peut pas garantir. « Supprimer »
// n'apparaît qu'avec la permission correspondante, mais s'il apparaissait à
// tort, c'est `assertAccess()` côté serveur — et la politique RLS derrière —
// qui refuserait. L'interface range ; elle ne protège pas.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useReactToPrint } from 'react-to-print';
import {
  AlertTriangle, ArrowLeft, Archive, ArchiveRestore, Download, FileText,
  History, Pencil, Printer, Trash2, Upload,
} from 'lucide-react';

import {
  getDocument, listDocumentTypes, updateDocument, archiveDocument, deleteDocument,
  logDocumentAccess,
  type DocumentDetail, type DocumentTypeOption,
} from '../../actions/documents';
import { useLanguage } from '../../../components/LanguageWrapper';
import { usePermissions } from '../../../hooks/usePermissions';
import {
  Badge, BottomSheet, Button, Card, Field, ScreenHeader, SelectField, Section, Stack,
} from '../../../components/ds';
import { restoreDocumentVersion } from '../../actions/documentVersions';
import { ExpirationBadge, StatusBadge, VisibilityBadge } from '../../../components/documents/DocumentBadges';
import { DocumentSheet } from '../../../components/documents/DocumentBlocks';
import { NewVersionSheet } from '../../../components/documents/NewVersionSheet';
import { formatBytes } from '../../../lib/documents/storage';
import {
  CATEGORY_LABELS, STATUS_LABELS, VISIBILITY_LABELS,
  type Bilingual, type DocumentEntityType, type DocumentRelation,
  type DocumentStatus, type DocumentVisibility,
} from '../../../lib/documents/types';

/** Les onze valeurs de `document_links.entity_type`, dites au marchand. */
const ENTITY_LABELS: Record<DocumentEntityType, Bilingual> = {
  business:    { fr: 'Entreprise',  ht: 'Antrepriz' },
  employee:    { fr: 'Employé',     ht: 'Anplwaye' },
  customer:    { fr: 'Client',      ht: 'Kliyan' },
  supplier:    { fr: 'Fournisseur', ht: 'Founisè' },
  product:     { fr: 'Produit',     ht: 'Pwodwi' },
  order:       { fr: 'Commande',    ht: 'Kòmann' },
  sale:        { fr: 'Vente',       ht: 'Vant' },
  purchase:    { fr: 'Achat',       ht: 'Acha' },
  expense:     { fr: 'Dépense',     ht: 'Depans' },
  contract:    { fr: 'Contrat',     ht: 'Kontra' },
  transaction: { fr: 'Transaction', ht: 'Tranzaksyon' },
};

const RELATION_LABELS: Record<DocumentRelation, Bilingual> = {
  attached:      { fr: 'Joint',      ht: 'Tache' },
  signed_by:     { fr: 'Signé par',  ht: 'Siyen pa' },
  issued_to:     { fr: 'Remis à',    ht: 'Remèt bay' },
  received_from: { fr: 'Reçu de',    ht: 'Resevwa nan men' },
  concerns:      { fr: 'Concerne',   ht: 'Konsène' },
};

/**
 * La fiche de l'entité, quand une adresse sait l'ouvrir. Seul l'écran des
 * clients relit un identifiant (`/customers?id=`) ; les autres n'ont pas de
 * fiche adressable, et un lien vers une liste ferait chercher à nouveau.
 */
function entityHref(entityType: string, entityId: string): string | null {
  if (entityType === 'customer') return `/customers?id=${encodeURIComponent(entityId)}`;
  return null;
}

/** Les statuts qu'un marchand pose lui-même. `expired` est calculé depuis la
 *  date, `archived` a son propre bouton : ni l'un ni l'autre ne se choisit. */
const EDITABLE_STATUSES: DocumentStatus[] = [
  'draft', 'active', 'pending_review', 'approved', 'needs_update',
];

const VISIBILITIES: DocumentVisibility[] = ['company', 'restricted', 'private'];

function formatDate(iso: string, language: 'fr' | 'ht'): string {
  return new Date(iso).toLocaleDateString(language === 'ht' ? 'fr-HT' : 'fr-FR', {
    day: '2-digit', month: 'long', year: 'numeric',
  });
}

export function DocumentDetailClient({ documentId }: { documentId: string }) {
  const { t, language } = useLanguage();
  const { can } = usePermissions();
  const router = useRouter();

  const [doc, setDoc]     = useState<DocumentDetail | null>(null);
  const [types, setTypes] = useState<DocumentTypeOption[]>([]);
  const [missing, setMissing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy]   = useState(false);

  const [editOpen, setEditOpen] = useState(false);
  const [versionOpen, setVersionOpen] = useState(false);

  // La feuille imprimable d'un document écrit. `react-to-print` a besoin du
  // nœud lui-même : le PDF sort de la boîte d'impression du navigateur, sans
  // dépendance serveur ni police à embarquer (§55).
  const sheetRef = useRef<HTMLDivElement>(null);
  const print = useReactToPrint({ contentRef: sheetRef, documentTitle: 'ProfitPilot' });
  const [form, setForm] = useState({
    name: '', description: '', typeId: '', expiresOn: '',
    status: 'active' as DocumentStatus, visibility: 'company' as DocumentVisibility,
  });

  const reload = useCallback(async () => {
    try {
      const found = await getDocument(documentId);
      if (!found) { setMissing(true); return; }
      setDoc(found);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Chargement impossible.');
    }
  }, [documentId]);

  useEffect(() => { void reload(); }, [reload]);

  useEffect(() => {
    listDocumentTypes().then(setTypes).catch(() => { /* la fiche se lit sans le catalogue */ });
  }, []);

  // §43 : la consultation est un événement auditable, y compris pour un format
  // sans aperçu. La route de fichier journalise ce qu'elle sert ; ouvrir la
  // fiche d'un `.docx` ne passe par elle qu'au téléchargement, et « qui a
  // ouvert ce contrat » resterait alors sans réponse. Une fois par ouverture,
  // pas à chaque rechargement de la fiche.
  useEffect(() => {
    void logDocumentAccess(documentId, 'view');
  }, [documentId]);

  const typeOptions = useMemo(
    () => types.map((ty) => ({
      value: ty.id,
      label: `${t(CATEGORY_LABELS[ty.category])} · ${language === 'ht' ? ty.labelHt : ty.labelFr}`,
    })),
    [types, t, language],
  );

  const openEditor = useCallback(() => {
    if (!doc) return;
    setForm({
      name:       doc.name,
      description: doc.description ?? '',
      typeId:     types.find((ty) => ty.key === doc.typeKey)?.id ?? '',
      expiresOn:  doc.expiresOn ?? '',
      status:     doc.status === 'expired' || doc.status === 'archived' ? 'active' : doc.status,
      visibility: doc.visibility,
    });
    setEditOpen(true);
  }, [doc, types]);

  const restore = useCallback(async (versionId: string) => {
    setBusy(true);
    setError(null);
    try {
      await restoreDocumentVersion(documentId, versionId);
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Restauration impossible.');
    } finally {
      setBusy(false);
    }
  }, [documentId, reload]);

  const save = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      await updateDocument(documentId, {
        name:        form.name,
        description: form.description || null,
        documentTypeId: form.typeId || null,
        expiresOn:   form.expiresOn || null,
        status:      form.status,
        visibility:  form.visibility,
      });
      setEditOpen(false);
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Enregistrement impossible.');
    } finally {
      setBusy(false);
    }
  }, [documentId, form, reload]);

  const toggleArchive = useCallback(async () => {
    if (!doc) return;
    setBusy(true);
    try {
      await archiveDocument(documentId, doc.status !== 'archived');
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Action impossible.');
    } finally {
      setBusy(false);
    }
  }, [doc, documentId, reload]);

  const remove = useCallback(async () => {
    // Une suppression se confirme, et la phrase nomme le document : « Supprimer
    // ce document ? » laisse le doute sur lequel.
    const confirmed = window.confirm(t({
      fr: `Supprimer « ${doc?.name} » ? Le document ne s’affichera plus dans la bibliothèque.`,
      ht: `Efase « ${doc?.name} » ? Dokiman an p ap parèt nan bibliyotèk la ankò.`,
    }));
    if (!confirmed) return;

    setBusy(true);
    try {
      await deleteDocument(documentId);
      router.push('/documents/bibliotheque');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Suppression impossible.');
      setBusy(false);
    }
  }, [doc, documentId, router, t]);

  // ── États de chargement ───────────────────────────────────────────────────

  if (missing) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-8">
        <Card className="px-4 py-10 text-center">
          <p className="text-body font-bold text-primary dark:text-dark-text">
            {t({ fr: 'Document introuvable', ht: 'Dokiman pa jwenn' })}
          </p>
          <p className="mt-2 text-body text-text2 dark:text-dark-text2">
            {t({
              fr: 'Il a été supprimé, ou il ne vous est pas ouvert.',
              ht: 'Yo efase l, oswa li pa louvri pou ou.',
            })}
          </p>
          <div className="mt-6 flex justify-center">
            <Link href="/documents/bibliotheque">
              <Button variant="quiet">{t({ fr: 'Retour à la bibliothèque', ht: 'Tounen nan bibliyotèk la' })}</Button>
            </Link>
          </div>
        </Card>
      </div>
    );
  }

  if (!doc) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <span className="h-8 w-8 animate-spin rounded-pill border-2 border-border border-t-primary"
              aria-label={t({ fr: 'Chargement', ht: 'Chajman' })} />
      </div>
    );
  }

  const fileUrl     = `/api/documents/${doc.id}/file`;
  const downloadUrl = `${fileUrl}?download=1`;
  const isImage = (doc.mimeType ?? '').startsWith('image/');
  const isPdf   = doc.mimeType === 'application/pdf';
  const typeLabel = language === 'ht' ? doc.typeLabelHt : doc.typeLabelFr;

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-8">
      <Link
        href="/documents/bibliotheque"
        className="pressable mb-4 inline-flex min-h-touch items-center gap-2 text-note font-bold text-muted dark:text-dark-muted"
      >
        <ArrowLeft className="h-4 w-4" strokeWidth={1.8} aria-hidden />
        {t({ fr: 'Bibliothèque', ht: 'Bibliyotèk' })}
      </Link>

      <ScreenHeader
        title={doc.name}
        subtitle={typeLabel ?? t({ fr: 'Sans type', ht: 'San kalite' })}
        action={
          doc.contentBlocks ? (
            <Button size="sm" variant="quiet" onClick={() => print()}
                    icon={<Printer className="h-4 w-4" strokeWidth={1.8} aria-hidden />}>
              {t({ fr: 'Imprimer', ht: 'Enprime' })}
            </Button>
          ) : doc.hasFile ? (
            <a href={downloadUrl} download>
              <Button size="sm" variant="quiet"
                      icon={<Download className="h-4 w-4" strokeWidth={1.8} aria-hidden />}>
                {t({ fr: 'Télécharger', ht: 'Telechaje' })}
              </Button>
            </a>
          ) : undefined
        }
      />

      {error && (
        <div className="mt-4 flex items-start gap-2 rounded-control bg-danger-sub px-3 py-3">
          <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-danger" strokeWidth={1.8} aria-hidden />
          <p className="text-body text-danger">{error}</p>
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <StatusBadge status={doc.status} />
        <ExpirationBadge expiration={doc.expiration} daysLeft={doc.daysLeft} />
        <VisibilityBadge visibility={doc.visibility} />
        {doc.version > 1 && (
          <Badge tone="neutral">{t({ fr: `Version ${doc.version}`, ht: `Vèsyon ${doc.version}` })}</Badge>
        )}
      </div>

      <Stack className="mt-6">
        {/* ── L'aperçu ───────────────────────────────────────────────────── */}
        <Section title={t({ fr: 'Aperçu', ht: 'Apèsi' })}>
          {doc.contentBlocks ? (
            // La MÊME feuille à l'écran et au papier : personne ne signe un
            // document dont il n'a pas vu la version imprimée.
            <Card className="overflow-x-auto">
              <DocumentSheet ref={sheetRef} title={doc.name} blocks={doc.contentBlocks} />
            </Card>
          ) : isImage ? (
            <Card className="overflow-hidden">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={fileUrl} alt={doc.name} className="max-h-[70vh] w-full object-contain" />
            </Card>
          ) : isPdf ? (
            <Card className="overflow-hidden">
              <iframe src={fileUrl} title={doc.name} className="h-[70vh] w-full" />
            </Card>
          ) : (
            <Card className="flex flex-col items-center gap-3 px-4 py-10 text-center">
              <FileText className="h-8 w-8 text-muted" strokeWidth={1.4} aria-hidden />
              <p className="text-body text-text2 dark:text-dark-text2">
                {doc.mimeType
                  ? t({
                      fr: 'Ce format ne se lit pas dans le navigateur.',
                      ht: 'Fòma sa a pa ka li nan navigatè a.',
                    })
                  : t({
                      fr: 'Ce document n’a pas de fichier joint.',
                      ht: 'Dokiman sa a pa gen fichye ladan l.',
                    })}
              </p>
              {doc.mimeType && (
                <a href={downloadUrl} download>
                  <Button variant="quiet"
                          icon={<Download className="h-4 w-4" strokeWidth={1.8} aria-hidden />}>
                    {t({ fr: 'Télécharger', ht: 'Telechaje' })}
                  </Button>
                </a>
              )}
            </Card>
          )}
        </Section>

        {/* ── Ce qu'on sait ──────────────────────────────────────────────── */}
        <Section title={t({ fr: 'Informations', ht: 'Enfòmasyon' })}>
          <Card className="divide-y divide-border dark:divide-dark-border">
            <InfoRow label={t({ fr: 'Statut', ht: 'Estati' })} value={t(STATUS_LABELS[doc.status])} />
            <InfoRow
              label={t({ fr: 'Visible par', ht: 'Vizib pou' })}
              value={t(VISIBILITY_LABELS[doc.visibility])}
            />
            {doc.expiresOn && (
              <InfoRow
                label={t({ fr: 'Expire le', ht: 'Ekspire le' })}
                value={formatDate(doc.expiresOn, language)}
              />
            )}
            {doc.sizeBytes !== null && (
              <InfoRow label={t({ fr: 'Taille', ht: 'Gwosè' })} value={formatBytes(doc.sizeBytes)} />
            )}
            <InfoRow
              label={t({ fr: 'Modifié le', ht: 'Modifye le' })}
              value={formatDate(doc.updatedAt, language)}
            />
            {doc.description && (
              <InfoRow label={t({ fr: 'Note', ht: 'Nòt' })} value={doc.description} />
            )}
            {doc.tags.length > 0 && (
              <div className="flex flex-wrap items-center gap-2 px-4 py-3">
                <span className="text-note text-muted dark:text-dark-muted">
                  {t({ fr: 'Étiquettes', ht: 'Etikèt' })}
                </span>
                {doc.tags.map((tag) => <Badge key={tag} tone="neutral">{tag}</Badge>)}
              </div>
            )}
          </Card>
        </Section>

        {/* ── À quoi il est rattaché (§36, §37) ──────────────────────────────
            Lecture seule : le rattachement se fait depuis la fiche du client,
            du fournisseur ou de l'employé. `getDocument()` ne rend pas leur
            nom, d'où le type et le titre du rattachement seuls. */}
        {doc.links.length > 0 && (
          <Section title={t({ fr: 'Rattaché à', ht: 'Tache ak' })}>
            <Card className="divide-y divide-border dark:divide-dark-border">
              {doc.links.map((link) => {
                const entity   = ENTITY_LABELS[link.entityType as DocumentEntityType];
                const relation = RELATION_LABELS[link.relation as DocumentRelation];
                const href     = entityHref(link.entityType, link.entityId);
                const content = (
                  <>
                    <span className="min-w-0 flex-1 truncate text-body text-primary dark:text-dark-text">
                      {entity ? t(entity) : link.entityType}
                    </span>
                    {relation && (
                      <span className="flex-shrink-0 text-note text-muted dark:text-dark-muted">
                        {t(relation)}
                      </span>
                    )}
                  </>
                );
                return href ? (
                  <Link key={link.id} href={href} className="pressable flex min-h-touch items-center gap-4 px-4 py-3">
                    {content}
                  </Link>
                ) : (
                  <div key={link.id} className="flex min-h-touch items-center gap-4 px-4 py-3">
                    {content}
                  </div>
                );
              })}
            </Card>
          </Section>
        )}

        {/* ── L'historique (§38) ─────────────────────────────────────────── */}
        {doc.versions.length > 1 && (
          <Section title={t({ fr: 'Versions', ht: 'Vèsyon' })}>
            {/* Restaurer n'efface rien : la version restaurée est RECOPIÉE en
                tête d'historique (§38). C'est pourquoi le bouton n'ouvre
                aucune confirmation — il n'y a rien à perdre. */}
            <ul className="space-y-2">
              {doc.versions.map((version) => (
                <Card as="li" key={version.id}>
                  <div className="flex min-h-touch items-center gap-3 px-4 py-3">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-body font-bold text-primary dark:text-dark-text">
                        {t({ fr: `Version ${version.version}`, ht: `Vèsyon ${version.version}` })}
                        {version.label ? ` · ${version.label}` : ''}
                      </span>
                      <span className="block text-note text-muted dark:text-dark-muted">
                        {formatDate(version.createdAt, language)}
                        {version.origin === 'ai' ? ` · ${t({ fr: 'PilotAI', ht: 'PilotAI' })}` : ''}
                      </span>
                    </span>

                    {version.version !== doc.version && can('documents:update') && (
                      <button
                        type="button"
                        onClick={() => void restore(version.id)}
                        disabled={busy}
                        title={t({ fr: 'Restaurer cette version', ht: 'Remete vèsyon sa a' })}
                        aria-label={t({ fr: 'Restaurer cette version', ht: 'Remete vèsyon sa a' })}
                        className="pressable flex h-touch w-touch items-center justify-center rounded-control text-muted disabled:opacity-40"
                      >
                        <History className="h-4 w-4" strokeWidth={1.8} aria-hidden />
                      </button>
                    )}

                    {doc.hasFile && (
                      <a href={`${fileUrl}?version=${version.version}&download=1`} download
                         className="pressable flex h-touch w-touch items-center justify-center rounded-control text-muted"
                         aria-label={t({ fr: 'Télécharger cette version', ht: 'Telechaje vèsyon sa a' })}>
                        <Download className="h-4 w-4" strokeWidth={1.8} aria-hidden />
                      </a>
                    )}
                  </div>
                </Card>
              ))}
            </ul>
          </Section>
        )}

        {/* ── Les gestes ─────────────────────────────────────────────────── */}
        <Section title={t({ fr: 'Actions', ht: 'Aksyon' })}>
          <div className="flex flex-wrap gap-3">
            {can('documents:update') && (
              <>
                {/* « Modifier » porte la fiche — nom, type, échéance. Le CORPS
                    d'un document écrit se change ailleurs, dans l'éditeur :
                    deux boutons parce que ce sont deux gestes, et que l'un
                    crée une version quand l'autre n'en crée pas. */}
                <Button variant="quiet" onClick={openEditor} disabled={busy}
                        icon={<Pencil className="h-4 w-4" strokeWidth={1.8} aria-hidden />}>
                  {t({ fr: 'Modifier la fiche', ht: 'Chanje fich la' })}
                </Button>

                {doc.contentBlocks && (
                  <Link href={`/documents/${doc.id}/editer`}>
                    <Button variant="soft"
                            icon={<Pencil className="h-4 w-4" strokeWidth={1.8} aria-hidden />}>
                      {t({ fr: 'Modifier le contenu', ht: 'Chanje kontni an' })}
                    </Button>
                  </Link>
                )}

                {doc.hasFile && (
                  <Button variant="soft" onClick={() => setVersionOpen(true)} disabled={busy}
                          icon={<Upload className="h-4 w-4" strokeWidth={1.8} aria-hidden />}>
                    {t({ fr: 'Nouvelle version', ht: 'Nouvo vèsyon' })}
                  </Button>
                )}

                <Button variant="quiet" onClick={() => void toggleArchive()} loading={busy}
                        icon={doc.status === 'archived'
                          ? <ArchiveRestore className="h-4 w-4" strokeWidth={1.8} aria-hidden />
                          : <Archive className="h-4 w-4" strokeWidth={1.8} aria-hidden />}>
                  {doc.status === 'archived'
                    ? t({ fr: 'Sortir des archives', ht: 'Retire nan achiv' })
                    : t({ fr: 'Archiver', ht: 'Achive' })}
                </Button>
              </>
            )}

            {can('documents:delete') && (
              <Button variant="danger" onClick={() => void remove()} disabled={busy}
                      icon={<Trash2 className="h-4 w-4" strokeWidth={1.8} aria-hidden />}>
                {t({ fr: 'Supprimer', ht: 'Efase' })}
              </Button>
            )}
          </div>
        </Section>
      </Stack>

      <NewVersionSheet
        open={versionOpen}
        documentId={doc.id}
        onClose={() => setVersionOpen(false)}
        onUploaded={() => { setVersionOpen(false); void reload(); }}
      />

      {/* ── La feuille de modification ──────────────────────────────────── */}
      <BottomSheet
        open={editOpen}
        onClose={() => setEditOpen(false)}
        title={t({ fr: 'Modifier le document', ht: 'Modifye dokiman an' })}
        footer={
          <div className="flex gap-3">
            <Button variant="quiet" onClick={() => setEditOpen(false)} disabled={busy}>
              {t({ fr: 'Annuler', ht: 'Anile' })}
            </Button>
            <Button variant="accent" block onClick={() => void save()} loading={busy}
                    loadingLabel={t({ fr: 'Enregistrement…', ht: 'Anrejistreman…' })}>
              {t({ fr: 'Enregistrer', ht: 'Anrejistre' })}
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <Field
            label={t({ fr: 'Nom', ht: 'Non' })}
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />

          <SelectField
            label={t({ fr: 'Type', ht: 'Kalite' })}
            value={form.typeId}
            onChange={(e) => setForm({ ...form, typeId: e.target.value })}
            placeholder={t({ fr: 'Sans type', ht: 'San kalite' })}
            options={typeOptions}
          />

          <Field
            label={t({ fr: 'Date d’expiration', ht: 'Dat ekspirasyon' })}
            hint={t({
              fr: 'Laissez vide si le document n’expire pas.',
              ht: 'Kite l vid si dokiman an pa ekspire.',
            })}
            type="date"
            value={form.expiresOn}
            onChange={(e) => setForm({ ...form, expiresOn: e.target.value })}
          />

          <SelectField
            label={t({ fr: 'Statut', ht: 'Estati' })}
            value={form.status}
            onChange={(e) => setForm({ ...form, status: e.target.value as DocumentStatus })}
            options={EDITABLE_STATUSES.map((s) => ({ value: s, label: t(STATUS_LABELS[s]) }))}
          />

          <SelectField
            label={t({ fr: 'Visible par', ht: 'Vizib pou' })}
            hint={t({
              fr: 'Le type du document impose déjà un minimum : une fiche de paie ne devient jamais publique.',
              ht: 'Kalite dokiman an deja mete yon limit : yon fich peman pa janm vin piblik.',
            })}
            value={form.visibility}
            onChange={(e) => setForm({ ...form, visibility: e.target.value as DocumentVisibility })}
            options={VISIBILITIES.map((v) => ({ value: v, label: t(VISIBILITY_LABELS[v]) }))}
          />
        </div>
      </BottomSheet>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 px-4 py-3">
      <span className="text-note text-muted dark:text-dark-muted">{label}</span>
      <span className="min-w-0 text-right text-body text-primary dark:text-dark-text">{value}</span>
    </div>
  );
}
