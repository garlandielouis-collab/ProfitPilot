'use client';

// ─────────────────────────────────────────────────────────────────────────────
// L'accueil — trois gros boutons, trois chiffres, un conseil
//
// Étude de marché inversée, §11.1 : « Trois gros boutons sur l'accueil : VANN
// (ou SÈVIS), DEPANS, KREDI. Tout le reste est derrière " Plis ". » Puis la
// journée en trois chiffres — vendu, dépensé, gagné —, la caisse attendue, qui
// doit, et UN conseil. Le soir venu, le même bloc devient le bilan du soir,
// prêt à partir sur WhatsApp (F06).
//
// Ce composant est le même pour les trois offres. Les tableaux de bord
// détaillés de Kwasans et d'Elit restent, un tap plus bas (« Wè plis detay ») :
// « les détails restent accessibles derrière Plis » (§12.1).
//
// Un aide (rôle sans `reports:read`) voit les trois boutons et rien d'autre :
// « ils notent, ils ne voient pas le profit ni la caisse » (§13.2).
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { ChevronDown, HandCoins, MessageCircle, Plus, Receipt, Rocket, Vault } from 'lucide-react';
import { useLanguage } from '../LanguageWrapper';
import { usePermissions } from '../../hooks/usePermissions';
import { useCompanyContext } from '../../contexts/CompanyContext';
import { deliverEveningReport, getDayView, type DayView } from '../../app/actions/evening';
import { ENTRY_SAVED_EVENT, openExpenseSheet, openSaleSheet } from '../../lib/quickSheets';
import { saleWord } from '../../lib/kaye';
import { formatMoney } from '../../lib/eveningReport';
import { cn } from '../../lib/utils';
import { coachRequestMessage, supportWhatsAppLink } from '../../lib/support';

function BigButton({
  label, hint, icon, onClick, primary = false,
}: {
  label: string; hint: string; icon: ReactNode; onClick: () => void; primary?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        // Debout, d'une main, au soleil (§4) : grand, contrasté, sans finesse.
        // 120 px, hors échelle des boutons (56 max) : ce sont les trois seules
        // cibles de l'écran, et l'étude en fait des « gros boutons » (§11.1).
        'pressable flex min-h-[7.5rem] flex-col items-center justify-center gap-2 rounded-surface px-2 text-center',
        'transition-colors duration-press ease-pp',
        primary
          ? 'bg-accent text-accent-ink shadow-card hover:bg-accent-h'
          : 'border border-border bg-white text-primary hover:bg-surface dark:border-dark-border dark:bg-dark-surface dark:text-dark-text',
      )}
    >
      {icon}
      <span className="text-card font-bold leading-none tracking-wide">{label}</span>
      <span className={cn('text-note', primary ? 'text-accent-ink/80' : 'text-muted dark:text-dark-muted')}>{hint}</span>
    </button>
  );
}

