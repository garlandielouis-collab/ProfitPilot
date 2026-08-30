'use client';

// ─────────────────────────────────────────────────────────────────────────────
// Les notifications — ce que le commerce a fait pendant qu'on ne regardait pas
//
// Ce que l'écran faisait de travers :
//
//   §3.5  dix émojis (🛍️ ✅ ⚠️ 💸 📦 👤 👷 🎉 🏢 🔔), dont un posé dans une
//         pastille de 40 px en haut de page comme s'il était le logo du produit.
//   §4.2  dix fonds colorés — émeraude, vert, ambre, rouge, bleu, violet,
//         indigo, rose, ardoise — un par type. Une dépense enregistrée
//         s'affichait en ROUGE : le marchand lisait « problème » là où il n'y
//         avait qu'une écriture normale. Le rouge et le vert sont réservés
//         (§4.2) ; il ne reste ici qu'un ambre, pour le stock qui s'épuise, et
//         un vert, pour l'argent réellement encaissé.
//   §5.9  l'interrupteur des préférences faisait 24 px de haut ; il vient
//         désormais du système (`ds/Switch`), avec sa cible de 44 px.
//   §4.4  la page peignait SON PROPRE fond (`min-h-screen bg-slate-50`) à
//         l'intérieur de la coquille qui en pose déjà un — d'où la bande grise
//         qui ne suivait pas le mode sombre.
//
// L'écran garde ses deux temps : ce qui est arrivé, et ce qu'on veut être
// prévenu. Le second n'a de sens qu'après avoir vu le premier — d'où l'ordre.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle, Bell, Building2, CheckCircle2, MailCheck, Package,
  Receipt, ShoppingBag, ShoppingCart, UserCog, Users,
  type LucideIcon,
} from 'lucide-react';

import { ProtectedRoute } from '../../components/ProtectedRoute';
import { useLanguage } from '../../components/LanguageWrapper';
import {
  Card, FilterPill, FirstRun, ScreenHeader, Stack, Switch,
} from '../../components/ds';
import {
  listNotifications,
  markAsRead,
  markAllAsRead,
  getNotifPreferences,
  setNotifPreference,
  type Notification,
  type NotifPreference,
} from '../actions/notifications';

type Bilingual = { fr: string; ht: string };
type Tone = 'neutral' | 'warning' | 'success';

const TYPES: Record<string, { label: Bilingual; icon: LucideIcon; tone: Tone }> = {
  sale_created:        { label: { fr: 'Nouvelle vente',      ht: 'Nouvo vant'        }, icon: ShoppingCart, tone: 'neutral' },
  // De l'argent réellement entré : c'est l'un des deux seuls verts de l'écran.
  invoice_paid:        { label: { fr: 'Facture payée',       ht: 'Fakti peye'        }, icon: CheckCircle2, tone: 'success' },
  // Ce qui demande d'agir avant qu'il ne soit trop tard.
  stock_low:           { label: { fr: 'Stock faible',        ht: 'Stòk ba'           }, icon: AlertTriangle, tone: 'warning' },
  expense_created:     { label: { fr: 'Nouvelle dépense',    ht: 'Nouvo depans'      }, icon: Receipt,      tone: 'neutral' },
  purchase_created:    { label: { fr: 'Nouvel achat',        ht: 'Nouvo acha'        }, icon: ShoppingBag,  tone: 'neutral' },
  client_created:      { label: { fr: 'Nouveau client',      ht: 'Nouvo kliyan'      }, icon: Users,        tone: 'neutral' },
  employee_created:    { label: { fr: 'Nouvel employé',      ht: 'Nouvo anplwaye'    }, icon: UserCog,      tone: 'neutral' },
  invitation_accepted: { label: { fr: 'Invitation acceptée', ht: 'Envitasyon aksepte'}, icon: MailCheck,    tone: 'neutral' },
  company_created:     { label: { fr: 'Nouvelle entreprise', ht: 'Nouvo antrepriz'   }, icon: Building2,    tone: 'neutral' },
  generic:             { label: { fr: 'Notification',        ht: 'Notifikasyon'      }, icon: Bell,         tone: 'neutral' },
};

