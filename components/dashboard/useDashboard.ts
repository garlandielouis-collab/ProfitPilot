'use client';

// ─────────────────────────────────────────────────────────────────────────────
// Le chargement du tableau de bord — §49, §50
//
// « Ne pas charger toutes les données simultanément. […] Les widgets
//   secondaires peuvent charger après les KPI principaux. »
//
// Deux lots, deux états de chargement :
//
//   core     part immédiatement. Dès qu'il arrive, l'écran a des chiffres.
//   modules  part APRÈS que le socle soit revenu. Esansyel ne le demande
//            jamais — son écran s'arrête au premier lot (§11).
//
// Un cache de session s'affiche sans attendre le réseau : sur une connexion
// irrégulière, l'écran ne reste jamais blanc. C'est la mécanique que l'ancien
// tableau de bord avait déjà, et elle mérite de survivre à la refonte.
//
// Ce que ce fichier ne fait PAS : inventer. Réseau coupé, réponse vide, offre
// insuffisante — la réponse est `null`, et l'écran affiche un état vide honnête
// plutôt que des chiffres qui ne sont pas ceux du marchand.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  getDashboardCore, getDashboardModules,
  type DashboardCore, type DashboardModules,
} from '../../app/actions/dashboard';
import { bucketOf, resolve, type CompareKey, type RangeKey } from './range';

export type DashboardState = {
  range: RangeKey;
  setRange: (key: RangeKey) => void;
  compare: CompareKey;
  setCompare: (key: CompareKey) => void;
  core: DashboardCore | null;
  modules: DashboardModules | null;
  loadingCore: boolean;
  loadingModules: boolean;
  /** Vrai quand le compte n'a encore aucune vente : l'état « premier jour ». */
  isFirstRun: boolean;
  refresh: () => void;
};

const cacheKey = (range: RangeKey, compare: CompareKey) => `pp_dash_${range}_${compare}`;

export function useDashboard({
  initialRange = 'month',
  initialCompare = 'previous',
  /** Esansyel n'a pas de second lot. */
  withModules = true,
}: {
  initialRange?: RangeKey;
  initialCompare?: CompareKey;
  withModules?: boolean;
} = {}): DashboardState {
  const [range, setRange]     = useState<RangeKey>(initialRange);
  const [compare, setCompare] = useState<CompareKey>(initialCompare);

  const [core, setCore]       = useState<DashboardCore | null>(null);
  const [modules, setModules] = useState<DashboardModules | null>(null);
  const [loadingCore, setLoadingCore]       = useState(true);
  const [loadingModules, setLoadingModules] = useState(withModules);
  const [tick, setTick] = useState(0);

  // La période est recalculée à chaque rendu à partir de l'horloge : un écran
  // laissé ouvert la nuit ne doit pas continuer d'appeler « aujourd'hui » la
  // journée d'hier.
  const resolved = useMemo(
    () => resolve(range, compare),
    // `tick` force la relecture de l'horloge à chaque rafraîchissement manuel.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [range, compare, tick],
  );

  const seq = useRef(0);

  const load = useCallback(async () => {
    const mine = ++seq.current;
    setLoadingCore(true);
    if (withModules) setLoadingModules(true);

    // La période de comparaison est résolue ICI et envoyée telle quelle : le
    // serveur ne doit pas deviner ce que « comparer à » veut dire, sinon le
    // libellé de l'écran et la base du calcul divergent.
    const input = {
      from: resolved.current.from,
      to: resolved.current.to,
      bucket: bucketOf(range),
      baseline: resolved.baseline
        ? { from: resolved.baseline.from, to: resolved.baseline.to }
        : null,
    };

    // ① Le cache de session, s'il existe, avant le réseau.
    try {
      const raw = sessionStorage.getItem(cacheKey(range, compare));
      if (raw) {
        const cached = JSON.parse(raw) as DashboardCore;
        if (cached?.range?.from === input.from) {
          setCore(cached);
          setLoadingCore(false);
        }
      }
    } catch { /* sessionStorage indisponible : on attend simplement le réseau */ }

    // ② Le socle.
    let fresh: DashboardCore | null = null;
    try {
      fresh = await getDashboardCore(input);
    } catch {
      fresh = null;
    }
    if (mine !== seq.current) return;

    setCore(fresh);
    setLoadingCore(false);
    if (fresh) {
      try {
        sessionStorage.setItem(cacheKey(range, compare), JSON.stringify(fresh));
      } catch { /* stockage plein */ }
    }

    // ③ Les modules, seulement après — et seulement s'ils existent.
    if (!withModules || !fresh || fresh.level === 'basic') {
      setModules(null);
      setLoadingModules(false);
      return;
    }

    try {
      const extra = await getDashboardModules(input);
      if (mine !== seq.current) return;
      setModules(extra);
    } catch {
      if (mine === seq.current) setModules(null);
    } finally {
      if (mine === seq.current) setLoadingModules(false);
    }
  }, [range, compare, withModules, resolved]);

  useEffect(() => { void load(); }, [load]);

  return {
    range, setRange,
    compare, setCompare,
    core, modules,
    loadingCore, loadingModules,
    isFirstRun: Boolean(core) && !core!.presence.hasSales,
    refresh: () => setTick((n) => n + 1),
  };
}
