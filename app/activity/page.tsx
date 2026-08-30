'use client';

// ─────────────────────────────────────────────────────────────────────────────
// Le journal d'activité — « qui a modifié quoi, et quand »
//
// Cet écran était le contre-exemple de l'audit à lui seul :
//
//   §3.5  quatorze ÉMOJIS en guise de jeu d'icônes (🧾 📦 👤 💸 🛒 🚚 👷 …).
//         Un émoji n'est pas une icône : il est dessiné par le téléphone, pas
//         par nous — le 👷 d'un Android d'entrée de gamme n'est pas celui d'un
//         iPhone —, il ne prend pas la couleur du texte, il ne s'aligne pas sur
//         une épaisseur de trait, et il fait passer un logiciel de comptabilité
//         pour une messagerie.
//   §4.2  DIX couleurs de badges (émeraude, bleu, rouge, ambre, sarcelle,
//         violet, indigo, violet clair…). Quand tout est coloré, plus rien
//         n'alerte. Ici : vert pour ce qui crée, rouge pour ce qui supprime,
//         ambre pour ce qui archive, gris pour le reste.
//   §5.3  un tableau de sept colonnes sur un écran de téléphone : il défilait
//         dans les deux directions. Mobile : des lignes. Bureau : le tableau.
//   §5.10 « Aucun événement trouvé » sans issue, avec un émoji 📋 en 28 px.
//   §4.3  aucun mode sombre — `text-slate-700` en dur sur toute la page.
//
// Et il ne parlait que français, sur un produit dont l'écran d'accueil est
// bilingue. « Switché », « Reset » : de l'anglais dans un journal destiné au
// patron d'un commerce à Port-au-Prince.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useMemo, useState, useTransition } from 'react';
import {
  Building2, ClipboardList, CreditCard, FileText, HandCoins, Mail, Package,
  Receipt, ShieldCheck, ShoppingBag, Store, Truck, UserCog, Users, Wallet,
  type LucideIcon,
} from 'lucide-react';

import { ProtectedRoute } from '../../components/ProtectedRoute';
import { useLanguage } from '../../components/LanguageWrapper';
import {
  Badge, BottomSheet, Card, Field, FirstRun, NoResult, ScreenHeader, SelectField, Stack,
  type BadgeTone,
} from '../../components/ds';
import { listActivityLogs, type ActivityLog } from '../../lib/activityLog';

type Bilingual = { fr: string; ht: string };

// ─────────────────────────────────────────────────────────────────────────────
// Le vocabulaire du journal
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Le ton dit la NATURE de l'événement, pas son type. Trois tons suffisent :
 * ce qui fait exister (vert), ce qui fait disparaître (rouge), ce qui met de
 * côté (ambre). Tout le reste est une modification ordinaire — gris.
 */
const ACTIONS: Record<string, { label: Bilingual; tone: BadgeTone }> = {
  create:    { label: { fr: 'Créé',      ht: 'Kreye'    }, tone: 'success' },
  update:    { label: { fr: 'Modifié',   ht: 'Chanje'   }, tone: 'neutral' },
  delete:    { label: { fr: 'Supprimé',  ht: 'Efase'    }, tone: 'danger'  },
  archive:   { label: { fr: 'Archivé',   ht: 'Achive'   }, tone: 'warning' },
  restore:   { label: { fr: 'Restauré',  ht: 'Remete'   }, tone: 'neutral' },
  duplicate: { label: { fr: 'Dupliqué',  ht: 'Kopye'    }, tone: 'neutral' },
  // « Switché » n'est pas un mot. Le marchand a changé de boutique.
  switch:    { label: { fr: 'Changé',    ht: 'Chanje'   }, tone: 'neutral' },
  pay:       { label: { fr: 'Payé',      ht: 'Peye'     }, tone: 'success' },
  confirm:   { label: { fr: 'Confirmé',  ht: 'Konfime'  }, tone: 'success' },
  invite:    { label: { fr: 'Invité',    ht: 'Envite'   }, tone: 'neutral' },
};

