// ─────────────────────────────────────────────────────────────────────────────
// Le score de santé documentaire (§5, §64)
//
// Sur le modèle de `lib/healthScore.ts` : une fonction **pure**, et dont chaque
// facteur est affiché au marchand avec son compte. Un score qu'on ne peut pas
// décomposer est un chiffre qu'on subit ; celui-ci se lit « 28 sur 35 pour la
// complétude, parce qu'il manque deux documents », et se corrige.
//
// ── Zéro n'est pas une note ─────────────────────────────────────────────────
//
// Une entreprise sans aucun document n'obtient pas 0 : elle obtient l'état
// `first_run`. Un zéro serait un chiffre affiché sans être une mesure — ce que
// le §83 et la constitution visuelle §10 interdisent tous les deux. On ne note
// pas quelqu'un qui n'a pas encore commencé.
//
// ── Un facteur sans objet ne pénalise pas ───────────────────────────────────
//
// Un commerce dont aucun document ne porte de date d'expiration n'a pas une
// « validité » à zéro : la question ne se pose pas pour lui. Le facteur rend
// alors tous ses points et le dit — « sans objet ». Compter zéro reviendrait à
// punir l'absence de risque.
// ─────────────────────────────────────────────────────────────────────────────

import type { Bilingual, DocumentCategory } from './types';
import {
  monthsSince, reviewRequirements,
  type HeldDocument, type MissingRequirement, type Requirement,
} from './requirements';

export type HealthState = 'first_run' | 'healthy' | 'needs_attention' | 'critical';

export type HealthFactorKey =
  | 'completeness' | 'validity' | 'freshness' | 'compliance' | 'organisation';

export type HealthFactor = {
  key:    HealthFactorKey;
  label:  Bilingual;
  earned: number;
  max:    number;
  /** Ce qui explique le compte. Jamais un slogan : un décompte. */
  detail: Bilingual;
};

export type HealthScore = {
  state:   HealthState;
  /** `null` en `first_run` : il n'y a rien à mesurer, donc rien à afficher. */
  total:   number | null;
  factors: HealthFactor[];
  missing: MissingRequirement[];
  /** Le score par famille, pour les six pastilles de l'écran de conformité. */
  byCategory: Array<{ category: DocumentCategory; satisfied: number; expected: number }>;
};

/** Les poids du §64. Leur somme fait 100 — vérifié par le test, pas par la foi. */
export const FACTOR_WEIGHTS: Record<HealthFactorKey, number> = {
  completeness: 35,
  validity:     25,
  freshness:    15,
  compliance:   15,
  organisation: 10,
};

export const FACTOR_LABELS: Record<HealthFactorKey, Bilingual> = {
  completeness: { fr: 'Complétude',   ht: 'Konplè' },
  validity:     { fr: 'Validité',     ht: 'Validite' },
  freshness:    { fr: 'Fraîcheur',    ht: 'Frechè' },
  compliance:   { fr: 'Conformité',   ht: 'Konfòmite' },
  organisation: { fr: 'Organisation', ht: 'Òganizasyon' },
};

/** Les deux seuils du §64. `healthy` commence haut : un dossier documentaire
 *  « à peu près en règle » ne l'est pas le jour du contrôle. */
const HEALTHY_AT   = 80;
const ATTENTION_AT = 50;

export type HealthInput = {
  documents:    HeldDocument[];
  requirements: Requirement[];
  today:        string;
};

/** Arrondi au point : un score à la décimale ferait croire à une précision que
 *  cinq facteurs pondérés n'ont pas. */
function points(ratio: number, max: number): number {
  if (!Number.isFinite(ratio)) return max;
  return Math.round(Math.max(0, Math.min(1, ratio)) * max);
}

const NOT_APPLICABLE: Bilingual = {
  fr: 'Sans objet — rien à surveiller ici pour le moment.',
  ht: 'Pa gen sa — pa gen anyen pou siveye la a pou kounye a.',
};

