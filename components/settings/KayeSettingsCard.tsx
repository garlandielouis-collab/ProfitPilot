'use client';

// ─────────────────────────────────────────────────────────────────────────────
// Mon kaye — le métier et le bilan du soir, réglables après l'installation
//
// Le métier décide de l'écran (lib/kaye.ts) ; l'heure décide du moment où le
// bilan du soir vient au marchand (F06). Les deux se choisissent à
// l'installation (/demarrage) et se changent ici.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { useLanguage } from '../LanguageWrapper';
import { useCompanyContext } from '../../contexts/CompanyContext';
import { saveKayeSettings } from '../../app/actions/kaye';
import { TRADES, type Trade } from '../../lib/kaye';
import { Button, Card, Switch } from '../ds';
import { cn } from '../../lib/utils';

const HOURS = [16, 17, 18, 19, 20, 21, 22];

export function KayeSettingsCard() {
  const { t } = useLanguage();
  const { company, refresh, can } = useCompanyContext();
  const [trade, setTrade] = useState<Trade | null>(null);
  const [hour, setHour] = useState(19);
  const [enabled, setEnabled] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!company) return;
    setTrade(company.kaye.trade);
    setHour(company.kaye.eveningHour);
    setEnabled(company.kaye.eveningEnabled);
  }, [company]);

  if (!company || !can('settings:write')) return null;

  async function save() {
    setBusy(true);
    const res = await saveKayeSettings({ ...(trade ? { trade } : {}), eveningHour: hour, eveningEnabled: enabled });
    setBusy(false);
    if (!res.ok) { toast.error(res.message); return; }
    await refresh();
    toast.success(t({ fr: 'Réglages enregistrés.', ht: 'Paramèt yo anrejistre.' }));
  }

  return (
    <Card className="space-y-4 p-5">
      <h2 className="text-card font-bold text-primary dark:text-dark-text">{t({ fr: 'Mon métier et mon bilan du soir', ht: 'Metye m ak rapò aswè m' })}</h2>

      <div className="space-y-2" role="radiogroup" aria-label={t({ fr: 'Métier', ht: 'Metye' })}>
        {TRADES.map((option) => (
          <button
            key={option.key}
            type="button"
            role="radio"
            aria-checked={trade === option.key}
            onClick={() => setTrade(option.key)}
            className={cn(
              'pressable flex min-h-13 w-full flex-col justify-center rounded-surface border px-4 py-2 text-left transition-colors duration-press',
              trade === option.key ? 'border-primary bg-surface2 dark:bg-dark-surface2' : 'border-border bg-white hover:bg-surface dark:border-dark-border dark:bg-dark-surface',
            )}
          >
            <span className="text-body font-bold text-primary dark:text-dark-text">{t(option.label)}</span>
            <span className="text-note text-muted dark:text-dark-muted">{t(option.hint)}</span>
          </button>
        ))}
      </div>

      <Switch
        checked={enabled}
        onChange={setEnabled}
        label={t({ fr: 'Recevoir le bilan du soir', ht: 'Resevwa rapò aswè a' })}
        hint={t({ fr: 'Vendu, dépensé, gagné, et un conseil — prêt à partir sur WhatsApp.', ht: 'Sa w vann, sa w depanse, sa w fè, ak yon konsèy — pare pou WhatsApp.' })}
      />

      {enabled && (
        <div className="grid grid-cols-7 gap-1" role="radiogroup" aria-label={t({ fr: 'Heure du bilan', ht: 'Lè rapò a' })}>
          {HOURS.map((h) => (
            <button
              key={h}
              type="button"
              role="radio"
              aria-checked={hour === h}
              onClick={() => setHour(h)}
              className={cn(
                'pressable min-h-touch rounded-control text-note font-bold transition-colors duration-press',
                hour === h ? 'bg-primary text-white' : 'bg-surface2 text-primary hover:bg-border dark:bg-dark-surface2 dark:text-dark-text',
              )}
            >
              {h}h
            </button>
          ))}
        </div>
      )}

      <Button variant="accent" size="md" loading={busy} onClick={save}>{t({ fr: 'Enregistrer', ht: 'Anrejistre' })}</Button>
    </Card>
  );
}
