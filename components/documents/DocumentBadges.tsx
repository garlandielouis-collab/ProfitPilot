'use client';

// ─────────────────────────────────────────────────────────────────────────────
// Les pastilles du centre documentaire
//
// Deux badges, et pas un de plus. Le §9 liste sept statuts et le §34 quatre
// états d'expiration — les afficher tous les deux systématiquement remplirait
// chaque ligne de la bibliothèque de deux pastilles qui, la plupart du temps,
// disent la même chose (« Actif » + « Valide »).
//
// La règle retenue : **l'expiration parle quand elle a quelque chose à dire.**
// Un document sans date n'affiche rien ; un document valable pour six mois non
// plus. « Expire dans 12 jours » et « Expiré depuis 3 jours » s'affichent, eux,
// parce que ce sont les deux seuls moments où le marchand doit agir.
// ─────────────────────────────────────────────────────────────────────────────

import { useLanguage } from '../LanguageWrapper';
import { Badge, type BadgeTone } from '../ds';
import {
  STATUS_LABELS, STATUS_TONE, VISIBILITY_LABELS,
  type DocumentStatus, type DocumentVisibility, type ExpirationState,
} from '../../lib/documents/types';

/** `STATUS_TONE` parle en « positive » ; le design system, en « success ». */
const TONE: Record<'neutral' | 'positive' | 'warning' | 'danger', BadgeTone> = {
  neutral:  'neutral',
  positive: 'success',
  warning:  'warning',
  danger:   'danger',
};

export function StatusBadge({ status }: { status: DocumentStatus }) {
  const { t } = useLanguage();
  return <Badge tone={TONE[STATUS_TONE[status]]}>{t(STATUS_LABELS[status])}</Badge>;
}

/**
 * L'échéance, en clair.
 *
 * Le nombre de jours plutôt que la date : « expire dans 6 jours » se comprend
 * sans calcul, « expire le 14/12 » demande de savoir quel jour on est. La date
 * exacte reste sur la fiche du document, là où on la vérifie.
 */
export function ExpirationBadge({
  expiration,
  daysLeft,
}: {
  expiration: ExpirationState;
  daysLeft: number | null;
}) {
  const { t } = useLanguage();

  if (expiration === 'none' || expiration === 'valid' || daysLeft === null) return null;

  if (expiration === 'expired') {
    const days = Math.abs(daysLeft);
    return (
      <Badge tone="danger">
        {days === 0
          ? t({ fr: "Expire aujourd'hui", ht: 'Ekspire jodi a' })
          : t({
              fr: `Expiré depuis ${days} j`,
              ht: `Ekspire depi ${days} jou`,
            })}
      </Badge>
    );
  }

  return (
    <Badge tone="warning">
      {daysLeft === 0
        ? t({ fr: "Expire aujourd'hui", ht: 'Ekspire jodi a' })
        : t({
            fr: `Expire dans ${daysLeft} j`,
            ht: `Ekspire nan ${daysLeft} jou`,
          })}
    </Badge>
  );
}

/** La visibilité ne s'affiche que lorsqu'elle RESTREINT — sinon c'est du bruit. */
export function VisibilityBadge({ visibility }: { visibility: DocumentVisibility }) {
  const { t } = useLanguage();
  if (visibility === 'company') return null;
  return <Badge tone="info">{t(VISIBILITY_LABELS[visibility])}</Badge>;
}