export function KayeHome({ details }: { details?: ReactNode }) {
  const { t, language } = useLanguage();
  const { can, canUse } = usePermissions();
  const { company, role } = useCompanyContext();
  const trade = company?.kaye?.trade ?? null;
  const isOwner = role === 'owner' || role === 'admin';

  const [view, setView] = useState<DayView | null>(null);
  const [failed, setFailed] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const delivered = useRef(false);

  const load = useCallback(() => {
    getDayView()
      .then((r) => {
        if (r.ok) { setView(r.data); setFailed(false); }
        else setFailed(true);
      })
      .catch(() => setFailed(true));
  }, []);

  useEffect(() => { load(); }, [load, company?.id]);

  useEffect(() => {
    window.addEventListener(ENTRY_SAVED_EVENT, load);
    return () => window.removeEventListener(ENTRY_SAVED_EVENT, load);
  }, [load]);

  // Passé l'heure du bilan, la notification du soir est posée une fois — elle
  // attend le marchand dans la cloche, avec le message WhatsApp prêt.
  useEffect(() => {
    if (!view?.eveningReached || !view.report.showProfit || delivered.current) return;
    delivered.current = true;
    deliverEveningReport().catch(() => {});
  }, [view]);

  const sale = saleWord(trade);
  const r = view?.report;
  const m = (n: number) => formatMoney(n, r?.currency ?? 'HTG');
  const seesFigures = Boolean(r?.showProfit);

  return (
    <div className="space-y-6">
      {/* L'installation guidée n'est pas finie : c'est elle qui transforme le
          cahier en liste claire (§11.3). Une carte, pas un mur. */}
      {isOwner && company && !company.kaye?.setupDone && (
        <Link
          href="/demarrage"
          className="pressable flex items-center gap-3 rounded-surface border border-accent/40 bg-accent-sub p-4 text-primary"
        >
          <Rocket className="h-6 w-6 flex-shrink-0" aria-hidden />
          <span className="min-w-0 flex-1">
            <span className="block text-body font-bold">{t({ fr: 'Terminez l’installation : 10 minutes', ht: 'Fini enstalasyon an : 10 minit' })}</span>
            <span className="block text-note text-text2 dark:text-dark-text2">
              {t({ fr: 'Votre métier, vos 10 favoris, la caisse, votre cahier en photo.', ht: 'Metye w, 10 favori w, kès la, kaye w an foto.' })}
            </span>
          </span>
        </Link>
      )}

      {/* ── Les trois gestes ── */}
      <div className="grid grid-cols-3 gap-2">
        <BigButton
          primary
          label={t(sale)}
          hint={t({ fr: '3 secondes', ht: '3 segonn' })}
          icon={<Plus className="h-7 w-7" strokeWidth={2.5} aria-hidden />}
          onClick={() => openSaleSheet()}
        />
        <BigButton
          label={t({ fr: 'DÉPENSE', ht: 'DEPANS' })}
          hint={t({ fr: 'Montant + quoi', ht: 'Montan + kisa' })}
          icon={<Receipt className="h-7 w-7" aria-hidden />}
          onClick={() => openExpenseSheet()}
        />
        <BigButton
          label={t({ fr: 'CRÉDIT', ht: 'KREDI' })}
          hint={t({ fr: 'Qui, combien', ht: 'Kiyès, konbyen' })}
          icon={<HandCoins className="h-7 w-7" aria-hidden />}
          onClick={() => openSaleSheet({ credit: true })}
        />
      </div>

      {/* ── La journée, ou le bilan du soir ── */}
      {seesFigures && r && view && (
        <section
          aria-label={view.eveningReached ? t({ fr: 'Le bilan du soir', ht: 'Rapò aswè a' }) : t({ fr: 'Votre journée', ht: 'Jounen ou' })}
          className="space-y-4 rounded-surface border border-border bg-white p-4 dark:border-dark-border dark:bg-dark-surface"
        >
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="text-card font-bold text-primary dark:text-dark-text">
              {view.eveningReached
                ? t({ fr: 'Le bilan de ce soir', ht: 'Rapò aswè a' })
                : t({ fr: 'Votre journée', ht: 'Jounen ou jodi a' })}
            </h2>
            {!view.eveningReached && (
              <span className="text-note text-muted dark:text-dark-muted">
                {t({ fr: `Bilan à ${view.eveningHour} h`, ht: `Rapò a ${view.eveningHour}è` })}
              </span>
            )}
          </div>

          <dl className="grid grid-cols-3 gap-2 text-center">
            <div>
              <dt className="text-note text-muted dark:text-dark-muted">{t({ fr: 'Vendu', ht: 'Sa w vann' })}</dt>
              <dd className="amount text-card font-bold text-primary dark:text-dark-text">{m(r.sold)}</dd>
            </div>
            <div>
              <dt className="text-note text-muted dark:text-dark-muted">{t({ fr: 'Dépensé', ht: 'Sa w depanse' })}</dt>
              <dd className="amount text-card font-bold text-primary dark:text-dark-text">{m(r.cost + r.spent)}</dd>
            </div>
            <div>
              <dt className="text-note text-muted dark:text-dark-muted">{t({ fr: 'Gagné', ht: 'Pwofi' })}</dt>
              <dd className={cn('amount font-hero text-card', r.profit < 0 ? 'text-danger' : 'text-success')}>{m(r.profit)}</dd>
            </div>
          </dl>

          <div className="grid grid-cols-2 gap-2">
            <Link href="/caisse" className="pressable flex min-h-13 items-center gap-2 rounded-surface bg-surface px-3 dark:bg-dark-surface2">
              <Vault className="h-5 w-5 flex-shrink-0 text-muted" aria-hidden />
              <span className="min-w-0">
                <span className="block text-note text-muted dark:text-dark-muted">{t({ fr: 'Caisse attendue', ht: 'Kès atandi' })}</span>
                <span className="amount block text-body font-bold text-primary dark:text-dark-text">{m(r.expectedCash)}</span>
              </span>
            </Link>
            <Link href="/creances" className="pressable flex min-h-13 items-center gap-2 rounded-surface bg-surface px-3 dark:bg-dark-surface2">
              <HandCoins className="h-5 w-5 flex-shrink-0 text-muted" aria-hidden />
              <span className="min-w-0">
                <span className="block text-note text-muted dark:text-dark-muted">{t({ fr: 'On vous doit', ht: 'Sa yo dwe w' })}</span>
                <span className="amount block text-body font-bold text-primary dark:text-dark-text">{m(r.owed)}</span>
              </span>
            </Link>
          </div>

          {r.ownerWithdrawals > 0 && (
            <p className="text-note text-text2 dark:text-dark-text2">
              {t({ fr: `Pris pour la maison aujourd’hui : ${m(r.ownerWithdrawals)}`, ht: `Lajan lakay jodi a : ${m(r.ownerWithdrawals)}` })}
            </p>
          )}

          {/* UN conseil, pas une liste (§1). */}
          <p className="rounded-surface border-l-4 border-accent bg-accent-sub px-3 py-2 text-body text-primary">
            <span className="font-bold">{t({ fr: 'Conseil : ', ht: 'Konsèy : ' })}</span>
            {t(view.tip)}
          </p>

          {view.eveningReached && (
            <a
              href={language === 'fr' ? view.whatsapp.fr : view.whatsapp.ht}
              target="_blank"
              rel="noopener noreferrer"
              className="pressable flex min-h-hero items-center justify-center gap-2 rounded-surface bg-primary px-4 text-body font-bold text-white"
            >
              <MessageCircle className="h-5 w-5" aria-hidden />
              {t({ fr: 'Recevoir le bilan sur mon WhatsApp', ht: 'Voye rapò a sou WhatsApp mwen' })}
            </a>
          )}
          {r.unconverted > 0 && (
            <p className="text-note text-amber-700 dark:text-amber-400">
              {t({
                fr: `${r.unconverted} montant(s) en dollars ne sont pas comptés : renseignez le taux du jour.`,
                ht: `${r.unconverted} montan an dola pa konte : mete to jounen an.`,
              })}{' '}
              <Link href="/settings" className="font-bold underline underline-offset-4">{t({ fr: 'Taux du jour', ht: 'To jounen an' })}</Link>
            </p>
          )}
        </section>
      )}

      {!seesFigures && view && (
        <p className="rounded-surface bg-surface px-4 py-3 text-body text-text2 dark:bg-dark-surface2 dark:text-dark-text2">
          {t({
            fr: 'Notez chaque vente : votre patron reçoit le bilan du soir.',
            ht: 'Note chak vant : patwon an resevwa rapò aswè a.',
          })}
        </p>
      )}

      {!view && !failed && <span className="pp-skeleton block h-48 rounded-surface" aria-hidden />}

      {/* La revue du mois avec un conseiller (F24, Elit) : « il a les chiffres,
          mais pas toujours la décision ». Trente minutes, sur WhatsApp. */}
      {isOwner && canUse('monthly_coach') && (
        <a
          href={supportWhatsAppLink(coachRequestMessage(company?.name ?? ''))}
          target="_blank"
          rel="noopener noreferrer"
          className="pressable flex items-center gap-3 rounded-surface border border-border bg-white p-4 dark:border-dark-border dark:bg-dark-surface"
        >
          <MessageCircle className="h-6 w-6 flex-shrink-0 text-primary" aria-hidden />
          <span className="min-w-0">
            <span className="block text-body font-bold text-primary dark:text-dark-text">{t({ fr: 'Votre revue du mois avec un conseiller', ht: 'Revizyon mwa a ak konseye w' })}</span>
            <span className="block text-note text-muted dark:text-dark-muted">{t({ fr: '30 minutes, par WhatsApp ou téléphone. Prendre rendez-vous.', ht: '30 minit, sou WhatsApp oswa nan telefòn. Pran randevou.' })}</span>
          </span>
        </a>
      )}

      {/* Le reste, un tap plus bas : les détails de l'offre. */}
      {details && can('reports:read') && (
        <div>
          <button
            type="button"
            onClick={() => setShowDetails((v) => !v)}
            aria-expanded={showDetails}
            className="pressable flex min-h-touch w-full items-center justify-center gap-2 rounded-surface text-body font-bold text-primary hover:bg-surface dark:text-dark-text"
          >
            {showDetails ? t({ fr: 'Moins de détails', ht: 'Mwens detay' }) : t({ fr: 'Voir plus de détails', ht: 'Wè plis detay' })}
            <ChevronDown className={cn('h-5 w-5 transition-transform', showDetails && 'rotate-180')} aria-hidden />
          </button>
          {showDetails && <div className="mt-4">{details}</div>}
        </div>
      )}
    </div>
  );
}
