'use client';

// ─────────────────────────────────────────────────────────────────────────────
// « Pran foto kaye ou » — l'écran (F10 de l'étude de marché inversée)
//
// Une page à la fois : photo, lecture, correction. Les lignes s'accumulent ;
// rien n'est enregistré avant « Valide ». Le marchand corrige ce que la
// lecture a mal compris — c'est lui qui connaît ses clients, pas l'IA.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Camera, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { ProtectedRoute } from '../../components/ProtectedRoute';
import { useLanguage } from '../../components/LanguageWrapper';
import { Button, Card, FirstRun, ScreenHeader, Stack } from '../../components/ds';
import { importNotebookCredits, readNotebookPage, type NotebookRow } from '../actions/notebook';
import { blobToBase64, compressImage } from '../../lib/imageCompress';
import { formatMoney } from '../../lib/eveningReport';

const inputClass = 'min-h-13 w-full rounded-surface border border-border bg-surface px-3 text-body text-primary outline-none placeholder:text-muted focus:border-accent dark:border-dark-border dark:bg-dark-surface2 dark:text-dark-text';

type EditableRow = NotebookRow & { key: string };

function KayeInner() {
  const { t } = useLanguage();
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<EditableRow[]>([]);
  const [pages, setPages] = useState(0);
  const [reading, setReading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [fromSetup, setFromSetup] = useState(false);

  useEffect(() => {
    setFromSetup(new URLSearchParams(window.location.search).get('from') === 'demarrage');
  }, []);

  async function read(file: File | null) {
    if (!file) return;
    setReading(true);
    try {
      // 1 600 px : assez pour une écriture à la main, sans payer 4 Mo de données.
      const blob = await compressImage(file, 1600, 0.8);
      const res = await readNotebookPage(await blobToBase64(blob));
      if (!res.ok) { toast.error(res.message); return; }
      if (!res.data.legible || res.data.rows.length === 0) {
        toast.error(t({
          fr: 'Je n’ai trouvé aucune dette sur cette photo. Reprenez-la, bien à plat, avec de la lumière.',
          ht: 'M pa jwenn okenn dèt sou foto sa a. Pran l ankò, byen plat, ak limyè.',
        }));
        return;
      }
      setPages((n) => n + 1);
      setRows((prev) => [...prev, ...res.data.rows.map((r) => ({ ...r, key: crypto.randomUUID() }))]);
      toast.success(t({
        fr: `${res.data.rows.length} ligne(s) lue(s). Vérifiez les noms et les montants.`,
        ht: `${res.data.rows.length} liy li. Tcheke non yo ak montan yo.`,
      }));
    } finally {
      setReading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  const update = (key: string, patch: Partial<NotebookRow>) =>
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  const total = rows.filter((r) => r.currency === 'HTG').reduce((s, r) => s + (Number(r.amount) || 0), 0);

  async function validate() {
    const clean = rows.filter((r) => r.name.trim() && Number(r.amount) > 0);
    if (clean.length === 0) { toast.error(t({ fr: 'Aucune ligne à enregistrer.', ht: 'Pa gen liy pou anrejistre.' })); return; }
    setSaving(true);
    const res = await importNotebookCredits(clean.map(({ key: _k, ...r }) => ({ ...r, amount: Number(r.amount) })));
    setSaving(false);
    if (!res.ok) { toast.error(res.message); return; }
    toast.success(t({
      fr: `${res.data.imported} crédit(s) dans votre cahier ProfitPilot.`,
      ht: `${res.data.imported} kredi antre nan kaye ProfitPilot ou.`,
    }));
    if (res.data.failed.length > 0) {
      toast.error(t({ fr: `Non enregistrés : ${res.data.failed.join(', ')}`, ht: `Pa t anrejistre : ${res.data.failed.join(', ')}` }));
    }
    router.push(fromSetup ? '/demarrage?step=5' : '/creances');
  }

  return (
    <div className="pp-enter mx-auto w-full max-w-2xl px-4 py-6 sm:px-6">
      <Stack>
        <ScreenHeader
          title={t({ fr: 'Pran foto kaye ou', ht: 'Pran foto kaye ou' })}
          subtitle={t({
            fr: 'Votre cahier de crédit devient la liste « qui me doit combien ». Vous vérifiez avant d’enregistrer.',
            ht: 'Kaye kredi w vin tounen lis « kiyès ki dwe m konbyen ». Ou tcheke anvan w anrejistre.',
          })}
        />

        <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => read(e.target.files?.[0] ?? null)} />
        <Button variant="accent" size="lg" block loading={reading} loadingLabel={t({ fr: 'Lecture de la page…', ht: 'M ap li paj la…' })} onClick={() => fileRef.current?.click()}>
          <Camera className="h-5 w-5" aria-hidden />
          {pages === 0 ? t({ fr: 'Photographier une page', ht: 'Pran foto yon paj' }) : t({ fr: 'Page suivante', ht: 'Lòt paj la' })}
        </Button>

        {rows.length === 0 ? (
          <FirstRun
            title={t({ fr: 'Une page à la fois', ht: 'Yon paj alafwa' })}
            hint={t({
              fr: 'Posez le cahier bien à plat, à la lumière, et photographiez une page entière. Les lignes barrées sont considérées comme payées.',
              ht: 'Mete kaye a byen plat, nan limyè, epi pran foto yon paj antye. Liy ki bare yo konsidere kòm peye.',
            })}
          />
        ) : (
          <Card className="space-y-3 p-4">
            {rows.map((r) => (
              <div key={r.key} className="flex items-center gap-2">
                <input
                  value={r.name}
                  onChange={(e) => update(r.key, { name: e.target.value })}
                  aria-label={t({ fr: 'Nom du client', ht: 'Non kliyan an' })}
                  className={inputClass}
                />
                <input
                  inputMode="decimal"
                  value={String(r.amount)}
                  onChange={(e) => update(r.key, { amount: Number(e.target.value.replace(',', '.')) || 0 })}
                  aria-label={t({ fr: 'Montant dû', ht: 'Montan li dwe' })}
                  className={`${inputClass} amount w-28 flex-none`}
                />
                <span className="w-8 flex-none text-note font-bold text-muted">{r.currency === 'USD' ? '$' : 'G'}</span>
                <button
                  type="button"
                  onClick={() => setRows((prev) => prev.filter((x) => x.key !== r.key))}
                  aria-label={t({ fr: 'Retirer la ligne', ht: 'Retire liy lan' })}
                  className="pressable flex h-touch w-touch flex-none items-center justify-center rounded-surface text-muted hover:bg-surface"
                >
                  <Trash2 className="h-5 w-5" aria-hidden />
                </button>
              </div>
            ))}
            <Button
              variant="quiet"
              size="md"
              block
              onClick={() => setRows((prev) => [...prev, { key: crypto.randomUUID(), name: '', amount: 0, currency: 'HTG', date: '', note: '' }])}
            >
              <Plus className="h-5 w-5" aria-hidden />
              {t({ fr: 'Ajouter une ligne', ht: 'Ajoute yon liy' })}
            </Button>
            <div className="flex items-baseline justify-between border-t border-border pt-3 dark:border-dark-border">
              <span className="text-body text-text2 dark:text-dark-text2">{t({ fr: 'On vous doit', ht: 'Sa yo dwe w' })}</span>
              <span className="amount font-hero text-card text-primary dark:text-dark-text">{formatMoney(total, 'HTG')}</span>
            </div>
            <Button variant="accent" size="lg" block loading={saving} onClick={validate}>
              {t({ fr: `Valider ${rows.length} crédit(s)`, ht: `Valide ${rows.length} kredi` })}
            </Button>
          </Card>
        )}
      </Stack>
    </div>
  );
}

export default function KayePage() {
  return (
    <ProtectedRoute>
      <KayeInner />
    </ProtectedRoute>
  );
}