export function documentHealth({ documents, requirements, today }: HealthInput): HealthScore {
  // On ne note pas un classeur vide (§83).
  const usable = documents.filter((d) => d.status !== 'archived');
  if (usable.length === 0) {
    return { state: 'first_run', total: null, factors: [], missing: [], byCategory: [] };
  }

  const { satisfied, missing } = reviewRequirements(requirements, usable, today);
  const expected = satisfied.length + missing.length;

  // ── 1. Complétude — les documents attendus qui sont là ──────────────────
  const completeness = points(expected === 0 ? 1 : satisfied.length / expected,
                              FACTOR_WEIGHTS.completeness);

  // ── 2. Validité — parmi ceux qui ont une date, ceux qui tiennent ────────
  const dated  = usable.filter((d) => d.expiresOn !== null);
  const living = dated.filter((d) => d.expiration !== 'expired');
  const validity = points(dated.length === 0 ? 1 : living.length / dated.length,
                          FACTOR_WEIGHTS.validity);

  // ── 3. Fraîcheur — revus dans leur période de révision ──────────────────
  //
  // Seuls les types dont le référentiel dit tous les combien ils se refont
  // entrent dans le calcul. Un contrat de bail signé il y a quatre ans n'est
  // pas « vieux » : il court toujours.
  const renewalByType = new Map<string, number>();
  for (const requirement of requirements) {
    if (requirement.renewalMonths !== null) {
      renewalByType.set(requirement.typeKey, requirement.renewalMonths);
    }
  }
  const renewable = usable.filter((d) => d.typeKey !== null && renewalByType.has(d.typeKey));
  const fresh = renewable.filter(
    (d) => monthsSince(d.updatedAt, today) <= (renewalByType.get(d.typeKey as string) as number),
  );
  const freshness = points(renewable.length === 0 ? 1 : fresh.length / renewable.length,
                           FACTOR_WEIGHTS.freshness);

  // ── 4. Conformité — la famille `compliance`, présente et valide ─────────
  const complianceExpected  = [...satisfied, ...missing].filter((r) => r.category === 'compliance');
  const complianceSatisfied = satisfied.filter((r) => r.category === 'compliance');
  const compliance = points(
    complianceExpected.length === 0 ? 1 : complianceSatisfied.length / complianceExpected.length,
    FACTOR_WEIGHTS.compliance,
  );

  // ── 5. Organisation — classés, donc retrouvables ────────────────────────
  const classified = usable.filter((d) => d.classified);
  const organisation = points(classified.length / usable.length, FACTOR_WEIGHTS.organisation);

  const factors: HealthFactor[] = [
    {
      key: 'completeness', label: FACTOR_LABELS.completeness,
      earned: completeness, max: FACTOR_WEIGHTS.completeness,
      detail: expected === 0 ? NOT_APPLICABLE : {
        fr: `${satisfied.length} document${satisfied.length > 1 ? 's' : ''} attendu${satisfied.length > 1 ? 's' : ''} sur ${expected} sont là.`,
        ht: `${satisfied.length} sou ${expected} dokiman yo tann yo la.`,
      },
    },
    {
      key: 'validity', label: FACTOR_LABELS.validity,
      earned: validity, max: FACTOR_WEIGHTS.validity,
      detail: dated.length === 0 ? NOT_APPLICABLE : {
        fr: `${living.length} document${living.length > 1 ? 's' : ''} à date sur ${dated.length} qui en portent une.`,
        ht: `${living.length} sou ${dated.length} dokiman ki gen yon dat toujou bon.`,
      },
    },
    {
      key: 'freshness', label: FACTOR_LABELS.freshness,
      earned: freshness, max: FACTOR_WEIGHTS.freshness,
      detail: renewable.length === 0 ? NOT_APPLICABLE : {
        fr: `${fresh.length} sur ${renewable.length} ont été revus dans les délais.`,
        ht: `${fresh.length} sou ${renewable.length} te revize nan bon tan an.`,
      },
    },
    {
      key: 'compliance', label: FACTOR_LABELS.compliance,
      earned: compliance, max: FACTOR_WEIGHTS.compliance,
      detail: complianceExpected.length === 0 ? NOT_APPLICABLE : {
        fr: `${complianceSatisfied.length} sur ${complianceExpected.length} des papiers officiels attendus sont en règle.`,
        ht: `${complianceSatisfied.length} sou ${complianceExpected.length} papye ofisyèl yo tann yo an règ.`,
      },
    },
    {
      key: 'organisation', label: FACTOR_LABELS.organisation,
      earned: organisation, max: FACTOR_WEIGHTS.organisation,
      detail: {
        fr: `${classified.length} document${classified.length > 1 ? 's' : ''} sur ${usable.length} sont classés et rattachés.`,
        ht: `${classified.length} sou ${usable.length} dokiman klase epi tache.`,
      },
    },
  ];

  const total = factors.reduce((sum, f) => sum + f.earned, 0);

  const categories = new Set<DocumentCategory>(
    [...satisfied, ...missing].map((r) => r.category),
  );

  return {
    state: total >= HEALTHY_AT ? 'healthy' : total >= ATTENTION_AT ? 'needs_attention' : 'critical',
    total,
    factors,
    missing,
    byCategory: [...categories].map((category) => ({
      category,
      satisfied: satisfied.filter((r) => r.category === category).length,
      expected:  [...satisfied, ...missing].filter((r) => r.category === category).length,
    })),
  };
}

export const STATE_LABELS: Record<HealthState, Bilingual> = {
  first_run:       { fr: 'À commencer',      ht: 'Pou kòmanse' },
  healthy:         { fr: 'En règle',         ht: 'An règ' },
  needs_attention: { fr: 'À surveiller',     ht: 'Pou siveye' },
  critical:        { fr: 'Critique',         ht: 'Kritik' },
};
