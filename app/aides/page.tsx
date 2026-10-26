'use client';

// ─────────────────────────────────────────────────────────────────────────────
// Èd mwen yo — inviter un aide, régler sa paie, voir ce qui lui revient (F16)
//
// Remplace, dans le menu, le module RH complet retiré des offres (§12.1) :
// « suffisant pour des entreprises de 1 à 10 personnes ». Un aide invité
// arrive caissier — il note les ventes, il ne voit ni le profit ni la caisse.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useState } from 'react';
import { MessageCircle, UserPlus } from 'lucide-react';
import { toast } from 'sonner';
import { ProtectedRoute } from '../../components/ProtectedRoute';
import { useLanguage } from '../../components/LanguageWrapper';
import { useCompanyContext } from '../../contexts/CompanyContext';
import { usePermissions } from '../../hooks/usePermissions';
import { Button, Card, FirstRun, Section, ScreenHeader, Stack } from '../../components/ds';
import { listHelperPay, setHelperPay, type HelperPay } from '../actions/helpers';
import { sendHrInvitation } from '../actions/invitations';
import { removeEmployee } from '../actions/employees';
import { formatMoney } from '../../lib/eveningReport';
import { planMaxMembers } from '../../lib/planFeatures';
import type { PayMode } from '../../lib/helperPay';
import { cn } from '../../lib/utils';

const inputClass = 'min-h-13 w-full rounded-surface border border-border bg-surface px-4 text-body text-primary outline-none placeholder:text-muted focus:border-accent dark:border-dark-border dark:bg-dark-surface2 dark:text-dark-text';

