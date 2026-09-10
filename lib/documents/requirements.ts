// ─────────────────────────────────────────────────────────────────────────────
// Ce qui manque, et pourquoi (§51, §52, §64)
//
// Une fonction pure. On lui donne le référentiel et ce que l'entreprise
// possède ; elle rend ce qui manque, avec la raison. Aucune base, aucun accès
// réseau — donc testable, et surtout **relisible** : la règle qui décide qu'un
// document manque est de dix lignes, pas d'une requête SQL de quarante.
//
// ── Trois façons de manquer, et elles ne se disent pas pareil ───────────────
//
//   absent   le document n'existe pas du tout
//   expired  il existe, mais sa date est passée
//   stale    il existe, il n'expire pas, mais il n'a pas bougé depuis plus
//            longtemps que sa période de révision
//
// Le troisième cas est celui qu'on oublie toujours. Une liste de prix de trois
// ans n'est pas « expirée » — aucune date ne le dit — elle est **périmée**, et
// c'est elle qui fait vendre à perte.
// ─────────────────────────────────────────────────────────────────────────────

import type {
  Bilingual, DocumentCategory, DocumentStatus, ExpirationState,
} from './types';

export type Necessity = 'recommended' | 'commonly_required' | 'optional';

export type Requirement = {
  id:            string;
  typeKey:       string;
  typeLabelFr:   string;
  typeLabelHt:   string;
  category:      DocumentCategory;
  necessity:     Necessity;
  rationale:     Bilingual;
  /** §51 : sans elle, `necessity` ne peut pas dépasser `recommended`. La
   *  contrainte est en base ; on la relit ici pour l'afficher. */
  sourceUrl:     string | null;
  renewalMonths: number | null;
};

/** Un document que l'entreprise possède, réduit à ce dont le calcul a besoin. */
export type HeldDocument = {
  id:         string;
  typeKey:    string | null;
  category:   DocumentCategory | null;
  status:     DocumentStatus;
  expiration: ExpirationState;
  expiresOn:  string | null;
  updatedAt:  string;
  /** A un type ET au moins une étiquette ou un rattachement (§64, organisation). */
  classified: boolean;
};

export type MissingReason = 'absent' | 'expired' | 'stale';

export type MissingRequirement = Requirement & {
  reason: MissingReason;
  /** Le document concerné, quand il en existe un (expiré ou périmé). */
  documentId: string | null;
};

export const MISSING_LABELS: Record<MissingReason, Bilingual> = {
  absent:  { fr: 'Absent',  ht: 'Pa la' },
  expired: { fr: 'Expiré',  ht: 'Ekspire' },
  stale:   { fr: 'À revoir', ht: 'Pou revize' },
};

/** Le nombre de mois entiers écoulés. Approximation volontaire : personne ne
 *  révise une liste de prix « au jour près », et compter en jours obligerait à
 *  choisir entre 30 et 31 pour un mois. */
export function monthsSince(iso: string, today: string): number {
  const from = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  const to   = new Date(`${today.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return 0;

  const months = (to.getUTCFullYear() - from.getUTCFullYear()) * 12
               + (to.getUTCMonth() - from.getUTCMonth());
  // Le mois n'est révolu que si le jour du mois est atteint.
  return to.getUTCDate() >= from.getUTCDate() ? months : months - 1;
}

export type RequirementReview = {
  satisfied: Requirement[];
  missing:   MissingRequirement[];
};

/**
 * Le verdict, exigence par exigence.
 *
 * Les documents ARCHIVÉS ou SUPPRIMÉS ne comptent pas : ranger sa patente de
 * l'an dernier ne la rend pas valable. Les brouillons non plus — un contrat
 * qu'on n'a pas fini d'écrire ne protège personne.
 */
export function reviewRequirements(
  requirements: Requirement[],
  held: HeldDocument[],
  today: string,
): RequirementReview {
  const usable = held.filter(
    (d) => d.status !== 'archived' && d.status !== 'draft',
  );

  const satisfied: Requirement[] = [];
  const missing:   MissingRequirement[] = [];

  for (const requirement of requirements) {
    if (requirement.necessity === 'optional') continue;

    const candidates = usable.filter((d) => d.typeKey === requirement.typeKey);

    if (candidates.length === 0) {
      missing.push({ ...requirement, reason: 'absent', documentId: null });
      continue;
    }

    // Un seul exemplaire valable suffit : on garde le meilleur, pas le premier.
    const valid = candidates.find((d) => d.expiration !== 'expired');
    if (!valid) {
      missing.push({ ...requirement, reason: 'expired', documentId: candidates[0].id });
      continue;
    }

    if (requirement.renewalMonths !== null
        && monthsSince(valid.updatedAt, today) > requirement.renewalMonths) {
      missing.push({ ...requirement, reason: 'stale', documentId: valid.id });
      continue;
    }

    satisfied.push(requirement);
  }

  return { satisfied, missing };
}
