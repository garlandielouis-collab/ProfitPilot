'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  createBackup,
  listBackups,
  deleteBackup,
  getBackupSignedUrl,
  type BackupRecord,
} from '../actions/backup';

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtSize(bytes: number): string {
  if (bytes === 0) return '—';
  if (bytes < 1024)       return `${bytes} o`;
  if (bytes < 1048576)    return `${(bytes / 1024).toFixed(1)} Ko`;
  return `${(bytes / 1048576).toFixed(2)} Mo`;
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleString('fr-FR', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function relDate(iso: string): string {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60)     return 'À l\'instant';
  if (diff < 3600)   return `il y a ${Math.floor(diff / 60)} min`;
  if (diff < 86400)  return `il y a ${Math.floor(diff / 3600)} h`;
  if (diff < 604800) return `il y a ${Math.floor(diff / 86400)} j`;
  return fmtDate(iso);
}

const ENTITY_LABELS: Record<string, string> = {
  company:        'Entreprise',
  customers:      'Clients',
  products:       'Produits',
  suppliers:      'Fournisseurs',
  sales:          'Ventes',
  sale_items:     'Lignes ventes',
  purchases:      'Achats',
  purchase_items: 'Lignes achats',
  expenses:       'Dépenses',
  employees:      'Employés',
  activity_logs:  'Logs activité',
};

// ── Restore modal ─────────────────────────────────────────────────────────────

function RestoreModal({
  backup,
  onClose,
  onDone,
}: {
  backup: BackupRecord;
  onClose: () => void;
  onDone: () => void;
}) {
  const [loading,  setLoading]  = useState(false);
  const [result,   setResult]   = useState<any>(null);
  const [error,    setError]    = useState('');
  const [confirm,  setConfirm]  = useState(false);

  async function handleRestore() {
    setLoading(true);
    setError('');
    try {
      const fd = new FormData();
      fd.append('backupId', backup.id);
      const res = await fetch('/api/backup/restore', { method: 'POST', body: fd });
      const json = await res.json();
      if (!res.ok) { setError(json.error ?? 'Erreur'); setLoading(false); return; }
      setResult(json);
    } catch (e: any) {
      setError(e.message ?? 'Erreur réseau');
    }
    setLoading(false);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-xl space-y-5">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-slate-800">Restaurer la sauvegarde</h2>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100">
            <svg viewBox="0 0 20 20" className="h-4 w-4" fill="currentColor">
              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          </button>
        </div>

        {result ? (
          <div className="space-y-4">
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
              <p className="text-sm font-bold text-emerald-800">✅ {result.message}</p>
            </div>
            <div className="rounded-xl border border-slate-100 bg-slate-50 p-4 space-y-1">
              {Object.entries(result.restored as Record<string, number>).map(([k, v]) => (
                <div key={k} className="flex justify-between text-xs">
                  <span className="text-slate-600">{ENTITY_LABELS[k] ?? k}</span>
                  <span className="font-mono font-semibold text-slate-700">{v}</span>
                </div>
              ))}
            </div>
            {result.errors && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
                <p className="text-xs font-bold text-amber-800 mb-1">Avertissements :</p>
                {result.errors.map((e: string, i: number) => (
                  <p key={i} className="text-xs text-amber-700">{e}</p>
                ))}
              </div>
            )}
            <button onClick={() => { onDone(); onClose(); }} className="w-full rounded-xl bg-[#001F3F] py-2.5 text-sm font-semibold text-white hover:bg-[#001F3F]/80">
              Fermer
            </button>
          </div>
        ) : (
          <>
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 space-y-2">
              <p className="text-sm font-bold text-amber-800">⚠️ Attention</p>
              <p className="text-xs text-amber-700">
                La restauration va <strong>écraser</strong> les données existantes avec celles de cette sauvegarde.
                Cette action est irréversible.
              </p>
              <p className="text-xs text-amber-600">
                Sauvegarde du <strong>{fmtDate(backup.createdAt)}</strong>
              </p>
            </div>

            {/* Entity summary */}
            {backup.entityCounts && (
              <div className="rounded-xl border border-slate-100 bg-slate-50 p-4 space-y-1">
                <p className="text-xs font-semibold text-slate-600 mb-2">Contenu de la sauvegarde :</p>
                {Object.entries(backup.entityCounts).map(([k, v]) => (
                  <div key={k} className="flex justify-between text-xs">
                    <span className="text-slate-500">{ENTITY_LABELS[k] ?? k}</span>
                    <span className="font-mono font-semibold text-slate-700">{v}</span>
                  </div>
                ))}
              </div>
            )}

            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={confirm}
                onChange={e => setConfirm(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-slate-300"
              />
              <span className="text-xs text-slate-600">
                Je comprends que cette action va remplacer mes données actuelles et je souhaite continuer.
              </span>
            </label>

            {error && <p className="text-xs text-red-600">{error}</p>}

            <div className="flex gap-3">
              <button
                onClick={handleRestore}
                disabled={!confirm || loading}
                className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-red-600 py-2.5 text-sm font-semibold text-white transition hover:bg-red-700 disabled:opacity-60"
              >
                {loading && <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />}
                {loading ? 'Restauration…' : 'Restaurer maintenant'}
              </button>
              <button
                onClick={onClose}
                className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50"
              >
                Annuler
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── Import ZIP modal ──────────────────────────────────────────────────────────

function ImportModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [file,    setFile]    = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [result,  setResult]  = useState<any>(null);
  const [error,   setError]   = useState('');
  const [confirm, setConfirm] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleImport() {
    if (!file) return;
    setLoading(true);
    setError('');
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch('/api/backup/restore', { method: 'POST', body: fd });
      const json = await res.json();
      if (!res.ok) { setError(json.error ?? 'Erreur'); setLoading(false); return; }
      setResult(json);
    } catch (e: any) {
      setError(e.message ?? 'Erreur réseau');
    }
    setLoading(false);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-xl space-y-5">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-slate-800">Importer un fichier ZIP</h2>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100">
            <svg viewBox="0 0 20 20" className="h-4 w-4" fill="currentColor">
              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          </button>
        </div>

        {result ? (
          <div className="space-y-4">
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
              <p className="text-sm font-bold text-emerald-800">✅ {result.message}</p>
            </div>
            <button onClick={() => { onDone(); onClose(); }} className="w-full rounded-xl bg-[#001F3F] py-2.5 text-sm font-semibold text-white">Fermer</button>
          </div>
        ) : (
          <>
            {/* Drop zone */}
            <div
              onClick={() => inputRef.current?.click()}
              className="flex flex-col items-center gap-3 rounded-xl border-2 border-dashed border-slate-200 bg-slate-50 p-8 cursor-pointer hover:border-[#001F3F]/40 hover:bg-slate-100 transition"
            >
              <span className="text-3xl">📦</span>
              {file ? (
                <>
                  <p className="text-sm font-semibold text-slate-700">{file.name}</p>
                  <p className="text-xs text-slate-400">{fmtSize(file.size)}</p>
                </>
              ) : (
                <>
                  <p className="text-sm font-semibold text-slate-600">Cliquez pour sélectionner un ZIP</p>
                  <p className="text-xs text-slate-400">Fichiers .zip générés par ProfitPilot uniquement</p>
                </>
              )}
              <input
                ref={inputRef}
                type="file"
                accept=".zip"
                className="hidden"
                onChange={e => setFile(e.target.files?.[0] ?? null)}
              />
            </div>

            {file && (
              <>
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
                  <p className="text-xs text-amber-700">
                    ⚠️ L'importation va <strong>écraser</strong> les données existantes avec celles du fichier.
                  </p>
                </div>
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={confirm}
                    onChange={e => setConfirm(e.target.checked)}
                    className="mt-0.5 h-4 w-4 rounded border-slate-300"
                  />
                  <span className="text-xs text-slate-600">
                    Je comprends que cette action va remplacer mes données actuelles.
                  </span>
                </label>
              </>
            )}

            {error && <p className="text-xs text-red-600">{error}</p>}

            <div className="flex gap-3">
              <button
                onClick={handleImport}
                disabled={!file || !confirm || loading}
                className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-[#001F3F] py-2.5 text-sm font-semibold text-white disabled:opacity-60"
              >
                {loading && <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />}
                {loading ? 'Import…' : 'Importer'}
              </button>
              <button onClick={onClose} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50">
                Annuler
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function BackupPage() {
  const [backups,      setBackups]      = useState<BackupRecord[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [creating,     setCreating]     = useState(false);
  const [label,        setLabel]        = useState('');
  const [showLabel,    setShowLabel]    = useState(false);
  const [toast,        setToast]        = useState('');
  const [restoreTarget, setRestoreTarget] = useState<BackupRecord | null>(null);
  const [showImport,   setShowImport]   = useState(false);
  const [downloading,  setDownloading]  = useState<string | null>(null);
  const [deleting,     setDeleting]     = useState<string | null>(null);

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(''), 4000);
  }

  const load = useCallback(async () => {
    setLoading(true);
    const data = await listBackups();
    setBackups(data);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleCreate() {
    setCreating(true);
    const res = await createBackup(label.trim() || undefined);
    if ('error' in res) {
      showToast('❌ ' + res.error);
    } else {
      showToast('✅ Sauvegarde créée avec succès !');
      setLabel('');
      setShowLabel(false);
      await load();
    }
    setCreating(false);
  }

  async function handleDownloadZip(backup: BackupRecord) {
    setDownloading(backup.id);
    try {
      const res = await fetch(`/api/backup/${backup.id}/download`);
      if (!res.ok) {
        const j = await res.json();
        showToast('❌ ' + (j.error ?? 'Erreur'));
        return;
      }
      const blob = await res.blob();
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      const dateStr = new Date(backup.createdAt).toISOString().split('T')[0];
      a.href     = url;
      a.download = `backup_${dateStr}.zip`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      showToast('❌ ' + e.message);
    }
    setDownloading(null);
  }

  async function handleDownloadJson(backup: BackupRecord) {
    const res = await getBackupSignedUrl(backup.id);
    if ('error' in res) { showToast('❌ ' + res.error); return; }
    window.open(res.url, '_blank');
  }

  async function handleDelete(id: string) {
    setDeleting(id);
    const res = await deleteBackup(id);
    if (res.error) {
      showToast('❌ ' + res.error);
    } else {
      showToast('Sauvegarde supprimée.');
      setBackups(prev => prev.filter(b => b.id !== id));
    }
    setDeleting(null);
  }

  const totalSize = backups.reduce((s, b) => s + b.sizeBytes, 0);

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8">
      <div className="mx-auto max-w-3xl space-y-6">

        {/* Header */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#001F3F] text-lg text-white">
              💾
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-800">Sauvegardes</h1>
              <p className="text-sm text-slate-500">Export, sauvegarde et restauration de données</p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => setShowImport(true)}
              className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50"
            >
              📤 Importer ZIP
            </button>
            <button
              onClick={() => setShowLabel(v => !v)}
              className="flex items-center gap-2 rounded-xl bg-[#001F3F] px-4 py-2 text-sm font-semibold text-white hover:bg-[#001F3F]/80"
            >
              + Nouvelle sauvegarde
            </button>
          </div>
        </div>

        {toast && (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm font-medium text-emerald-700">
            {toast}
          </div>
        )}

        {/* New backup form */}
        {showLabel && (
          <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-4">
            <p className="text-sm font-bold text-slate-800">Nouvelle sauvegarde</p>
            <input
              type="text"
              value={label}
              onChange={e => setLabel(e.target.value)}
              placeholder="Nom de la sauvegarde (facultatif)"
              className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:border-[#001F3F] focus:outline-none focus:ring-2 focus:ring-[#001F3F]/10"
            />
            <div className="rounded-xl border border-blue-100 bg-blue-50 p-3 text-xs text-blue-700">
              📋 La sauvegarde inclura : clients, produits, fournisseurs, ventes, achats, dépenses, employés et logs d'activité.
            </div>
            <div className="flex gap-3">
              <button
                onClick={handleCreate}
                disabled={creating}
                className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-[#001F3F] py-2.5 text-sm font-semibold text-white disabled:opacity-60"
              >
                {creating && <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />}
                {creating ? 'Sauvegarde en cours…' : '💾 Créer la sauvegarde'}
              </button>
              <button
                onClick={() => { setShowLabel(false); setLabel(''); }}
                className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50"
              >
                Annuler
              </button>
            </div>
          </div>
        )}

        {/* Stats bar */}
        {backups.length > 0 && (
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: 'Sauvegardes', value: backups.length },
              { label: 'Taille totale', value: fmtSize(totalSize) },
              { label: 'Dernière', value: relDate(backups[0].createdAt) },
            ].map(({ label, value }) => (
              <div key={label} className="rounded-xl border border-slate-200 bg-white p-4 text-center">
                <p className="text-lg font-bold text-slate-800">{value}</p>
                <p className="text-xs text-slate-500">{label}</p>
              </div>
            ))}
          </div>
        )}

        {/* Backup list */}
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <div className="border-b border-slate-100 px-5 py-4">
            <h2 className="text-sm font-bold text-slate-800">Historique des sauvegardes</h2>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-16">
              <span className="h-6 w-6 animate-spin rounded-full border-2 border-slate-200 border-t-[#001F3F]" />
            </div>
          ) : backups.length === 0 ? (
            <div className="py-16 text-center">
              <p className="text-4xl">💾</p>
              <p className="mt-3 text-sm font-medium text-slate-500">Aucune sauvegarde</p>
              <p className="text-xs text-slate-400">Créez votre première sauvegarde ci-dessus.</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {backups.map((b) => (
                <div key={b.id} className="px-5 py-4">
                  <div className="flex items-start gap-3">
                    {/* Status icon */}
                    <div className={`mt-0.5 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl text-base ${
                      b.status === 'ready'   ? 'bg-emerald-100 text-emerald-700' :
                      b.status === 'error'   ? 'bg-red-100 text-red-600' :
                                               'bg-amber-100 text-amber-600'
                    }`}>
                      {b.status === 'ready' ? '✅' : b.status === 'error' ? '❌' : '⏳'}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-semibold text-slate-800">
                          {b.label ?? `Sauvegarde du ${fmtDate(b.createdAt)}`}
                        </p>
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                          b.status === 'ready' ? 'bg-emerald-100 text-emerald-600' :
                          b.status === 'error' ? 'bg-red-100 text-red-600' :
                                                 'bg-amber-100 text-amber-600'
                        }`}>
                          {b.status === 'ready' ? 'Prête' : b.status === 'error' ? 'Erreur' : 'En cours'}
                        </span>
                      </div>
                      <div className="mt-1 flex items-center gap-3 text-xs text-slate-400 flex-wrap">
                        <span>🕐 {relDate(b.createdAt)}</span>
                        <span>📦 {fmtSize(b.sizeBytes)}</span>
                        {b.entityCounts && (
                          <span>
                            {Object.entries(b.entityCounts)
                              .filter(([k]) => k !== 'company' && k !== 'activity_logs')
                              .map(([k, v]) => `${v} ${ENTITY_LABELS[k] ?? k}`)
                              .slice(0, 3)
                              .join(' · ')}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Actions */}
                    {b.status === 'ready' && (
                      <div className="flex items-center gap-1.5 flex-shrink-0 flex-wrap justify-end">
                        {/* Download ZIP */}
                        <button
                          onClick={() => handleDownloadZip(b)}
                          disabled={downloading === b.id}
                          title="Télécharger ZIP"
                          className="flex items-center gap-1.5 rounded-lg border border-[#001F3F]/20 bg-[#001F3F]/5 px-2.5 py-1.5 text-xs font-semibold text-[#001F3F] hover:bg-[#001F3F]/10 disabled:opacity-60"
                        >
                          {downloading === b.id
                            ? <span className="h-3 w-3 animate-spin rounded-full border border-[#001F3F]/30 border-t-[#001F3F]" />
                            : '📥'}
                          ZIP
                        </button>

                        {/* Download JSON */}
                        <button
                          onClick={() => handleDownloadJson(b)}
                          title="Télécharger JSON brut"
                          className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                        >
                          JSON
                        </button>

                        {/* Restore */}
                        <button
                          onClick={() => setRestoreTarget(b)}
                          title="Restaurer"
                          className="flex items-center gap-1 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-xs font-semibold text-amber-700 hover:bg-amber-100"
                        >
                          🔄 Restaurer
                        </button>

                        {/* Delete */}
                        <button
                          onClick={() => handleDelete(b.id)}
                          disabled={deleting === b.id}
                          title="Supprimer"
                          className="flex items-center justify-center rounded-lg border border-red-200 bg-red-50 p-1.5 text-red-500 hover:bg-red-100 disabled:opacity-60"
                        >
                          {deleting === b.id
                            ? <span className="h-3 w-3 animate-spin rounded-full border border-red-300 border-t-red-500" />
                            : (
                              <svg viewBox="0 0 20 20" className="h-3.5 w-3.5" fill="currentColor">
                                <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                              </svg>
                            )
                          }
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Info card */}
        <div className="rounded-2xl border border-blue-100 bg-blue-50 p-5 space-y-2">
          <h3 className="text-sm font-bold text-blue-800">ℹ️ À propos des sauvegardes</h3>
          <ul className="space-y-1 text-xs text-blue-700">
            <li>• Les sauvegardes incluent toutes les données de l'entreprise active</li>
            <li>• Le fichier ZIP contient des fichiers JSON et CSV (compatibles Excel)</li>
            <li>• La restauration remplace les données existantes — sauvegardez d'abord</li>
            <li>• Vous pouvez importer un ZIP précédemment téléchargé pour restaurer</li>
            <li>• Les sauvegardes sont stockées de façon sécurisée et chiffrées</li>
          </ul>
        </div>
      </div>

      {/* Modals */}
      {restoreTarget && (
        <RestoreModal
          backup={restoreTarget}
          onClose={() => setRestoreTarget(null)}
          onDone={load}
        />
      )}
      {showImport && (
        <ImportModal
          onClose={() => setShowImport(false)}
          onDone={load}
        />
      )}
    </main>
  );
}
