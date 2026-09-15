'use client';

// ─────────────────────────────────────────────────────────────────────────────
// Les sauvegardes — « vos données, à l'abri »
//
// Ce que l'écran faisait de travers :
//
//   §3.5  quinze émojis, dont ✅ ❌ ⏳ en guise d'INDICATEURS D'ÉTAT. Un état se
//         lit dans une étiquette qui porte un mot ; un rond vert dessiné par le
//         téléphone ne se lit pas en plein soleil et ne dit pas ce qu'il vaut.
//   §3.6  une barre de trois compteurs (nombre, taille, dernière) posée
//         au-dessus d'une liste qui répétait les trois. Elle est devenue le
//         sous-titre de l'écran : même information, une ligne, zéro carte.
//   §5.9  quatre boutons de 28 px de haut alignés à droite de chaque ligne, sur
//         un téléphone. Ils sont passés dans une feuille qui monte à l'appui sur
//         la ligne : quatre cibles pleine largeur, impossibles à rater (§5.7).
//   §4.2  du vert, du rouge, de l'ambre et du bleu sur le même écran, dont un
//         encadré bleu « ℹ️ À propos ». Il reste un rouge — supprimer — et un
//         ambre — restaurer, qui écrase.
//   §4.4  la page peignait son propre fond gris dans la coquille.
//   §9.1  « Les sauvegardes sont stockées de façon sécurisée et chiffrées » :
//         une affirmation de sécurité que le code ne tient pas lui-même. Elle
//         est remplacée par ce qui est vrai et vérifiable.
//
// Les deux boîtes de dialogue centrées (restaurer, importer) sont devenues des
// feuilles inférieures, comme partout ailleurs dans le produit.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from 'react';
import { Archive, Download, FileJson, RotateCcw, Trash2, Upload } from 'lucide-react';
import { toast } from 'sonner';

import { ProtectedRoute } from '../../components/ProtectedRoute';
import { useLanguage } from '../../components/LanguageWrapper';
import {
  Badge, BottomSheet, Button, Card, Field, FirstRun, ScreenHeader, Stack,
  type BadgeTone,
} from '../../components/ds';
import {
  createBackup,
  listBackups,
  deleteBackup,
  getBackupSignedUrl,
  type BackupRecord,
} from '../actions/backup';
import { screenMessage } from '../../lib/actionResult';

type Bilingual = { fr: string; ht: string };

const ENTITIES: Record<string, Bilingual> = {
  company:        { fr: 'Entreprise',   ht: 'Antrepriz' },
  customers:      { fr: 'Clients',      ht: 'Kliyan'    },
  products:       { fr: 'Produits',     ht: 'Pwodwi'    },
  suppliers:      { fr: 'Fournisseurs', ht: 'Founisè'   },
  sales:          { fr: 'Ventes',       ht: 'Vant'      },
  sale_items:     { fr: 'Lignes de vente',  ht: 'Liy vant'  },
  purchases:      { fr: 'Achats',       ht: 'Acha'      },
  purchase_items: { fr: 'Lignes d’achat',   ht: 'Liy acha'  },
  expenses:       { fr: 'Dépenses',     ht: 'Depans'    },
  employees:      { fr: 'Employés',     ht: 'Anplwaye'  },
  activity_logs:  { fr: 'Journal',      ht: 'Jounal'    },
};

const STATUS: Record<BackupRecord['status'], { label: Bilingual; tone: BadgeTone }> = {
  ready:   { label: { fr: 'Prête',    ht: 'Pare'      }, tone: 'success' },
  pending: { label: { fr: 'En cours', ht: 'Ap fèt'    }, tone: 'warning' },
  error:   { label: { fr: 'Échouée',  ht: 'Li pa fèt' }, tone: 'danger'  },
};

// ─────────────────────────────────────────────────────────────────────────────

