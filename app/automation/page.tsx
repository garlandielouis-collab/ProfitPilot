'use client';

// ─────────────────────────────────────────────────────────────────────────────
// L'automatisation — « les rappels qui partent tout seuls »
//
// ── Le vrai défaut de cet écran n'était pas son style ───────────────────────
//
// Il affichait six interrupteurs branchés sur un `useState` local. Aucun n'était
// lu par quoi que ce soit ; deux étaient posés sur « actif » à l'ouverture. Un
// marchand pouvait donc croire, en toute bonne foi, que ses rappels de dettes
// partaient tout seuls — alors que rien ne partait. Rafraîchir la page remettait
// les interrupteurs dans leur position d'origine.
//
// C'est le contrôle bloquant n°2 de l'audit, sous une autre forme : « aucune
// donnée fictive ». Un CONTRÔLE fictif est pire qu'un chiffre fictif — le
// chiffre se vérifie d'un coup d'œil au cahier, la promesse d'un rappel
// automatique ne se découvre fausse que le jour où le client n'a pas payé.
//
// ── Ce qui existe vraiment ──────────────────────────────────────────────────
//
// Trois automatismes tournent pour de bon, sur les tâches planifiées déclarées
// dans `vercel.json` :
//
//   · `/api/cron/daily` (11 h) — relance des créances qui arrivent à échéance
//     ou qui sont dépassées, une par créance et par jour au maximum
//   · le même cron — alerte sur les produits qui passent sous leur seuil
//   · `/api/cron/weekly-digest` (dimanche 23 h) — le résumé de la semaine
//
// Les trois qui restaient (sauvegarde automatique, facture automatique, alerte
// de performance) n'avaient ni table, ni tâche planifiée, ni code : ils sont
// retirés. Un écran d'automatisation ne peut pas être le seul du produit à
// annoncer ce qu'il ne fait pas.
//
// ── Et les interrupteurs, maintenant, commandent ────────────────────────────
//
// Le premier écrit la colonne `payment_due` de `notification_preferences`, que
// `notify()` consulte avant chaque relance. Les deux autres écrivent des
// réglages d'entreprise que les crons lisent déjà — `businesses.low_stock_
// alerts_enabled` et `businesses.weekly_digest_enabled` — et qui tournaient en
// production sans qu'aucun écran ne permette de les éteindre.
//
// Les deux premiers écrivaient `generic` et `stock_low` : des TYPES de
// notification, pas des colonnes. `setNotifPreference` les refusait sans bruit,
// et rien ne s'enregistrait.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useState } from 'react';
import { AlertTriangle, HandCoins, MessageCircle, type LucideIcon } from 'lucide-react';

import { ProtectedRoute } from '../../components/ProtectedRoute';
import { PlanGate, PlanLockScreen } from '../../components/PlanLock';
import { useLanguage } from '../../components/LanguageWrapper';
import { Card, ScreenHeader, Stack, Switch } from '../../components/ds';
import {
  getNotifPreferences,
  setNotifPreference,
  getWeeklyDigestEnabled,
  setWeeklyDigestEnabled,
  getLowStockAlertsEnabled,
  setLowStockAlertsEnabled,
} from '../actions/notifications';

type Bilingual = { fr: string; ht: string };

/**
 * Chaque ligne dit QUAND elle se déclenche. C'est la seule information que le
 * marchand ne peut pas deviner, et c'est celle qui manquait : « rappel
 * automatique » ne dit pas si l'on parle du matin même ou de la fin du mois.
 */
type Automation = {
  id:      string;
  icon:    LucideIcon;
  title:   Bilingual;
  what:    Bilingual;
  when:    Bilingual;
  /** Le réglage sur lequel l'interrupteur écrit réellement. */
  storage:
    | { kind: 'notif_pref'; type: string }
    | { kind: 'low_stock_alerts' }
    | { kind: 'weekly_digest' };
};

const AUTOMATIONS: Automation[] = [
  {
    id:    'receivables',
    icon:  HandCoins,
    title: { fr: 'Relance des créances',  ht: 'Rapèl kredi' },
    what:  {
      fr: 'Un rappel dès qu’une échéance approche, puis tant qu’elle est dépassée — une fois par jour et par client, jamais plus.',
      ht: 'Yon rapèl depi yon dat ap pwoche, epi toutotan li depase — yon fwa pa jou pa kliyan, pa plis.',
    },
    when:  { fr: 'Chaque matin, vers 11 h', ht: 'Chak maten, vè 11 è' },
    // Le cron quotidien envoie ces relances en `generic`, mais les soumet à la
    // colonne `payment_due` : c'est elle qu'on écrit, pas le nom du type.
    storage: { kind: 'notif_pref', type: 'payment_due' },
  },
  {
    id:    'stock',
    icon:  AlertTriangle,
    title: { fr: 'Alerte de stock bas',   ht: 'Alèt stòk ba' },
    what:  {
      fr: 'Un avis quand un produit passe sous son seuil de réassort, avant que la vente ne soit perdue.',
      ht: 'Yon avi lè yon pwodwi desann anba sèy li, anvan ou pèdi vant lan.',
    },
    when:  { fr: 'Chaque matin, vers 11 h', ht: 'Chak maten, vè 11 è' },
    // Réglage d'entreprise, celui que le cron quotidien lit avant de balayer
    // le stock. La préférence personnelle `low_stock` reste sur /notifications.
    storage: { kind: 'low_stock_alerts' },
  },
  {
    id:    'weekly',
    icon:  MessageCircle,
    title: { fr: 'Résumé de la semaine',  ht: 'Rezime semèn nan' },
    what:  {
      fr: 'Ventes, dépenses et créances de la semaine, mis en forme pour WhatsApp et prêts à envoyer en un appui.',
      ht: 'Vant, depans ak kredi semèn nan, byen ranje pou WhatsApp, pare pou voye ak yon sèl tap.',
    },
    when:  { fr: 'Dimanche soir', ht: 'Dimanch swa' },
    storage: { kind: 'weekly_digest' },
  },
];