/** Ce que chaque type prévient — la ligne qui manquait à l'écran de réglages. */
const PREF_HINTS: Record<string, Bilingual> = {
  sale_created:        { fr: 'À chaque vente enregistrée, y compris par un employé.', ht: 'Chak fwa yon vant anrejistre, menm pa yon anplwaye.' },
  invoice_paid:        { fr: "Quand un client règle une facture ou solde sa dette.",  ht: 'Lè yon kliyan peye yon fakti oswa solde dèt li.' },
  stock_low:           { fr: 'Quand un produit passe sous son seuil de réassort.',    ht: 'Lè yon pwodwi desann anba sèy li.' },
  expense_created:     { fr: 'À chaque dépense saisie sur le compte.',                ht: 'Chak depans ki antre nan kont lan.' },
  purchase_created:    { fr: 'À chaque achat auprès d’un fournisseur.',               ht: 'Chak acha kay yon founisè.' },
  client_created:      { fr: 'Quand un client est ajouté au carnet.',                 ht: 'Lè yon kliyan antre nan kanè a.' },
  employee_created:    { fr: 'Quand quelqu’un rejoint l’équipe.',                     ht: 'Lè yon moun antre nan ekip la.' },
  invitation_accepted: { fr: 'Quand une invitation envoyée est acceptée.',            ht: 'Lè yon envitasyon aksepte.' },
  company_created:     { fr: 'Quand une nouvelle entreprise est créée.',              ht: 'Lè yon nouvo antrepriz kreye.' },
  generic:             { fr: 'Les messages qui n’entrent dans aucune autre case.',    ht: 'Mesaj ki pa antre nan okenn lòt kazye.' },
};

const ICON_TONE: Record<Tone, string> = {
  neutral: 'bg-surface2 text-muted dark:bg-dark-surface2 dark:text-dark-muted',
  warning: 'bg-warning-sub text-warning dark:bg-warning/15',
  success: 'bg-success-sub text-success dark:bg-success/15',
};

const LIMIT = 30;

function typeOf(type: string) {
  return TYPES[type] ?? TYPES.generic;
}

// ─────────────────────────────────────────────────────────────────────────────

