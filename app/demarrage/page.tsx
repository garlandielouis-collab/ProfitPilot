'use client';

// ─────────────────────────────────────────────────────────────────────────────
// L'installation : 10 minutes, avec ou sans ajan (étude de marché inversée, §11.3)
//
//   1. Choisir son métier : Machandiz, Sèvis ou Toulède.
//   2. Choisir ses 10 produits ou services les plus fréquents.
//   3. Indiquer l'argent présent dans la caisse aujourd'hui.
//   4. « Pran foto kaye ou » : le cahier de crédit devient une liste claire.
//   5. Choisir l'heure du bilan du soir, et son numéro WhatsApp.
//
// La barre de progression ne part pas de zéro : le compte est déjà créé, et
// c'est une étape faite (effet de gradient d'objectif). Chaque étape se passe :
// rien n'empêche d'arriver à l'accueil, et l'accueil rappelle ce qui reste.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Camera, Check } from 'lucide-react';
import { toast } from 'sonner';
import { ProtectedRoute } from '../../components/ProtectedRoute';
import { useLanguage } from '../../components/LanguageWrapper';
import { useCompanyContext } from '../../contexts/CompanyContext';
import { Button, Card, ScreenHeader, Stack } from '../../components/ds';
import { saveKayeSettings } from '../actions/kaye';
import { createFavoritesAction } from '../actions/products';
import { openCashDay } from '../actions/evening';
import { updateCompany } from '../actions/company';
import { TRADES, type Trade } from '../../lib/kaye';
import { SETUP_FAVORITES, catalogFor } from '../../lib/localCatalog';
import { cn } from '../../lib/utils';

type Step = 1 | 2 | 3 | 4 | 5;
const STEPS = 5;
const HOURS = [17, 18, 19, 20, 21];

const inputClass = 'min-h-13 w-full rounded-surface border border-border bg-surface px-4 text-body text-primary outline-none placeholder:text-muted focus:border-accent dark:border-dark-border dark:bg-dark-surface2 dark:text-dark-text';

