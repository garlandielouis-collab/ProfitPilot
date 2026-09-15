'use client';

// ─────────────────────────────────────────────────────────────────────────────
// La sécurité — « qui s'est connecté à mon compte, et avec quoi »
//
// Ce que l'écran faisait de travers :
//
//   §3.5  douze émojis, dont un 🦊 pour Firefox et un 🧭 pour Safari. Le nom du
//         navigateur est écrit juste à côté : l'émoji ne dit rien de plus, il
//         encombre. Les seules icônes qui informent ici sont celles du TYPE
//         d'appareil — téléphone, tablette, ordinateur —, parce qu'elles se
//         lisent d'un coup d'œil dans une liste. Elles restent, en lucide.
//   §4.2  du rouge partout : bouton « Révoquer » rouge, encadré rouge, étiquette
//         rouge. Or déconnecter un appareil n'est pas une erreur, c'est une mise
//         en ordre — et un écran de sécurité entièrement rouge finit par ne plus
//         alarmer personne le jour où il y a vraiment quelque chose à voir.
//   §4.4  la page peignait son propre fond gris à l'intérieur de la coquille.
//   §1.1  ses propres bandeaux de confirmation, alors que l'application a un
//         système de messages (`sonner`) monté dans les fournisseurs.
//
// Et « Si vous reconnaissez pas une connexion » : la faute était en production,
// sur l'écran qui demande le plus de confiance de tout le produit.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useState } from 'react';
import { Monitor, Smartphone, ShieldCheck, Tablet, type LucideIcon } from 'lucide-react';
import { toast } from 'sonner';

import { ProtectedRoute } from '../../components/ProtectedRoute';
import { useLanguage } from '../../components/LanguageWrapper';
import { supabase } from '../../lib/supabaseClient';
import { Badge, Button, Card, Field, ScreenHeader, Section, Stack } from '../../components/ds';
import {
  listLoginSessions,
  revokeSession,
  getSecuritySettings,
  type LoginSession,
  type SecuritySettings,
} from '../actions/security';
import { screenMessage } from '../../lib/actionResult';

const LIMIT = 15;

const DEVICE_ICON: Record<string, LucideIcon> = {
  mobile:  Smartphone,
  tablet:  Tablet,
  desktop: Monitor,
};

// ─────────────────────────────────────────────────────────────────────────────
// La double vérification
// ─────────────────────────────────────────────────────────────────────────────