// ─────────────────────────────────────────────────────────────────────────────

function AutomationInner() {
  const { t } = useLanguage();

  const [states,  setStates]  = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;

    Promise.all([getNotifPreferences(), getWeeklyDigestEnabled(), getLowStockAlertsEnabled()])
      .then(([prefs, digest, lowStock]) => {
        if (!alive) return;
        const next: Record<string, boolean> = {};
        for (const a of AUTOMATIONS) {
          next[a.id] =
            a.storage.kind === 'weekly_digest'
              ? digest
              : a.storage.kind === 'low_stock_alerts'
                ? lowStock
                // Pas de préférence enregistrée = actif : c'est exactement la
                // règle qu'applique `notify()`. Deux réponses différentes à la
                // même question, et l'écran mentirait sur l'état réel.
                : prefs.find((p) => p.type === (a.storage as { type: string }).type)?.enabled ?? true;
        }
        setStates(next);
      })
      .catch(() => {})
      .finally(() => { if (alive) setLoading(false); });

    return () => { alive = false; };
  }, []);

  async function toggle(auto: Automation, next: boolean) {
    // L'écran répond au doigt tout de suite ; l'écriture suit (§3.7).
    setStates((s) => ({ ...s, [auto.id]: next }));
    try {
      if (auto.storage.kind === 'weekly_digest') await setWeeklyDigestEnabled(next);
      else if (auto.storage.kind === 'low_stock_alerts') await setLowStockAlertsEnabled(next);
      else await setNotifPreference(auto.storage.type, next);
    } catch {
      // Refusée (droits, réseau) : l'interrupteur revient où il était, sinon
      // l'écran affirmerait un réglage que la base n'a pas.
      setStates((s) => ({ ...s, [auto.id]: !next }));
    }
  }

  const active = AUTOMATIONS.filter((a) => states[a.id]).length;

  return (
    <div className="pp-enter mx-auto w-full max-w-2xl px-4 py-6 sm:px-6">
      <ScreenHeader
        title={t({ fr: 'Automatisation', ht: 'Otomatizasyon' })}
        subtitle={
          loading
            ? t({ fr: 'Lecture de vos réglages…', ht: 'Ap li reglaj ou yo…' })
            : t({
                fr: `${active} sur ${AUTOMATIONS.length} en marche`,
                ht: `${active} sou ${AUTOMATIONS.length} k ap mache`,
              })
        }
      />

      <Stack className="mt-6">
        <PlanGate feature="automation" fallback={<PlanLockScreen feature="automation" />}>
          <Card className="px-4">
            <p className="border-b border-border py-4 text-note text-muted dark:border-dark-border dark:text-dark-muted">
              {t({
                fr: 'Ces trois tâches partent seules, même application fermée. Rien d’autre ne s’exécute en votre nom.',
                ht: 'Twa travay sa yo pati poukont yo, menm lè app la fèmen. Anyen lòt pa fèt nan non w.',
              })}
            </p>

            <ul className="divide-y divide-border dark:divide-dark-border">
              {AUTOMATIONS.map((auto) => {
                const Icon = auto.icon;
                return (
                  <li key={auto.id} className="py-3">
                    <Switch
                      checked={states[auto.id] ?? true}
                      disabled={loading}
                      onChange={(next) => toggle(auto, next)}
                      label={t(auto.title)}
                      hint={t(auto.what)}
                      icon={<Icon className="h-5 w-5" strokeWidth={1.8} aria-hidden />}
                    />
                    {/* L'heure de passage, alignée sous le libellé : c'est ce
                        que le marchand vient vérifier. */}
                    <p className="ml-8 mt-1 text-note font-bold text-muted dark:text-dark-muted">
                      {t(auto.when)}
                    </p>
                  </li>
                );
              })}
            </ul>
          </Card>
        </PlanGate>
      </Stack>
    </div>
  );
}

export default function AutomationPage() {
  return (
    <ProtectedRoute>
      <AutomationInner />
    </ProtectedRoute>
  );
}