/** Une icône de contour, une épaisseur, une couleur héritée du texte (§3.5). */
const ENTITIES: Record<string, { label: Bilingual; icon: LucideIcon }> = {
  sale:       { label: { fr: 'Vente',       ht: 'Vant'      }, icon: Receipt },
  product:    { label: { fr: 'Produit',     ht: 'Pwodwi'    }, icon: Package },
  client:     { label: { fr: 'Client',      ht: 'Kliyan'    }, icon: Users },
  expense:    { label: { fr: 'Dépense',     ht: 'Depans'    }, icon: Wallet },
  purchase:   { label: { fr: 'Achat',       ht: 'Acha'      }, icon: ShoppingBag },
  supplier:   { label: { fr: 'Fournisseur', ht: 'Founisè'   }, icon: Truck },
  employee:   { label: { fr: 'Employé',     ht: 'Anplwaye'  }, icon: UserCog },
  company:    { label: { fr: 'Entreprise',  ht: 'Antrepriz' }, icon: Building2 },
  store:      { label: { fr: 'Boutique',    ht: 'Boutik'    }, icon: Store },
  order:      { label: { fr: 'Commande',    ht: 'Kòmann'    }, icon: ClipboardList },
  role:       { label: { fr: 'Rôle',        ht: 'Wòl'       }, icon: ShieldCheck },
  invitation: { label: { fr: 'Invitation',  ht: 'Envitasyon'}, icon: Mail },
  payment:    { label: { fr: 'Paiement',    ht: 'Peman'     }, icon: CreditCard },
  debt:       { label: { fr: 'Dette',       ht: 'Dèt'       }, icon: HandCoins },
};

const PAGE_SIZE = 30;

// ─────────────────────────────────────────────────────────────────────────────