function HelperRow({ helper, canSetPay, onSaved, showServices }: {
  helper: HelperPay; canSetPay: boolean; onSaved: () => void; showServices: boolean;
}) {
  const { t } = useLanguage();
  const [mode, setMode] = useState<PayMode | null>(helper.payMode);
  const [rate, setRate] = useState(helper.payRate ? String(helper.payRate) : '');
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    const res = await setHelperPay(helper.memberId, mode, rate.trim() ? Number(rate.replace(',', '.')) : null);
    setBusy(false);
    if (!res.ok) { toast.error(res.message); return; }
    toast.success(t({ fr: 'Paie enregistrée.', ht: 'Peman an anrejistre.' }));
    onSaved();
  }

  async function revoke() {
    if (!window.confirm(t({ fr: `Retirer l’accès de ${helper.name || 'cet aide'} ?`, ht: `Retire aksè ${helper.name || 'èd sa a'} ?` }))) return;
    const res = await removeEmployee(helper.memberId);
    if (!res.ok) { toast.error(res.message); return; }
    toast.success(t({ fr: 'Accès retiré.', ht: 'Aksè a retire.' }));
    onSaved();
  }

  return (
    <Card className="space-y-3 p-4">
      <div className="flex items-baseline justify-between gap-3">
        <span className="min-w-0">
          <span className="block truncate text-card font-bold text-primary dark:text-dark-text">{helper.name || t({ fr: 'Aide', ht: 'Èd' })}</span>
          <span className="block text-note text-muted">
            {t({ fr: `Vendu : ${formatMoney(helper.sold, 'HTG')} · ${helper.daysWorked} jour(s)`, ht: `Vann : ${formatMoney(helper.sold, 'HTG')} · ${helper.daysWorked} jou` })}
          </span>
        </span>
        <span className="text-right">
          <span className="block text-note text-muted">{t({ fr: 'À payer', ht: 'Pou peye' })}</span>
          <span className="amount block font-hero text-card text-primary dark:text-dark-text">{formatMoney(helper.due, 'HTG')}</span>
        </span>
      </div>

      {canSetPay && (
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label={t({ fr: 'Façon de payer', ht: 'Fason pou peye' })}>
            {([
              { key: 'daily' as const,   label: t({ fr: 'À la journée', ht: 'Pa jounen' }) },
              { key: 'percent' as const, label: t({ fr: 'Au pourcentage', ht: 'Pa pousantaj' }) },
            ]).map((o) => (
              <button
                key={o.key}
                type="button"
                role="radio"
                aria-checked={mode === o.key}
                onClick={() => setMode(o.key)}
                className={cn(
                  'pressable min-h-touch rounded-control text-body font-bold transition-colors duration-press',
                  mode === o.key ? 'bg-primary text-white' : 'bg-surface2 text-primary hover:bg-border dark:bg-dark-surface2 dark:text-dark-text',
                )}
              >
                {o.label}
              </button>
            ))}
          </div>
          {mode && (
            <div className="flex gap-2">
              <input
                inputMode="decimal"
                value={rate}
                onChange={(e) => setRate(e.target.value.replace(/[^0-9.,]/g, ''))}
                placeholder={mode === 'daily' ? t({ fr: 'Montant par jour (G)', ht: 'Montan pa jou (G)' }) : t({ fr: 'Pourcentage (%)', ht: 'Pousantaj (%)' })}
                aria-label={mode === 'daily' ? t({ fr: 'Montant par jour', ht: 'Montan pa jou' }) : t({ fr: 'Pourcentage', ht: 'Pousantaj' })}
                className={`${inputClass} amount`}
              />
              <Button variant="quiet" size="lg" loading={busy} onClick={save}>{t({ fr: 'Enregistrer', ht: 'Anrejistre' })}</Button>
            </div>
          )}
        </div>
      )}

      {showServices && helper.byService.length > 0 && (
        <div className="space-y-1 border-t border-border pt-3 dark:border-dark-border">
          <p className="text-note font-bold uppercase tracking-wide text-muted">{t({ fr: 'Par service', ht: 'Pa sèvis' })}</p>
          {helper.byService.slice(0, 5).map((s) => (
            <div key={s.name} className="flex justify-between gap-3 text-body">
              <span className="truncate text-text2 dark:text-dark-text2">{s.name}</span>
              <span className="amount text-primary dark:text-dark-text">
                {formatMoney(s.sold, 'HTG')}{s.commission > 0 ? ` · ${formatMoney(s.commission, 'HTG')}` : ''}
              </span>
            </div>
          ))}
        </div>
      )}

      {canSetPay && (
        <Button variant="link" size="sm" onClick={revoke}>{t({ fr: 'Retirer l’accès', ht: 'Retire aksè a' })}</Button>
      )}
    </Card>
  );
}