function BackupInner() {
  const { t, language } = useLanguage();

  const [backups, setBackups] = useState<BackupRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const [creating, setCreating] = useState(false);
  const [label,    setLabel]    = useState('');

  const [sheet,   setSheet]   = useState<'create' | 'import' | null>(null);
  const [actions, setActions] = useState<BackupRecord | null>(null);
  const [restore, setRestore] = useState<BackupRecord | null>(null);
  const [busyId,  setBusyId]  = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setBackups(await listBackups());
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function create() {
    setCreating(true);
    const res = await createBackup(label.trim() || undefined);
    if ('error' in res) {
      toast.error(res.error);
    } else {
      toast.success(t({ fr: 'Sauvegarde créée.', ht: 'Sovgad la fèt.' }));
      setLabel('');
      setSheet(null);
      await load();
    }
    setCreating(false);
  }

  async function downloadZip(backup: BackupRecord) {
    setBusyId(backup.id);
    try {
      const res = await fetch(`/api/backup/${backup.id}/download`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error);
      }
      const url = URL.createObjectURL(await res.blob());
      const a = Object.assign(document.createElement('a'), {
        href: url,
        download: `profitpilot-${backup.createdAt.slice(0, 10)}.zip`,
      });
      a.click();
      URL.revokeObjectURL(url);
      setActions(null);
    } catch (e: any) {
      toast.error(screenMessage(e, t({ fr: 'Téléchargement impossible.', ht: 'Nou pa ka telechaje.' })));
    }
    setBusyId(null);
  }

  async function openJson(backup: BackupRecord) {
    const res = await getBackupSignedUrl(backup.id);
    if ('error' in res) { toast.error(res.error); return; }
    window.open(res.url, '_blank');
    setActions(null);
  }

  async function remove(backup: BackupRecord) {
    setBusyId(backup.id);
    const res = await deleteBackup(backup.id);
    if (res.error) {
      toast.error(res.error);
    } else {
      toast.success(t({ fr: 'Sauvegarde supprimée.', ht: 'Sovgad la efase.' }));
      setBackups((prev) => prev.filter((b) => b.id !== backup.id));
      setActions(null);
    }
    setBusyId(null);
  }

  // Le résumé remplace la barre de trois cartes : la même information, à
  // l'endroit où l'écran se présente déjà (§3.6).
  const totalSize = backups.reduce((sum, b) => sum + b.sizeBytes, 0);
  const subtitle = loading
    ? t({ fr: 'Lecture…', ht: 'Ap li…' })
    : backups.length === 0
      ? t({ fr: 'Aucune sauvegarde pour le moment.', ht: 'Pa gen sovgad pou kounye a.' })
      : [
          t({
            fr: `${backups.length} sauvegarde${backups.length > 1 ? 's' : ''}`,
            ht: `${backups.length} sovgad`,
          }),
          formatSize(totalSize),
          t({
            fr: `dernière ${relativeDate(backups[0].createdAt, language)}`,
            ht: `dènye a ${relativeDate(backups[0].createdAt, language)}`,
          }),
        ].join(' · ');

  return (
    <div className="pp-enter mx-auto w-full max-w-2xl px-4 py-6 sm:px-6">
      <ScreenHeader
        title={t({ fr: 'Sauvegardes', ht: 'Sovgad' })}
        subtitle={subtitle}
        action={
          <Button variant="accent" size="sm" onClick={() => setSheet('create')}>
            {t({ fr: 'Sauvegarder', ht: 'Sovgade' })}
          </Button>
        }
      />

      <Stack className="mt-6">
        <Card>
          {loading ? (
            <div className="space-y-2 p-4" aria-hidden>
              {[0, 1, 2].map((i) => (
                <span key={i} className="pp-skeleton block h-14 rounded-control" />
              ))}
            </div>
          ) : backups.length === 0 ? (
            <FirstRun
              title={t({
                fr: 'Une copie de tout, en un appui',
                ht: 'Yon kopi tout bagay, ak yon sèl tap',
              })}
              hint={t({
                fr: 'Ventes, produits, clients, dépenses : la sauvegarde prend tout, et vous la gardez sur votre téléphone ou votre ordinateur.',
                ht: 'Vant, pwodwi, kliyan, depans : sovgad la pran tout, epi w kenbe l sou telefòn ou oswa òdinatè w.',
              })}
              action={
                <Button variant="accent" onClick={() => setSheet('create')}>
                  {t({ fr: 'Créer la première', ht: 'Kreye premye a' })}
                </Button>
              }
            />
          ) : (
            <ul className="divide-y divide-border dark:divide-dark-border">
              {backups.map((b) => {
                const status = STATUS[b.status];
                return (
                  <li key={b.id}>
                    <button
                      type="button"
                      onClick={() => b.status === 'ready' && setActions(b)}
                      disabled={b.status !== 'ready'}
                      className="pressable flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-surface disabled:cursor-default dark:hover:bg-white/5"
                    >
                      <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-surface bg-surface2 text-muted dark:bg-dark-surface2 dark:text-dark-muted">
                        <Archive className="h-5 w-5" strokeWidth={1.8} aria-hidden />
                      </span>

                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-2">
                          <span className="min-w-0 truncate text-body text-primary dark:text-dark-text">
                            {b.label ?? t({ fr: 'Sauvegarde', ht: 'Sovgad' })}
                          </span>
                          {/* L'étiquette porte un MOT : « Prête », pas un ✅. */}
                          {b.status !== 'ready' && (
                            <Badge tone={status.tone}>{t(status.label)}</Badge>
                          )}
                        </span>
                        <span className="mt-0.5 block truncate text-note text-muted dark:text-dark-muted">
                          {relativeDate(b.createdAt, language)} · {formatSize(b.sizeBytes)}
                          {b.entityCounts ? ` · ${summarize(b.entityCounts, t)}` : ''}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <button
          type="button"
          onClick={() => setSheet('import')}
          className="pressable flex min-h-touch items-center gap-2 text-note font-bold text-primary underline underline-offset-4 dark:text-dark-text"
        >
          <Upload className="h-4 w-4" strokeWidth={2} aria-hidden />
          {t({ fr: 'Importer un fichier ZIP', ht: 'Enpòte yon fichye ZIP' })}
        </button>

        <div className="space-y-2">
          {[
            {
              fr: 'La sauvegarde couvre l’entreprise active : ventes, achats, produits, clients, fournisseurs, dépenses, employés et journal.',
              ht: 'Sovgad la kouvri antrepriz ki aktif la : vant, acha, pwodwi, kliyan, founisè, depans, anplwaye ak jounal.',
            },
            {
              fr: 'Le fichier ZIP contient du JSON et du CSV : il s’ouvre dans un tableur, sans ProfitPilot.',
              ht: 'Fichye ZIP la gen JSON ak CSV : li louvri nan yon tablè, san ProfitPilot.',
            },
            {
              fr: 'Restaurer REMPLACE les données actuelles. Faites une sauvegarde avant d’en restaurer une autre.',
              ht: 'Restore ap RANPLASE done ki la yo. Fè yon sovgad anvan w restore yon lòt.',
            },
          ].map((line) => (
            <p key={line.fr} className="flex items-start gap-2 text-note text-muted dark:text-dark-muted">
              <span className="mt-1.5 h-1 w-1 flex-shrink-0 rounded-pill bg-border dark:bg-dark-border" aria-hidden />
              {t(line)}
            </p>
          ))}
        </div>
      </Stack>

      {/* ── Créer ── */}
      <BottomSheet
        open={sheet === 'create'}
        onClose={() => setSheet(null)}
        title={t({ fr: 'Nouvelle sauvegarde', ht: 'Nouvo sovgad' })}
      >
        <div className="space-y-5">
          <Field
            label={t({ fr: 'Lui donner un nom', ht: 'Ba li yon non' })}
            hint={t({
              fr: 'Facultatif — « avant inventaire », « fin de mois »…',
              ht: 'Si w vle — « anvan envantè », « fen mwa »…',
            })}
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder={t({ fr: 'Sans nom', ht: 'San non' })}
          />

          <Button variant="accent" size="lg" block loading={creating} onClick={create}>
            {t({ fr: 'Créer la sauvegarde', ht: 'Kreye sovgad la' })}
          </Button>
        </div>
      </BottomSheet>

      {/* ── Les actions d'une sauvegarde ── */}
      <BottomSheet
        open={actions !== null}
        onClose={() => setActions(null)}
        title={actions?.label ?? t({ fr: 'Sauvegarde', ht: 'Sovgad' })}
      >
        {actions && (
          <div className="space-y-2">
            <SheetAction
              icon={<Download className="h-5 w-5" strokeWidth={1.8} aria-hidden />}
              label={t({ fr: 'Télécharger le ZIP', ht: 'Telechaje ZIP la' })}
              hint={t({ fr: 'JSON et CSV, lisibles dans un tableur', ht: 'JSON ak CSV, ou ka louvri yo nan yon tablè' })}
              busy={busyId === actions.id}
              onClick={() => downloadZip(actions)}
            />
            <SheetAction
              icon={<FileJson className="h-5 w-5" strokeWidth={1.8} aria-hidden />}
              label={t({ fr: 'Ouvrir le fichier brut', ht: 'Louvri fichye brit la' })}
              hint={t({ fr: 'Pour un développeur ou un comptable', ht: 'Pou yon devlopè oswa yon kontab' })}
              onClick={() => openJson(actions)}
            />
            <SheetAction
              icon={<RotateCcw className="h-5 w-5" strokeWidth={1.8} aria-hidden />}
              label={t({ fr: 'Restaurer', ht: 'Restore' })}
              hint={t({ fr: 'Remplace les données actuelles', ht: 'Ranplase done ki la yo' })}
              onClick={() => { setRestore(actions); setActions(null); }}
            />
            <SheetAction
              icon={<Trash2 className="h-5 w-5" strokeWidth={1.8} aria-hidden />}
              label={t({ fr: 'Supprimer', ht: 'Efase' })}
              danger
              busy={busyId === actions.id}
              onClick={() => remove(actions)}
            />
          </div>
        )}
      </BottomSheet>

      <RestoreSheet backup={restore} onClose={() => setRestore(null)} onDone={load} />
      <ImportSheet open={sheet === 'import'} onClose={() => setSheet(null)} onDone={load} />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Restaurer — l'écran le plus dangereux du produit
// ─────────────────────────────────────────────────────────────────────────────

function RestoreSheet({
  backup, onClose, onDone,
}: { backup: BackupRecord | null; onClose: () => void; onDone: () => void }) {
  const { t, language } = useLanguage();

  const [confirmed, setConfirmed] = useState(false);
  const [busy,      setBusy]      = useState(false);
  const [done,      setDone]      = useState<Record<string, number> | null>(null);

  useEffect(() => {
    if (backup) { setConfirmed(false); setDone(null); }
  }, [backup]);

  async function run() {
    if (!backup) return;
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append('backupId', backup.id);
      const res  = await fetch('/api/backup/restore', { method: 'POST', body: fd });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      setDone(json.restored ?? {});
      onDone();
    } catch (e: any) {
      toast.error(screenMessage(e, t({ fr: 'Restauration impossible.', ht: 'Nou pa ka restore.' })));
    }
    setBusy(false);
  }

  return (
    <BottomSheet
      open={backup !== null}
      onClose={onClose}
      title={t({ fr: 'Restaurer cette sauvegarde', ht: 'Restore sovgad sa a' })}
    >
      {backup && (done ? (
        <div className="space-y-5">
          <p className="text-body text-primary dark:text-dark-text">
            {t({ fr: 'Vos données ont été remises en place.', ht: 'Done ou yo remèt nan plas yo.' })}
          </p>
          <Counts counts={done} />
          <Button variant="primary" block onClick={onClose}>
            {t({ fr: 'Terminé', ht: 'Fini' })}
          </Button>
        </div>
      ) : (
        <div className="space-y-5">
          {/* L'avertissement est du TEXTE, pas un encadré ambre à émoji : ce
              qu'il faut comprendre tient en une phrase (§3.2). */}
          <p className="text-body text-text2 dark:text-dark-text2">
            {t({
              fr: `Tout ce qui est enregistré aujourd’hui sera remplacé par la sauvegarde du ${formatDate(backup.createdAt, language)}. On ne peut pas revenir en arrière.`,
              ht: `Tout sa ki anrejistre jodi a ap ranplase pa sovgad ${formatDate(backup.createdAt, language)} la. Nou p ap ka retounen anyen.`,
            })}
          </p>

          {backup.entityCounts && <Counts counts={backup.entityCounts} />}

          <label className="flex min-h-touch cursor-pointer items-start gap-3">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
              className="mt-1 h-5 w-5 flex-shrink-0 rounded-control border-border accent-primary"
            />
            <span className="text-body text-text2 dark:text-dark-text2">
              {t({
                fr: 'Je comprends que mes données actuelles seront remplacées.',
                ht: 'Mwen konprann done m yo ap ranplase.',
              })}
            </span>
          </label>

          <div className="flex items-center gap-3">
            <Button variant="danger" block loading={busy} disabled={!confirmed} onClick={run}>
              {t({ fr: 'Restaurer maintenant', ht: 'Restore kounye a' })}
            </Button>
            <Button variant="link" onClick={onClose}>
              {t({ fr: 'Annuler', ht: 'Anile' })}
            </Button>
          </div>
        </div>
      ))}
    </BottomSheet>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Importer un ZIP
// ─────────────────────────────────────────────────────────────────────────────

function ImportSheet({
  open, onClose, onDone,
}: { open: boolean; onClose: () => void; onDone: () => void }) {
  const { t } = useLanguage();

  const [file,      setFile]      = useState<File | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [busy,      setBusy]      = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) { setFile(null); setConfirmed(false); }
  }, [open]);

  async function run() {
    if (!file) return;
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res  = await fetch('/api/backup/restore', { method: 'POST', body: fd });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      toast.success(t({ fr: 'Fichier importé.', ht: 'Fichye a enpòte.' }));
      onDone();
      onClose();
    } catch (e: any) {
      toast.error(screenMessage(e, t({ fr: 'Import impossible.', ht: 'Nou pa ka enpòte.' })));
    }
    setBusy(false);
  }

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title={t({ fr: 'Importer un fichier ZIP', ht: 'Enpòte yon fichye ZIP' })}
    >
      <div className="space-y-5">
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="pressable flex w-full flex-col items-center gap-2 rounded-surface border border-dashed border-border bg-surface px-4 py-8 text-center dark:border-dark-border dark:bg-dark-surface2"
        >
          <Upload className="h-6 w-6 text-muted dark:text-dark-muted" strokeWidth={1.8} aria-hidden />
          <span className="text-body font-bold text-primary dark:text-dark-text">
            {file ? file.name : t({ fr: 'Choisir un fichier', ht: 'Chwazi yon fichye' })}
          </span>
          <span className="text-note text-muted dark:text-dark-muted">
            {file
              ? formatSize(file.size)
              : t({ fr: 'Un ZIP créé par ProfitPilot', ht: 'Yon ZIP ProfitPilot te kreye' })}
          </span>
        </button>

        <input
          ref={inputRef}
          type="file"
          accept=".zip"
          className="sr-only"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        />

        {file && (
          <label className="flex min-h-touch cursor-pointer items-start gap-3">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
              className="mt-1 h-5 w-5 flex-shrink-0 rounded-control border-border accent-primary"
            />
            <span className="text-body text-text2 dark:text-dark-text2">
              {t({
                fr: 'Je comprends que le contenu du fichier remplacera mes données actuelles.',
                ht: 'Mwen konprann sa ki nan fichye a ap ranplase done m yo.',
              })}
            </span>
          </label>
        )}

        <Button
          variant="danger"
          size="lg"
          block
          loading={busy}
          disabled={!file || !confirmed}
          onClick={run}
        >
          {t({ fr: 'Importer et remplacer', ht: 'Enpòte epi ranplase' })}
        </Button>
      </div>
    </BottomSheet>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Pièces communes
// ─────────────────────────────────────────────────────────────────────────────

function SheetAction({
  icon, label, hint, onClick, busy = false, danger = false,
}: {
  icon: React.ReactNode;
  label: string;
  hint?: string;
  onClick: () => void;
  busy?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      className={[
        'pressable flex min-h-13 w-full items-center gap-3 rounded-surface px-4 py-3 text-left',
        'hover:bg-surface disabled:opacity-45 dark:hover:bg-white/5',
        danger ? 'text-danger' : 'text-primary dark:text-dark-text',
      ].join(' ')}
    >
      <span className={danger ? 'text-danger' : 'text-muted dark:text-dark-muted'}>{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-body font-bold">{label}</span>
        {hint && <span className="block text-note text-muted dark:text-dark-muted">{hint}</span>}
      </span>
    </button>
  );
}

function Counts({ counts }: { counts: Record<string, number> }) {
  const { t } = useLanguage();
  const rows = Object.entries(counts).filter(([, v]) => v > 0);
  if (rows.length === 0) return null;

  return (
    <ul className="divide-y divide-border rounded-surface border border-border dark:divide-dark-border dark:border-dark-border">
      {rows.map(([key, value]) => (
        <li key={key} className="flex items-center justify-between px-4 py-2">
          <span className="text-body text-text2 dark:text-dark-text2">
            {ENTITIES[key] ? t(ENTITIES[key]) : key}
          </span>
          <span className="amount text-body font-bold text-primary dark:text-dark-text">
            {value.toLocaleString('fr-FR')}
          </span>
        </li>
      ))}
    </ul>
  );
}

/** « 128 ventes · 46 produits · 12 clients » — trois postes, pas onze. */
function summarize(counts: Record<string, number>, t: (b: Bilingual) => string): string {
  return Object.entries(counts)
    .filter(([key, value]) => value > 0 && key !== 'company' && key !== 'activity_logs')
    .slice(0, 3)
    .map(([key, value]) => `${value} ${ENTITIES[key] ? t(ENTITIES[key]).toLowerCase() : key}`)
    .join(' · ');
}

function formatSize(bytes: number): string {
  if (!bytes) return '—';
  if (bytes < 1024)     return `${bytes} o`;
  if (bytes < 1_048_576) return `${(bytes / 1024).toFixed(1)} Ko`;
  return `${(bytes / 1_048_576).toFixed(1)} Mo`;
}

function formatDate(iso: string, language: 'fr' | 'ht'): string {
  return new Date(iso).toLocaleDateString(language === 'ht' ? 'fr-HT' : 'fr-FR', {
    day: '2-digit', month: 'long', year: 'numeric',
  });
}

function relativeDate(iso: string, language: 'fr' | 'ht'): string {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60)     return language === 'ht' ? 'kounye a' : "à l'instant";
  if (diff < 3_600)  return `${Math.floor(diff / 60)} min`;
  if (diff < 86_400) {
    const h = Math.floor(diff / 3_600);
    return language === 'ht' ? `${h} è` : `${h} h`;
  }
  if (diff < 604_800) {
    const d = Math.floor(diff / 86_400);
    return language === 'ht' ? `${d} jou` : `${d} j`;
  }
  return new Date(iso).toLocaleDateString(language === 'ht' ? 'fr-HT' : 'fr-FR', {
    day: '2-digit', month: 'short',
  });
}

export default function BackupPage() {
  return (
    <ProtectedRoute>
      <BackupInner />
    </ProtectedRoute>
  );
}