function ActivityInner() {
  const { t, language } = useLanguage();

  const [logs,     setLogs]     = useState<ActivityLog[]>([]);
  const [total,    setTotal]    = useState(0);
  const [loading,  setLoading]  = useState(true);
  const [selected, setSelected] = useState<ActivityLog | null>(null);
  const [offset,   setOffset]   = useState(0);

  const [search,   setSearch]   = useState('');
  const [action,   setAction]   = useState('');
  const [entity,   setEntity]   = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo,   setDateTo]   = useState('');

  const [, startPending] = useTransition();

  const load = useCallback(
    (off: number, s: string, a: string, e: string, df: string, dt: string) => {
      setLoading(true);
      startPending(async () => {
        const { logs: data, total: count } = await listActivityLogs({
          search:   s  || undefined,
          action:   a  || undefined,
          entity:   e  || undefined,
          dateFrom: df || undefined,
          dateTo:   dt || undefined,
          limit:    PAGE_SIZE,
          offset:   off,
        });
        setLogs(data);
        setTotal(count);
        setOffset(off);
        setLoading(false);
      });
    },
    [],
  );

  // La recherche part toute seule après une pause de frappe : sur cet écran, il
  // n'y a rien à valider — un bouton « Filtrer » n'était qu'un geste de plus.
  useEffect(() => {
    const id = setTimeout(() => load(0, search, action, entity, dateFrom, dateTo), 300);
    return () => clearTimeout(id);
  }, [load, search, action, entity, dateFrom, dateTo]);

  const filtering = Boolean(search || action || entity || dateFrom || dateTo);
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const current   = Math.floor(offset / PAGE_SIZE) + 1;

  const actionOptions = useMemo(
    () => Object.entries(ACTIONS).map(([value, cfg]) => ({ value, label: t(cfg.label) })),
    [t],
  );
  const entityOptions = useMemo(
    () => Object.entries(ENTITIES).map(([value, cfg]) => ({ value, label: t(cfg.label) })),
    [t],
  );

  function clearFilters() {
    setSearch(''); setAction(''); setEntity(''); setDateFrom(''); setDateTo('');
  }

  return (
    <div className="pp-enter mx-auto w-full max-w-5xl px-4 py-6 sm:px-6">
      <ScreenHeader
        title={t({ fr: "Journal d'activité", ht: 'Jounal aktivite' })}
        subtitle={
          loading
            ? t({ fr: 'Lecture du journal…', ht: 'Ap li jounal la…' })
            : t({
                fr: `${total.toLocaleString('fr-FR')} événement${total > 1 ? 's' : ''} enregistré${total > 1 ? 's' : ''}`,
                ht: `${total.toLocaleString('fr-FR')} evènman anrejistre`,
              })
        }
      />

      <Stack className="mt-6">
        {/* Les filtres au contact de la liste qu'ils affectent (§6.2). */}
        <Card className="space-y-3 p-4">
          <Field
            label={t({ fr: 'Rechercher', ht: 'Chèche' })}
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t({ fr: 'Un nom, une référence…', ht: 'Yon non, yon referans…' })}
          />

          <div className="grid gap-3 sm:grid-cols-2">
            <SelectField
              label={t({ fr: 'Action', ht: 'Aksyon' })}
              value={action}
              onChange={(e) => setAction(e.target.value)}
              placeholder={t({ fr: 'Toutes', ht: 'Tout' })}
              options={actionOptions}
            />
            <SelectField
              label={t({ fr: 'Élément', ht: 'Eleman' })}
              value={entity}
              onChange={(e) => setEntity(e.target.value)}
              placeholder={t({ fr: 'Tous', ht: 'Tout' })}
              options={entityOptions}
            />
            <Field
              label={t({ fr: 'Du', ht: 'Depi' })}
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
            />
            <Field
              label={t({ fr: 'Au', ht: 'Jiska' })}
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
            />
          </div>

          {filtering && (
            <button
              type="button"
              onClick={clearFilters}
              className="pressable min-h-touch text-note font-bold text-primary underline underline-offset-4 dark:text-dark-text"
            >
              {t({ fr: 'Tout afficher', ht: 'Montre tout' })}
            </button>
          )}
        </Card>

        <Card>
          {loading ? (
            <div className="space-y-2 p-4" aria-hidden>
              {[0, 1, 2, 3, 4].map((i) => (
                <span key={i} className="pp-skeleton block h-12 rounded-control" />
              ))}
            </div>
          ) : logs.length === 0 && search ? (
            <NoResult
              query={search}
              noun={t({ fr: 'événement', ht: 'evènman' })}
              onClear={() => setSearch('')}
            />
          ) : logs.length === 0 && filtering ? (
            <p className="px-4 py-10 text-center text-body text-muted dark:text-dark-muted">
              {t({
                fr: 'Aucun événement sur cette période.',
                ht: 'Pa gen evènman pou peryòd sa a.',
              })}
            </p>
          ) : logs.length === 0 ? (
            <FirstRun
              title={t({
                fr: "Le journal se remplira tout seul",
                ht: 'Jounal la ap plen poukont li',
              })}
              hint={t({
                fr: 'Chaque vente, chaque dépense, chaque modification y laissera une trace datée — avec le nom de la personne qui l’a faite.',
                ht: 'Chak vant, chak depans, chak chanjman ap kite yon tras ak dat — ak non moun ki fè l la.',
              })}
            />
          ) : (
            <>
              {/* Mobile : des lignes. Une seule direction de défilement (§5.3). */}
              <ul className="divide-y divide-border md:hidden dark:divide-dark-border">
                {logs.map((log) => (
                  <li key={log.id}>
                    <button
                      type="button"
                      onClick={() => setSelected(log)}
                      className="pressable flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-surface dark:hover:bg-white/5"
                    >
                      <EntityIcon entity={log.entity} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-body text-primary dark:text-dark-text">
                          {t(ENTITIES[log.entity]?.label ?? { fr: log.entity, ht: log.entity })}
                        </span>
                        <span className="block truncate text-note text-muted dark:text-dark-muted">
                          {relativeDate(log.createdAt, language)} · {who(log)}
                        </span>
                      </span>
                      <ActionBadge action={log.action} />
                    </button>
                  </li>
                ))}
              </ul>

              {/* Bureau : le tableau, là où l'espace le permet. */}
              <table className="hidden w-full text-left md:table">
                <thead>
                  <tr className="border-b border-border dark:border-dark-border">
                    <Th>{t({ fr: 'Quand', ht: 'Ki lè' })}</Th>
                    <Th>{t({ fr: 'Qui', ht: 'Kiyès' })}</Th>
                    <Th>{t({ fr: 'Action', ht: 'Aksyon' })}</Th>
                    <Th>{t({ fr: 'Élément', ht: 'Eleman' })}</Th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((log) => (
                    <tr
                      key={log.id}
                      onClick={() => setSelected(log)}
                      className="cursor-pointer border-b border-border last:border-0 hover:bg-surface dark:border-dark-border dark:hover:bg-white/5"
                    >
                      <td className="amount whitespace-nowrap px-4 py-3 text-note text-muted dark:text-dark-muted">
                        {relativeDate(log.createdAt, language)}
                      </td>
                      <td className="max-w-[220px] truncate px-4 py-3 text-body text-text2 dark:text-dark-text2">
                        {who(log)}
                      </td>
                      <td className="px-4 py-3"><ActionBadge action={log.action} /></td>
                      <td className="px-4 py-3">
                        <span className="flex items-center gap-2 text-body text-primary dark:text-dark-text">
                          <EntityIcon entity={log.entity} />
                          {t(ENTITIES[log.entity]?.label ?? { fr: log.entity, ht: log.entity })}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {pageCount > 1 && (
                <div className="flex items-center justify-between gap-4 border-t border-border px-4 py-2 dark:border-dark-border">
                  <span className="amount text-note text-muted dark:text-dark-muted">
                    {offset + 1}–{Math.min(offset + PAGE_SIZE, total)} / {total}
                  </span>
                  <div className="flex gap-1">
                    <PageButton
                      onClick={() => load(offset - PAGE_SIZE, search, action, entity, dateFrom, dateTo)}
                      disabled={current === 1}
                    >
                      {t({ fr: 'Précédent', ht: 'Anvan' })}
                    </PageButton>
                    <PageButton
                      onClick={() => load(offset + PAGE_SIZE, search, action, entity, dateFrom, dateTo)}
                      disabled={current >= pageCount}
                    >
                      {t({ fr: 'Suivant', ht: 'Apre' })}
                    </PageButton>
                  </div>
                </div>
              )}
            </>
          )}
        </Card>
      </Stack>

      {/* Le détail monte PAR-DESSUS l'écran, comme partout ailleurs (§5.7) —
          au lieu d'une boîte de dialogue centrée que ce seul écran dessinait. */}
      <LogSheet log={selected} onClose={() => setSelected(null)} />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Le détail d'un événement
// ─────────────────────────────────────────────────────────────────────────────

function LogSheet({ log, onClose }: { log: ActivityLog | null; onClose: () => void }) {
  const { t, language } = useLanguage();

  return (
    <BottomSheet
      open={log !== null}
      onClose={onClose}
      title={t({ fr: "L'événement en détail", ht: 'Evènman an an detay' })}
    >
      {log && (
        <div className="space-y-5">
          <div className="flex items-center gap-3">
            <EntityIcon entity={log.entity} />
            <p className="min-w-0 flex-1 truncate text-card font-bold text-primary dark:text-dark-text">
              {t(ENTITIES[log.entity]?.label ?? { fr: log.entity, ht: log.entity })}
            </p>
            <ActionBadge action={log.action} />
          </div>

          <dl className="space-y-3">
            <Row label={t({ fr: 'Qui', ht: 'Kiyès' })} value={who(log)} />
            <Row
              label={t({ fr: 'Quand', ht: 'Ki lè' })}
              value={new Date(log.createdAt).toLocaleString(language === 'ht' ? 'fr-HT' : 'fr-FR')}
            />
            {log.entityId && (
              <Row label={t({ fr: 'Référence', ht: 'Referans' })} value={log.entityId} mono />
            )}
            {/* L'adresse IP et l'appareil ne servent qu'à une chose : reconnaître
                une connexion qui n'est pas la sienne. Ils restent, en dernier. */}
            {log.ip && <Row label={t({ fr: 'Adresse IP', ht: 'Adrès IP' })} value={log.ip} mono />}
            {log.userAgent && (
              <Row label={t({ fr: 'Appareil', ht: 'Aparèy' })} value={log.userAgent} />
            )}
          </dl>

          {(log.oldValues || log.newValues) && (
            <div className="space-y-3">
              <p className="text-note font-bold uppercase tracking-wide text-muted dark:text-dark-muted">
                {t({ fr: 'Ce qui a changé', ht: 'Sa ki chanje' })}
              </p>
              <Changes before={log.oldValues} after={log.newValues} />
            </div>
          )}
        </div>
      )}
    </BottomSheet>
  );
}

/**
 * Le détail affichait deux blocs de JSON brut — « avant » et « après » —, à un
 * marchand qui n'a aucune raison de savoir ce qu'est une accolade. La même
 * information se lit ici en une ligne par champ modifié : ce qui a changé,
 * d'où, vers quoi.
 */
function Changes({ before, after }: { before: any; after: any }) {
  const { t } = useLanguage();

  const keys = Array.from(
    new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})]),
  ).filter((k) => stringify(before?.[k]) !== stringify(after?.[k]));

  if (keys.length === 0) {
    return (
      <p className="text-body text-muted dark:text-dark-muted">
        {t({ fr: 'Aucune valeur modifiée.', ht: 'Pa gen valè ki chanje.' })}
      </p>
    );
  }

  return (
    <ul className="divide-y divide-border rounded-surface border border-border dark:divide-dark-border dark:border-dark-border">
      {keys.map((key) => (
        <li key={key} className="px-4 py-3">
          <p className="text-note font-bold text-primary dark:text-dark-text">{fieldLabel(key)}</p>
          <p className="mt-1 text-body text-text2 dark:text-dark-text2">
            {before?.[key] !== undefined && (
              <span className="text-muted line-through dark:text-dark-muted">
                {stringify(before[key])}
              </span>
            )}
            {before?.[key] !== undefined && after?.[key] !== undefined && ' → '}
            {after?.[key] !== undefined && <span>{stringify(after[key])}</span>}
          </p>
        </li>
      ))}
    </ul>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="flex-shrink-0 text-note text-muted dark:text-dark-muted">{label}</dt>
      <dd
        className={`min-w-0 break-all text-right text-body text-text2 dark:text-dark-text2 ${mono ? 'amount' : ''}`}
      >
        {value}
      </dd>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Pièces communes
// ─────────────────────────────────────────────────────────────────────────────

function EntityIcon({ entity }: { entity: string }) {
  const Icon = ENTITIES[entity]?.icon ?? FileText;
  return <Icon className="h-5 w-5 flex-shrink-0 text-muted dark:text-dark-muted" strokeWidth={1.8} aria-hidden />;
}

function ActionBadge({ action }: { action: string }) {
  const { t } = useLanguage();
  const cfg = ACTIONS[action];
  return (
    <Badge tone={cfg?.tone ?? 'neutral'}>
      {cfg ? t(cfg.label) : action}
    </Badge>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="px-4 py-2 text-note font-bold uppercase tracking-wide text-muted dark:text-dark-muted">
      {children}
    </th>
  );
}

function PageButton({
  children, onClick, disabled,
}: { children: React.ReactNode; onClick: () => void; disabled: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="pressable min-h-touch rounded-control px-4 text-note font-bold text-primary disabled:opacity-45 dark:text-dark-text"
    >
      {children}
    </button>
  );
}

/** Le nom de la personne, jamais un identifiant technique à rallonge. */
function who(log: ActivityLog): string {
  return log.userEmail ?? `${log.userId.slice(0, 8)}…`;
}

function relativeDate(iso: string, language: 'fr' | 'ht'): string {
  const diff = Date.now() - new Date(iso).getTime();
  const locale = language === 'ht' ? 'fr-HT' : 'fr-FR';

  if (diff < 60_000)    return language === 'ht' ? 'kounye a' : "à l'instant";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} min`;
  if (diff < 86_400_000) {
    const h = Math.floor(diff / 3_600_000);
    return language === 'ht' ? `${h} è` : `${h} h`;
  }
  return new Date(iso).toLocaleDateString(locale, { day: '2-digit', month: 'short' });
}

function stringify(value: unknown): string {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

/** `sale_price` → « Sale price » : lisible, sans table de traduction à tenir. */
function fieldLabel(key: string): string {
  const words = key.replace(/_/g, ' ').trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export default function ActivityPage() {
  return (
    <ProtectedRoute>
      <ActivityInner />
    </ProtectedRoute>
  );
}