function NotificationsInner() {
  const { t, language } = useLanguage();

  const [tab,     setTab]     = useState<'feed' | 'preferences'>('feed');
  const [notifs,  setNotifs]  = useState<Notification[]>([]);
  const [prefs,   setPrefs]   = useState<NotifPreference[]>([]);
  const [loading, setLoading] = useState(true);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [offset,  setOffset]  = useState(0);
  const [hasMore, setHasMore] = useState(false);

  const load = useCallback(async (newOffset: number, onlyUnread: boolean) => {
    setLoading(true);
    // On demande un élément de plus que la page : s'il revient, c'est qu'il y a
    // une suite. Un comptage complet coûterait une requête pour rien.
    const data = await listNotifications({ limit: LIMIT + 1, offset: newOffset, unreadOnly: onlyUnread });
    setHasMore(data.length > LIMIT);
    setNotifs(data.slice(0, LIMIT));
    setOffset(newOffset);
    setLoading(false);
  }, []);

  useEffect(() => { load(0, unreadOnly); }, [load, unreadOnly]);

  useEffect(() => {
    if (tab === 'preferences') getNotifPreferences().then(setPrefs).catch(() => {});
  }, [tab]);

  async function handleRead(id: string) {
    setNotifs((prev) => prev.map((n) => (n.id === id ? { ...n, readAt: new Date().toISOString() } : n)));
    try { await markAsRead(id); } catch { /* l'écran a déjà répondu */ }
  }

  async function handleReadAll() {
    setNotifs((prev) => prev.map((n) => ({ ...n, readAt: n.readAt ?? new Date().toISOString() })));
    try { await markAllAsRead(); } catch { /* idem */ }
  }

  async function togglePref(type: string, enabled: boolean) {
    setPrefs((prev) =>
      prev.some((p) => p.type === type)
        ? prev.map((p) => (p.type === type ? { ...p, enabled } : p))
        : [...prev, { type, enabled }],
    );
    try { await setNotifPreference(type, enabled); } catch { /* idem */ }
  }

  const prefEnabled = (type: string) => prefs.find((p) => p.type === type)?.enabled ?? true;
  const unread = notifs.filter((n) => !n.readAt).length;

  return (
    <div className="pp-enter mx-auto w-full max-w-2xl px-4 py-6 sm:px-6">
      <ScreenHeader
        title={t({ fr: 'Notifications', ht: 'Notifikasyon' })}
        subtitle={
          unread > 0
            ? t({
                fr: `${unread} non lue${unread > 1 ? 's' : ''}`,
                ht: `${unread} ou poko li`,
              })
            : t({ fr: 'Tout est lu.', ht: 'Tout li deja.' })
        }
        action={
          tab === 'feed' && unread > 0 ? (
            <button
              type="button"
              onClick={handleReadAll}
              className="pressable min-h-touch flex-shrink-0 text-note font-bold text-primary underline underline-offset-4 dark:text-dark-text"
            >
              {t({ fr: 'Tout marquer lu', ht: 'Make tout kòm li' })}
            </button>
          ) : undefined
        }
      />

      <Stack className="mt-6">
        <div className="scrollbar-none flex gap-2 overflow-x-auto pb-1">
          <FilterPill
            label={t({ fr: 'Ce qui est arrivé', ht: 'Sa ki pase' })}
            selected={tab === 'feed'}
            onClick={() => setTab('feed')}
          />
          <FilterPill
            label={t({ fr: 'Ce que je veux savoir', ht: 'Sa m vle konnen' })}
            selected={tab === 'preferences'}
            onClick={() => setTab('preferences')}
          />
        </div>

        {tab === 'feed' ? (
          <>
            <div className="scrollbar-none flex gap-2 overflow-x-auto pb-1">
              <FilterPill
                label={t({ fr: 'Toutes', ht: 'Tout' })}
                selected={!unreadOnly}
                onClick={() => setUnreadOnly(false)}
              />
              <FilterPill
                label={t({ fr: 'Non lues', ht: 'Poko li' })}
                count={unread > 0 ? unread : undefined}
                selected={unreadOnly}
                onClick={() => setUnreadOnly(true)}
              />
            </div>

            <Card>
              {loading ? (
                <div className="space-y-2 p-4" aria-hidden>
                  {[0, 1, 2, 3].map((i) => (
                    <span key={i} className="pp-skeleton block h-14 rounded-control" />
                  ))}
                </div>
              ) : notifs.length === 0 && unreadOnly ? (
                <p className="px-4 py-10 text-center text-body text-muted dark:text-dark-muted">
                  {t({ fr: 'Rien en attente : tout est lu.', ht: 'Anyen ap tann : tout li deja.' })}
                </p>
              ) : notifs.length === 0 ? (
                <FirstRun
                  title={t({
                    fr: 'Rien à signaler pour le moment',
                    ht: 'Anyen pou siyale pou kounye a',
                  })}
                  hint={t({
                    fr: 'Une vente enregistrée, un stock qui baisse, un client qui paie : ProfitPilot vous préviendra ici.',
                    ht: 'Yon vant anrejistre, yon stòk k ap bese, yon kliyan ki peye : ProfitPilot ap avèti w isit la.',
                  })}
                />
              ) : (
                <ul className="divide-y divide-border dark:divide-dark-border">
                  {notifs.map((n) => {
                    const cfg  = typeOf(n.type);
                    const Icon = cfg.icon;
                    const isUnread = !n.readAt;

                    return (
                      <li key={n.id}>
                        <button
                          type="button"
                          onClick={() => isUnread && handleRead(n.id)}
                          className="pressable flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-surface dark:hover:bg-white/5"
                        >
                          <span
                            className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-surface ${ICON_TONE[cfg.tone]}`}
                          >
                            <Icon className="h-5 w-5" strokeWidth={1.8} aria-hidden />
                          </span>

                          <span className="min-w-0 flex-1">
                            <span className="flex items-baseline justify-between gap-3">
                              {/* Le non-lu se marque par le CONTRASTE — gras et
                                  marine — et non par un fond bleu pâle (§4.5). */}
                              <span
                                className={
                                  isUnread
                                    ? 'min-w-0 truncate text-body font-bold text-primary dark:text-dark-text'
                                    : 'min-w-0 truncate text-body text-text2 dark:text-dark-text2'
                                }
                              >
                                {n.title}
                              </span>
                              <span className="amount flex-shrink-0 text-note text-muted dark:text-dark-muted">
                                {relativeDate(n.createdAt, language)}
                              </span>
                            </span>

                            {n.body && (
                              <span className="mt-0.5 block truncate text-note text-muted dark:text-dark-muted">
                                {n.body}
                              </span>
                            )}
                            <span className="mt-1 block text-note text-muted dark:text-dark-muted">
                              {t(cfg.label)}
                            </span>
                          </span>

                          {isUnread && (
                            <span
                              className="mt-2 h-2 w-2 flex-shrink-0 rounded-pill bg-accent"
                              aria-label={t({ fr: 'Non lue', ht: 'Poko li' })}
                            />
                          )}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}

              {(offset > 0 || hasMore) && (
                <div className="flex items-center justify-between gap-4 border-t border-border px-4 py-2 dark:border-dark-border">
                  <PageButton onClick={() => load(Math.max(0, offset - LIMIT), unreadOnly)} disabled={offset === 0 || loading}>
                    {t({ fr: 'Précédent', ht: 'Anvan' })}
                  </PageButton>
                  <PageButton onClick={() => load(offset + LIMIT, unreadOnly)} disabled={!hasMore || loading}>
                    {t({ fr: 'Suivant', ht: 'Apre' })}
                  </PageButton>
                </div>
              )}
            </Card>
          </>
        ) : (
          <Card className="px-4">
            <p className="border-b border-border py-4 text-note text-muted dark:border-dark-border dark:text-dark-muted">
              {t({
                fr: 'Coupez ce qui ne vous sert pas : une alerte qu’on ignore tous les jours finit par cacher celle qui compte.',
                ht: 'Koupe sa ki pa sèvi w : yon alèt ou inyore chak jou ap fini pa kache sa ki enpòtan an.',
              })}
            </p>

            <ul className="divide-y divide-border dark:divide-dark-border">
              {Object.entries(TYPES).map(([type, cfg]) => {
                const Icon = cfg.icon;
                return (
                  <li key={type} className="py-2">
                    <Switch
                      checked={prefEnabled(type)}
                      onChange={(next) => togglePref(type, next)}
                      label={t(cfg.label)}
                      hint={PREF_HINTS[type] ? t(PREF_HINTS[type]) : undefined}
                      icon={<Icon className="h-5 w-5" strokeWidth={1.8} aria-hidden />}
                    />
                  </li>
                );
              })}
            </ul>
          </Card>
        )}
      </Stack>
    </div>
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

function relativeDate(iso: string, language: 'fr' | 'ht'): string {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60)     return language === 'ht' ? 'kounye a' : "à l'instant";
  if (diff < 3_600)  return `${Math.floor(diff / 60)} min`;
  if (diff < 86_400) {
    const h = Math.floor(diff / 3_600);
    return language === 'ht' ? `${h} è` : `${h} h`;
  }
  if (diff < 604_800) {
    const d = Math.floor(diff / 86_400);
    return language === 'ht' ? `${d} jou` : `${d} j`;
  }
  return new Date(iso).toLocaleDateString(language === 'ht' ? 'fr-HT' : 'fr-FR', {
    day: '2-digit',
    month: 'short',
  });
}

export default function NotificationsPage() {
  return (
    <ProtectedRoute>
      <NotificationsInner />
    </ProtectedRoute>
  );
}