function DemarrageInner() {
  const { t } = useLanguage();
  const router = useRouter();
  const { company, refresh } = useCompanyContext();

  const [step, setStep] = useState<Step>(1);
  const [trade, setTrade] = useState<Trade | null>(company?.kaye?.trade ?? null);
  const [picked, setPicked] = useState<Record<string, string>>({});
  const [custom, setCustom] = useState('');
  const [opening, setOpening] = useState('');
  const [hour, setHour] = useState(company?.kaye?.eveningHour ?? 19);
  const [phone, setPhone] = useState(company?.phone ?? '');
  const [busy, setBusy] = useState(false);

  // Retour de la photo du cahier (`/kaye`) : on reprend où on en était. Lu
  // dans `window.location`, pas `useSearchParams` (voir la mémoire du projet :
  // le second fait attendre l'écran derrière un Suspense).
  useEffect(() => {
    const s = Number(new URLSearchParams(window.location.search).get('step'));
    if (s >= 1 && s <= STEPS) setStep(s as Step);
  }, []);

  const catalog = useMemo(() => catalogFor(trade), [trade]);
  const pickedNames = Object.keys(picked);

  // Le compte créé compte pour une étape : la barre ne part jamais de zéro.
  const progress = Math.round((step / (STEPS + 1)) * 100);

  function toggle(name: string) {
    setPicked((p) => {
      if (name in p) { const { [name]: _drop, ...rest } = p; return rest; }
      if (Object.keys(p).length >= SETUP_FAVORITES) {
        toast.message(t({ fr: `${SETUP_FAVORITES} favoris pour commencer : vous en ajouterez d’autres plus tard.`, ht: `${SETUP_FAVORITES} favori pou kòmanse : w ap ajoute lòt pita.` }));
        return p;
      }
      return { ...p, [name]: '' };
    });
  }

  async function saveTrade() {
    if (!trade) { toast.error(t({ fr: 'Choisissez votre métier.', ht: 'Chwazi metye w.' })); return; }
    setBusy(true);
    const res = await saveKayeSettings({ trade });
    setBusy(false);
    if (!res.ok) { toast.error(res.message); return; }
    await refresh();
    setStep(2);
  }

  async function saveFavorites() {
    const drafts = pickedNames.map((name) => ({
      name,
      sale_price: Number(String(picked[name]).replace(',', '.')),
      kind: (catalog.find((c) => c.name === name)?.kind ?? (trade === 'service' ? 'service' : 'product')) as 'product' | 'service',
    }));
    const missing = drafts.filter((d) => !(d.sale_price > 0));
    if (missing.length > 0) {
      toast.error(t({ fr: `Tapez le prix de : ${missing.map((d) => d.name).join(', ')}`, ht: `Tape pri : ${missing.map((d) => d.name).join(', ')}` }));
      return;
    }
    if (drafts.length === 0) { setStep(3); return; }
    setBusy(true);
    const res = await createFavoritesAction(drafts);
    setBusy(false);
    if (!res.ok) { toast.error(res.message); return; }
    toast.success(t({ fr: `${res.data} favoris prêts.`, ht: `${res.data} favori pare.` }));
    setStep(3);
  }

  async function saveOpening() {
    if (opening.trim()) {
      const v = Number(opening.replace(',', '.'));
      if (!(v >= 0)) { toast.error(t({ fr: 'Tapez un montant.', ht: 'Tape yon montan.' })); return; }
      setBusy(true);
      const res = await openCashDay({ openingCash: v });
      setBusy(false);
      if (!res.ok) { toast.error(res.message); return; }
    }
    setStep(4);
  }

  async function finish() {
    setBusy(true);
    const res = await saveKayeSettings({ eveningHour: hour, eveningEnabled: true, setupDone: true });
    if (company?.id && phone.trim() && phone.trim() !== (company.phone ?? '')) {
      await updateCompany({ id: company.id, phone: phone.trim() });
    }
    setBusy(false);
    if (!res.ok) { toast.error(res.message); return; }
    await refresh();
    toast.success(t({ fr: 'C’est prêt. Vous vendez, ProfitPilot compte.', ht: 'Li pare. Ou vann, ProfitPilot konte.' }));
    router.push('/dashboard');
  }

  const addCustom = () => {
    const name = custom.trim();
    if (!name) return;
    if (!(name in picked)) toggle(name);
    setCustom('');
  };

  return (
    <div className="pp-enter mx-auto w-full max-w-2xl px-4 py-6 sm:px-6">
      <Stack>
        <ScreenHeader
          title={t({ fr: 'Installation', ht: 'Enstalasyon' })}
          subtitle={t({ fr: `Étape ${step} sur ${STEPS} · environ 10 minutes`, ht: `Etap ${step} sou ${STEPS} · anviwon 10 minit` })}
        />
        <div className="h-2 overflow-hidden rounded-pill bg-surface2 dark:bg-dark-surface2" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}>
          <div className="h-full rounded-pill bg-accent transition-all duration-move ease-pp" style={{ width: `${progress}%` }} />
        </div>

        {/* ── 1. Le métier ── */}
        {step === 1 && (
          <Card className="space-y-4 p-4">
            <h2 className="text-card font-bold text-primary dark:text-dark-text">{t({ fr: 'Que vendez-vous ?', ht: 'Kisa w vann ?' })}</h2>
            <div className="space-y-2" role="radiogroup">
              {TRADES.map((option) => (
                <button
                  key={option.key}
                  type="button"
                  role="radio"
                  aria-checked={trade === option.key}
                  onClick={() => setTrade(option.key)}
                  className={cn(
                    'pressable flex min-h-hero w-full items-center gap-3 rounded-surface border px-4 py-3 text-left transition-colors duration-press',
                    trade === option.key ? 'border-primary bg-surface2 dark:bg-dark-surface2' : 'border-border bg-white hover:bg-surface dark:border-dark-border dark:bg-dark-surface',
                  )}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block text-card font-bold text-primary dark:text-dark-text">{t(option.label)}</span>
                    <span className="block text-note text-muted dark:text-dark-muted">{t(option.hint)}</span>
                  </span>
                  {trade === option.key && <Check className="h-5 w-5 text-primary" aria-hidden />}
                </button>
              ))}
            </div>
            <Button variant="accent" size="lg" block loading={busy} onClick={saveTrade}>{t({ fr: 'Continuer', ht: 'Kontinye' })}</Button>
          </Card>
        )}

        {/* ── 2. Les favoris ── */}
        {step === 2 && (
          <Card className="space-y-4 p-4">
            <div>
              <h2 className="text-card font-bold text-primary dark:text-dark-text">
                {trade === 'service'
                  ? t({ fr: `Vos ${SETUP_FAVORITES} services les plus fréquents`, ht: `${SETUP_FAVORITES} sèvis ou fè pi souvan` })
                  : t({ fr: `Vos ${SETUP_FAVORITES} ventes les plus fréquentes`, ht: `${SETUP_FAVORITES} sa w vann pi souvan` })}
              </h2>
              <p className="mt-1 text-note text-muted dark:text-dark-muted">
                {t({ fr: 'Touchez pour choisir, puis tapez VOTRE prix. Ils seront en tête de chaque vente.', ht: 'Touche pou chwazi, epi tape pri PA W. Y ap an tèt chak vant.' })}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {catalog.map((item) => {
                const on = item.name in picked;
                return (
                  <button
                    key={item.name}
                    type="button"
                    aria-pressed={on}
                    onClick={() => toggle(item.name)}
                    className={cn(
                      'pressable min-h-touch rounded-pill px-3 text-body font-bold transition-colors duration-press',
                      on ? 'bg-primary text-white' : 'bg-surface2 text-primary hover:bg-border dark:bg-dark-surface2 dark:text-dark-text',
                    )}
                  >
                    {item.name}
                  </button>
                );
              })}
            </div>
            <div className="flex gap-2">
              <input
                value={custom}
                onChange={(e) => setCustom(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') addCustom(); }}
                placeholder={t({ fr: 'Autre chose ? Tapez le nom', ht: 'Lòt bagay ? Tape non an' })}
                className={inputClass}
              />
              <Button variant="quiet" size="lg" onClick={addCustom}>{t({ fr: 'Ajouter', ht: 'Ajoute' })}</Button>
            </div>
            {pickedNames.length > 0 && (
              <div className="space-y-2 border-t border-border pt-4 dark:border-dark-border">
                {pickedNames.map((name) => (
                  <label key={name} className="flex items-center gap-3">
                    <span className="min-w-0 flex-1 truncate text-body font-bold text-primary dark:text-dark-text">{name}</span>
                    <input
                      inputMode="decimal"
                      value={picked[name]}
                      onChange={(e) => setPicked((p) => ({ ...p, [name]: e.target.value.replace(/[^0-9.,]/g, '') }))}
                      placeholder={t({ fr: 'Prix (G)', ht: 'Pri (G)' })}
                      aria-label={t({ fr: `Prix de ${name}`, ht: `Pri ${name}` })}
                      className={cn(inputClass, 'amount w-32 flex-none')}
                    />
                  </label>
                ))}
              </div>
            )}
            <Button variant="accent" size="lg" block loading={busy} onClick={saveFavorites}>
              {pickedNames.length > 0
                ? t({ fr: `Enregistrer ${pickedNames.length} favori${pickedNames.length > 1 ? 's' : ''}`, ht: `Anrejistre ${pickedNames.length} favori` })
                : t({ fr: 'Passer cette étape', ht: 'Sote etap sa a' })}
            </Button>
          </Card>
        )}

        {/* ── 3. La caisse ── */}
        {step === 3 && (
          <Card className="space-y-4 p-4">
            <h2 className="text-card font-bold text-primary dark:text-dark-text">{t({ fr: 'Combien y a-t-il dans la caisse aujourd’hui ?', ht: 'Konbyen kòb ki nan kès la jodi a ?' })}</h2>
            <p className="text-note text-muted dark:text-dark-muted">
              {t({ fr: 'Chaque soir, ProfitPilot vous dira combien il DEVRAIT y avoir. Vous saurez si la caisse est juste.', ht: 'Chak swa, ProfitPilot ap di w konbyen ki DWE genyen. W ap konnen si kès la bon.' })}
            </p>
            <input inputMode="decimal" value={opening} onChange={(e) => setOpening(e.target.value)} placeholder="0" className={cn(inputClass, 'amount')} />
            <Button variant="accent" size="lg" block loading={busy} onClick={saveOpening}>
              {opening.trim() ? t({ fr: 'Continuer', ht: 'Kontinye' }) : t({ fr: 'Passer cette étape', ht: 'Sote etap sa a' })}
            </Button>
          </Card>
        )}

        {/* ── 4. Le cahier en photo ── */}
        {step === 4 && (
          <Card className="space-y-4 p-4">
            <h2 className="text-card font-bold text-primary dark:text-dark-text">{t({ fr: 'Pran foto kaye ou', ht: 'Pran foto kaye ou' })}</h2>
            <p className="text-body text-text2 dark:text-dark-text2">
              {t({
                fr: 'Photographiez les pages de votre cahier de crédit : ProfitPilot lit les noms et les montants, vous corrigez et vous validez. En deux minutes, « qui me doit combien » est clair.',
                ht: 'Pran foto paj kaye kredi w yo : ProfitPilot li non yo ak montan yo, ou korije epi ou valide. Nan de minit, « kiyès ki dwe m konbyen » klè.',
              })}
            </p>
            <Link href="/kaye?from=demarrage" className="block">
              <Button variant="accent" size="lg" block>
                <Camera className="h-5 w-5" aria-hidden />
                {t({ fr: 'Photographier mon cahier', ht: 'Pran foto kaye mwen' })}
              </Button>
            </Link>
            <Button variant="link" size="md" block onClick={() => setStep(5)}>
              {t({ fr: 'Je n’ai pas de cahier de crédit · plus tard', ht: 'M pa gen kaye kredi · pita' })}
            </Button>
          </Card>
        )}

        {/* ── 5. Le bilan du soir ── */}
        {step === 5 && (
          <Card className="space-y-4 p-4">
            <h2 className="text-card font-bold text-primary dark:text-dark-text">{t({ fr: 'À quelle heure voulez-vous votre bilan ?', ht: 'Ki lè ou vle rapò a ?' })}</h2>
            <div className="grid grid-cols-5 gap-2" role="radiogroup">
              {HOURS.map((h) => (
                <button
                  key={h}
                  type="button"
                  role="radio"
                  aria-checked={hour === h}
                  onClick={() => setHour(h)}
                  className={cn(
                    'pressable min-h-hero rounded-control text-body font-bold transition-colors duration-press',
                    hour === h ? 'bg-primary text-white' : 'bg-surface2 text-primary hover:bg-border dark:bg-dark-surface2 dark:text-dark-text',
                  )}
                >
                  {h} h
                </button>
              ))}
            </div>
            <div className="space-y-2">
              <label htmlFor="pp-whatsapp" className="block text-note font-bold uppercase tracking-wide text-muted">
                {t({ fr: 'Votre numéro WhatsApp', ht: 'Nimewo WhatsApp ou' })}
              </label>
              <input id="pp-whatsapp" type="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="3712 3456" className={inputClass} />
              <p className="text-note text-muted dark:text-dark-muted">
                {t({ fr: 'Le bilan s’ouvre dans votre WhatsApp en un tap.', ht: 'Rapò a louvri nan WhatsApp ou an yon tap.' })}
              </p>
            </div>
            <Button variant="accent" size="lg" block loading={busy} onClick={finish}>{t({ fr: 'Terminer', ht: 'Fini' })}</Button>
          </Card>
        )}
      </Stack>
    </div>
  );
}

export default function DemarragePage() {
  return (
    <ProtectedRoute>
      <DemarrageInner />
    </ProtectedRoute>
  );
}