function TwoFactor({ settings, onChange }: { settings: SecuritySettings; onChange: () => void }) {
  const { t } = useLanguage();

  const [busy,      setBusy]      = useState(false);
  const [enroll,    setEnroll]    = useState<{ factorId: string; qrCode: string; secret: string } | null>(null);
  const [challenge, setChallenge] = useState<string | null>(null);
  const [code,      setCode]      = useState('');
  const [error,     setError]     = useState('');

  async function start() {
    setBusy(true);
    setError('');
    try {
      const { data, error: enrollError } = await supabase.auth.mfa.enroll({ factorType: 'totp' });
      if (enrollError || !data) throw new Error(enrollError?.message);

      setEnroll({ factorId: data.id, qrCode: data.totp.qr_code, secret: data.totp.secret });

      const { data: ch, error: chError } = await supabase.auth.mfa.challenge({ factorId: data.id });
      if (chError || !ch) throw new Error(chError?.message);
      setChallenge(ch.id);
    } catch (e: any) {
      setError(screenMessage(e, t({ fr: 'Impossible de démarrer.', ht: 'Nou pa ka kòmanse.' })));
    }
    setBusy(false);
  }

  async function verify() {
    if (!enroll || !challenge) return;
    setBusy(true);
    setError('');
    try {
      const { error: verifyError } = await supabase.auth.mfa.verify({
        factorId:    enroll.factorId,
        challengeId: challenge,
        code:        code.replace(/\s/g, ''),
      });
      if (verifyError) throw new Error(verifyError.message);

      toast.success(t({ fr: 'Double vérification activée.', ht: 'Doub verifikasyon aktive.' }));
      setEnroll(null); setChallenge(null); setCode('');
      onChange();
    } catch (e: any) {
      setError(screenMessage(e, t({ fr: 'Code refusé.', ht: 'Kòd la refize.' })));
    }
    setBusy(false);
  }

  async function disable() {
    if (!settings.factorId) return;
    setBusy(true);
    try {
      const { error: offError } = await supabase.auth.mfa.unenroll({ factorId: settings.factorId });
      if (offError) throw new Error(offError.message);
      toast.success(t({ fr: 'Double vérification retirée.', ht: 'Doub verifikasyon retire.' }));
      onChange();
    } catch (e: any) {
      toast.error(screenMessage(e, t({ fr: 'Action impossible.', ht: 'Aksyon an pa posib.' })));
    }
    setBusy(false);
  }

  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-card font-bold text-primary dark:text-dark-text">
            {t({ fr: 'Double vérification', ht: 'Doub verifikasyon' })}
          </h2>
          <p className="mt-1 text-note text-muted dark:text-dark-muted">
            {t({
              fr: 'Un code à six chiffres, en plus du mot de passe, à chaque connexion.',
              ht: 'Yon kòd sis chif, anplis modpas la, chak fwa w konekte.',
            })}
          </p>
        </div>
        <Badge tone={settings.mfaEnabled ? 'success' : 'neutral'}>
          {settings.mfaEnabled
            ? t({ fr: 'Active', ht: 'Aktif' })
            : t({ fr: 'Inactive', ht: 'Pa aktif' })}
        </Badge>
      </div>

      {/* ── Active : la seule action qui reste est de la retirer ── */}
      {settings.mfaEnabled && !enroll && (
        <div className="mt-4 space-y-4">
          <p className="flex items-start gap-2 text-body text-text2 dark:text-dark-text2">
            <ShieldCheck className="mt-0.5 h-5 w-5 flex-shrink-0 text-success" strokeWidth={1.8} aria-hidden />
            {t({
              fr: 'Même avec votre mot de passe, personne ne peut entrer sans votre téléphone.',
              ht: 'Menm ak modpas ou, pèsonn pa ka antre san telefòn ou.',
            })}
          </p>
          {/* Retirer une protection est destructif : c'est le seul rouge de
              l'écran, et il est unique (§4.2). */}
          <Button variant="danger" size="sm" loading={busy} onClick={disable}>
            {t({ fr: 'Retirer la double vérification', ht: 'Retire doub verifikasyon an' })}
          </Button>
        </div>
      )}

      {!settings.mfaEnabled && !enroll && (
        <Button className="mt-4" variant="primary" loading={busy} onClick={start}>
          {t({ fr: 'Activer', ht: 'Aktive' })}
        </Button>
      )}

      {/* ── L'inscription : trois étapes, dans l'ordre où on les fait ── */}
      {enroll && (
        <div className="mt-5 space-y-5">
          <ol className="space-y-1 text-body text-text2 dark:text-dark-text2">
            <li>
              1. {t({
                fr: 'Ouvrez Google Authenticator (ou une application équivalente).',
                ht: 'Louvri Google Authenticator (oswa yon app parèy).',
              })}
            </li>
            <li>2. {t({ fr: 'Scannez ce code.', ht: 'Eskane kòd sa a.' })}</li>
            <li>
              3. {t({
                fr: 'Recopiez les six chiffres affichés par l’application.',
                ht: 'Kopye sis chif app la montre a.',
              })}
            </li>
          </ol>

          <div className="flex flex-col items-center gap-4">
            <div
              className="rounded-surface border border-border bg-white p-3 dark:border-dark-border"
              style={{ width: 200, height: 200 }}
              // Le QR vient de Supabase, déjà en SVG.
              dangerouslySetInnerHTML={{ __html: enroll.qrCode }}
            />

            <div className="w-full max-w-sm">
              <p className="mb-2 text-note text-muted dark:text-dark-muted">
                {t({ fr: 'Si le scan est impossible :', ht: 'Si eskanè a pa mache :' })}
              </p>
              <code className="amount block select-all rounded-control bg-surface2 px-3 py-2 text-center text-body tracking-widest text-primary dark:bg-dark-surface2 dark:text-dark-text">
                {enroll.secret}
              </code>
            </div>
          </div>

          <div className="mx-auto max-w-sm space-y-3">
            <Field
              label={t({ fr: 'Les six chiffres', ht: 'Sis chif yo' })}
              inputMode="numeric"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              placeholder="000000"
              error={error || undefined}
              className="[&_input]:amount [&_input]:text-center [&_input]:tracking-widest"
            />

            <div className="flex items-center gap-3">
              <Button
                variant="accent"
                block
                loading={busy}
                disabled={code.length < 6}
                onClick={verify}
              >
                {t({ fr: 'Vérifier', ht: 'Verifye' })}
              </Button>
              {/* La seconde action d'un écran est un lien, pas un bouton (§4.5). */}
              <Button
                variant="link"
                onClick={() => { setEnroll(null); setChallenge(null); setCode(''); setError(''); }}
              >
                {t({ fr: 'Annuler', ht: 'Anile' })}
              </Button>
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

function SecurityInner() {
  const { t, language } = useLanguage();

  const [sessions, setSessions] = useState<LoginSession[]>([]);
  const [settings, setSettings] = useState<SecuritySettings | null>(null);
  const [loading,  setLoading]  = useState(true);
  const [offset,   setOffset]   = useState(0);
  const [hasMore,  setHasMore]  = useState(false);
  const [revoking, setRevoking] = useState<string | null>(null);

  const load = useCallback(async (newOffset: number) => {
    setLoading(true);
    const [sess, sec] = await Promise.all([
      listLoginSessions({ limit: LIMIT + 1, offset: newOffset }),
      getSecuritySettings(),
    ]);
    setHasMore(sess.length > LIMIT);
    setSessions(sess.slice(0, LIMIT));
    setSettings(sec);
    setOffset(newOffset);
    setLoading(false);
  }, []);

  useEffect(() => { load(0); }, [load]);

  async function revoke(id: string) {
    setRevoking(id);
    const res = await revokeSession(id);
    if (res.error) {
      toast.error(res.error);
    } else {
      toast.success(t({ fr: 'Appareil déconnecté.', ht: 'Aparèy dekonekte.' }));
      setSessions((prev) =>
        prev.map((s) => (s.id === id ? { ...s, revokedAt: new Date().toISOString() } : s)),
      );
    }
    setRevoking(null);
  }

  return (
    <div className="pp-enter mx-auto w-full max-w-2xl px-4 py-6 sm:px-6">
      <ScreenHeader
        title={t({ fr: 'Sécurité', ht: 'Sekirite' })}
        subtitle={t({
          fr: 'Ce qui protège votre compte, et qui s’y est connecté.',
          ht: 'Sa k pwoteje kont ou, ak kiyès ki konekte sou li.',
        })}
      />

      <Stack className="mt-6">
        {settings && <TwoFactor settings={settings} onChange={() => load(offset)} />}

        <Section title={t({ fr: 'Connexions', ht: 'Koneksyon' })}>
          <Card>
            {loading ? (
              <div className="space-y-2 p-4" aria-hidden>
                {[0, 1, 2].map((i) => (
                  <span key={i} className="pp-skeleton block h-14 rounded-control" />
                ))}
              </div>
            ) : sessions.length === 0 ? (
              <p className="px-4 py-10 text-center text-body text-muted dark:text-dark-muted">
                {t({
                  fr: 'Aucune connexion enregistrée pour l’instant.',
                  ht: 'Pa gen koneksyon anrejistre pou kounye a.',
                })}
              </p>
            ) : (
              <ul className="divide-y divide-border dark:divide-dark-border">
                {sessions.map((s) => {
                  const Icon = DEVICE_ICON[s.deviceType ?? 'desktop'] ?? Monitor;
                  return (
                    <li key={s.id} className="flex items-center gap-3 px-4 py-3">
                      <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-surface bg-surface2 text-muted dark:bg-dark-surface2 dark:text-dark-muted">
                        <Icon className="h-5 w-5" strokeWidth={1.8} aria-hidden />
                      </span>

                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-2">
                          <span className="text-body text-primary dark:text-dark-text">
                            {s.browser ?? t({ fr: 'Navigateur inconnu', ht: 'Navigatè enkoni' })}
                            {s.os ? ` · ${s.os}` : ''}
                          </span>
                          {s.revokedAt && (
                            <Badge tone="neutral">
                              {t({ fr: 'Déconnecté', ht: 'Dekonekte' })}
                            </Badge>
                          )}
                        </span>
                        <span className="mt-0.5 block text-note text-muted dark:text-dark-muted">
                          {relativeDate(s.createdAt, language)}
                          {s.country ? ` · ${s.country}` : ''}
                          {s.ip ? ` · ${s.ip}` : ''}
                        </span>
                      </span>

                      {!s.revokedAt && (
                        <Button
                          variant="quiet"
                          size="sm"
                          loading={revoking === s.id}
                          onClick={() => revoke(s.id)}
                        >
                          {t({ fr: 'Déconnecter', ht: 'Dekonekte' })}
                        </Button>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}

            {(offset > 0 || hasMore) && (
              <div className="flex items-center justify-between gap-4 border-t border-border px-4 py-2 dark:border-dark-border">
                <PageButton onClick={() => load(Math.max(0, offset - LIMIT))} disabled={offset === 0 || loading}>
                  {t({ fr: 'Précédent', ht: 'Anvan' })}
                </PageButton>
                <PageButton onClick={() => load(offset + LIMIT)} disabled={!hasMore || loading}>
                  {t({ fr: 'Suivant', ht: 'Apre' })}
                </PageButton>
              </div>
            )}
          </Card>
        </Section>

        {/* Quatre phrases, pas un encadré bleu à ampoule : le conseil se lit
            comme le reste de l'écran (§3.2). */}
        <Section title={t({ fr: 'Trois réflexes', ht: 'Twa bagay pou sonje' })}>
          <ul className="space-y-2">
            {[
              {
                fr: 'Une connexion que vous ne reconnaissez pas se déconnecte tout de suite, puis changez votre mot de passe.',
                ht: 'Yon koneksyon ou pa rekonèt, dekonekte l touswit, epi chanje modpas ou.',
              },
              {
                fr: 'Votre mot de passe ProfitPilot ne doit servir nulle part ailleurs.',
                ht: 'Modpas ProfitPilot ou pa dwe sèvi okenn lòt kote.',
              },
              {
                fr: 'Personne de ProfitPilot ne vous demandera jamais votre mot de passe, ni par téléphone ni sur WhatsApp.',
                ht: 'Pèsonn nan ProfitPilot p ap janm mande w modpas ou, ni nan telefòn ni sou WhatsApp.',
              },
            ].map((tip) => (
              <li key={tip.fr} className="flex items-start gap-2 text-body text-text2 dark:text-dark-text2">
                <span className="mt-2 h-1.5 w-1.5 flex-shrink-0 rounded-pill bg-border dark:bg-dark-border" aria-hidden />
                {t(tip)}
              </li>
            ))}
          </ul>
        </Section>
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
    day: '2-digit', month: 'short', year: 'numeric',
  });
}

export default function SecurityPage() {
  return (
    <ProtectedRoute>
      <SecurityInner />
    </ProtectedRoute>
  );
}