function AidesInner() {
  const { t } = useLanguage();
  const { role, planKey } = useCompanyContext();
  const { can, canUse } = usePermissions();
  const [period, setPeriod] = useState<'week' | 'month'>('week');
  const [helpers, setHelpers] = useState<HelperPay[] | null>(null);
  const [first, setFirst] = useState('');
  const [email, setEmail] = useState('');
  const [inviting, setInviting] = useState(false);
  const [lastLink, setLastLink] = useState<string | null>(null);

  const load = useCallback(() => {
    listHelperPay(period).then((r) => {
      if (r.ok) setHelpers(r.data.helpers);
      else { setHelpers([]); toast.error(r.message); }
    }).catch(() => setHelpers([]));
  }, [period]);

  useEffect(() => { load(); }, [load]);

  if (!can('reports:read')) {
    return <FirstRun title={t({ fr: 'Réservé au patron', ht: 'Se pou patwon an sèlman' })} />;
  }

  const seats = planMaxMembers(planKey);
  const isOwner = role === 'owner';

  async function invite() {
    if (!first.trim() || !email.trim()) {
      toast.error(t({ fr: 'Le prénom et l’adresse e-mail de l’aide.', ht: 'Non ak adrès imèl èd la.' }));
      return;
    }
    setInviting(true);
    const res = await sendHrInvitation({ email: email.trim(), firstName: first.trim(), lastName: '' });
    setInviting(false);
    if (!res.ok) { toast.error(res.message); return; }
    const link = `${window.location.origin}/auth/accept-invitation?token=${res.data.token}`;
    setLastLink(link);
    toast.success(t({ fr: 'Invitation envoyée par e-mail.', ht: 'Envitasyon an pati pa imèl.' }));
    setFirst(''); setEmail('');
  }

  return (
    <div className="pp-enter mx-auto w-full max-w-3xl px-4 py-6 sm:px-6">
      <Stack>
        <ScreenHeader
          title={t({ fr: 'Mes aides', ht: 'Èd mwen yo' })}
          subtitle={t({
            fr: `Ils notent les ventes, ils ne voient ni le profit ni la caisse. ${Number.isFinite(seats) ? `${seats - 1} aide(s) dans votre offre.` : ''}`,
            ht: `Yo note vant yo, yo pa wè ni pwofi a ni kès la. ${Number.isFinite(seats) ? `${seats - 1} èd nan ofr ou.` : ''}`,
          })}
        />

        <div className="grid grid-cols-2 gap-2" role="tablist">
          {(['week', 'month'] as const).map((p) => (
            <button
              key={p}
              type="button"
              role="tab"
              aria-selected={period === p}
              onClick={() => setPeriod(p)}
              className={cn(
                'pressable min-h-touch rounded-control text-body font-bold transition-colors duration-press',
                period === p ? 'bg-primary text-white' : 'bg-surface2 text-primary hover:bg-border dark:bg-dark-surface2 dark:text-dark-text',
              )}
            >
              {p === 'week' ? t({ fr: 'Cette semaine', ht: 'Semèn sa a' }) : t({ fr: 'Ce mois', ht: 'Mwa sa a' })}
            </button>
          ))}
        </div>

        {helpers === null ? (
          <span className="pp-skeleton block h-32 rounded-surface" aria-hidden />
        ) : helpers.length === 0 ? (
          <FirstRun
            title={t({ fr: 'Pas encore d’aide', ht: 'Pa gen èd ankò' })}
            hint={t({ fr: 'Invitez la personne qui vend avec vous : elle notera ses ventes depuis son téléphone.', ht: 'Envite moun k ap vann avè w la : l ap note vant li yo sou telefòn pa l.' })}
          />
        ) : (
          <div className="space-y-3">
            {helpers.map((h) => (
              <HelperRow
                key={h.memberId}
                helper={h}
                canSetPay={isOwner && canUse('helper_pay')}
                showServices={canUse('service_commissions')}
                onSaved={load}
              />
            ))}
          </div>
        )}

        {isOwner && (
          <Section title={t({ fr: 'Inviter un aide', ht: 'Envite yon èd' })}>
            <Card className="space-y-3 p-4">
              <input value={first} onChange={(e) => setFirst(e.target.value)} placeholder={t({ fr: 'Prénom', ht: 'Non' })} className={inputClass} />
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder={t({ fr: 'Adresse e-mail', ht: 'Adrès imèl' })} className={inputClass} />
              <Button variant="accent" size="lg" block loading={inviting} onClick={invite}>
                <UserPlus className="h-5 w-5" aria-hidden />
                {t({ fr: 'Inviter', ht: 'Envite' })}
              </Button>
              {lastLink && (
                <a
                  href={`https://wa.me/?text=${encodeURIComponent(`${t({ fr: 'Voici ton accès à ProfitPilot :', ht: 'Men aksè ou nan ProfitPilot :' })} ${lastLink}`)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="pressable flex min-h-touch items-center justify-center gap-2 rounded-surface bg-surface2 text-body font-bold text-primary dark:bg-dark-surface2 dark:text-dark-text"
                >
                  <MessageCircle className="h-5 w-5" aria-hidden />
                  {t({ fr: 'Envoyer aussi le lien par WhatsApp', ht: 'Voye lyen an sou WhatsApp tou' })}
                </a>
              )}
            </Card>
          </Section>
        )}
      </Stack>
    </div>
  );
}

export default function AidesPage() {
  return (
    <ProtectedRoute>
      <AidesInner />
    </ProtectedRoute>
  );
}
