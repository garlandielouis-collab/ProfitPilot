'use client';

// ─────────────────────────────────────────────────────────────────────────────
// Choisir un nouveau mot de passe — l'autre moitié du chemin (§3.1)
//
// Le lien reçu par e-mail ouvre une session de récupération : c'est elle qui
// autorise le changement, et rien d'autre. Trois états sont dessinés, parce
// qu'ils arrivent tous les trois en vrai :
//
//   · on attend de savoir si le lien est valide ;
//   · le lien a expiré ou a déjà servi — on le dit, et on offre la sortie ;
//   · tout va bien, on saisit le nouveau mot de passe.
//
// « Un flux se conçoit du premier jour au pire jour. »
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Eye, EyeOff } from 'lucide-react';
import { supabase } from '../../../lib/supabaseClient';
import { Logo } from '../../../components/Logo';
import { useLanguage } from '../../../components/LanguageWrapper';
import { Button, Field } from '../../../components/ds';

/** Huit caractères : le minimum imposé par Supabase à l'inscription. */
const MIN_LENGTH = 8;

export default function ResetPasswordPage() {
  const { t } = useLanguage();
  const router = useRouter();

  const [checking, setChecking] = useState(true);
  const [allowed,  setAllowed]  = useState(false);
  const [password, setPassword] = useState('');
  const [show,     setShow]     = useState(false);
  const [saving,   setSaving]   = useState(false);
  const [done,     setDone]     = useState(false);
  const [error,    setError]    = useState('');

  useEffect(() => {
    let alive = true;

    // Supabase pose la session de récupération au chargement de la page ; selon
    // le format du lien, elle arrive tout de suite ou via l'événement.
    supabase.auth.getSession().then(({ data }: any) => {
      if (!alive) return;
      if (data?.session) { setAllowed(true); setChecking(false); }
    });

    const { data: sub } = supabase.auth.onAuthStateChange((event: string, session: any) => {
      if (!alive) return;
      if (session) setAllowed(true);
      if (event === 'PASSWORD_RECOVERY' || session) setChecking(false);
    });

    // Au-delà de trois secondes sans session, le lien ne vaut plus rien : on ne
    // laisse pas tourner une roue indéfiniment (§3.7).
    const timer = setTimeout(() => { if (alive) setChecking(false); }, 3000);

    return () => {
      alive = false;
      clearTimeout(timer);
      sub?.subscription?.unsubscribe?.();
    };
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (password.length < MIN_LENGTH) {
      setError(t({
        fr: `Au moins ${MIN_LENGTH} caractères.`,
        ht: `Omwen ${MIN_LENGTH} karaktè.`,
      }));
      return;
    }
    setSaving(true);
    try {
      const { error: updErr } = await supabase.auth.updateUser({ password });
      if (updErr) {
        setError(t({
          fr: 'Changement impossible. Le lien a peut-être expiré — redemandez-en un.',
          ht: 'Chanjman pa posib. Lyen an ka ekspire — mande yon lòt.',
        }));
      } else {
        setDone(true);
        setTimeout(() => router.replace('/dashboard'), 1200);
      }
    } catch {
      setError(t({ fr: 'Pas de réseau. Réessayez.', ht: 'Pa gen rezo. Reeseye.' }));
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-surface px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center gap-2 text-center">
          <Logo size="h-12 w-12" />
          <h1 className="text-screen font-bold text-primary">
            {t({ fr: 'Nouveau mot de passe', ht: 'Nouvo modpas' })}
          </h1>
        </div>

        {checking ? (
          <p className="mt-8 text-center text-body text-text2">
            {t({ fr: 'Vérification du lien…', ht: 'N ap tcheke lyen an…' })}
          </p>
        ) : !allowed ? (
          <div className="mt-8 space-y-6 text-center">
            <p className="text-body text-text2">
              {t({
                fr: 'Ce lien a expiré ou a déjà servi. Demandez-en un nouveau, il arrive tout de suite.',
                ht: 'Lyen sa a ekspire oswa li deja sèvi. Mande yon lòt, l ap rive touswit.',
              })}
            </p>
            <Link href="/auth/forgot-password" className="block">
              <Button variant="accent" size="lg" block>
                {t({ fr: 'Recevoir un nouveau lien', ht: 'Resevwa yon lòt lyen' })}
              </Button>
            </Link>
          </div>
        ) : done ? (
          <p className="mt-8 rounded-surface bg-success/10 px-4 py-3 text-center text-body font-bold text-success">
            {t({ fr: 'Mot de passe changé. Bon retour.', ht: 'Modpas chanje. Bon retou.' })}
          </p>
        ) : (
          <form onSubmit={handleSubmit} noValidate className="mt-8 space-y-4">
            <Field
              label={t({ fr: 'Votre nouveau mot de passe', ht: 'Nouvo modpas ou' })}
              hint={t({ fr: `${MIN_LENGTH} caractères au minimum.`, ht: `${MIN_LENGTH} karaktè omwen.` })}
              type={show ? 'text' : 'password'}
              autoComplete="new-password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoFocus
              suffix={
                <button
                  type="button"
                  onClick={() => setShow((v) => !v)}
                  aria-label={show
                    ? t({ fr: 'Masquer le mot de passe', ht: 'Kache modpas la' })
                    : t({ fr: 'Afficher le mot de passe', ht: 'Montre modpas la' })}
                  className="pressable flex h-touch w-touch items-center justify-center rounded-control text-muted"
                >
                  {show ? <EyeOff className="h-5 w-5" strokeWidth={1.8} aria-hidden />
                        : <Eye    className="h-5 w-5" strokeWidth={1.8} aria-hidden />}
                </button>
              }
            />

            {error && (
              <p role="alert" className="rounded-surface bg-danger/10 px-4 py-3 text-body text-danger">
                {error}
              </p>
            )}

            <Button type="submit" variant="accent" size="lg" block loading={saving}
              loadingLabel={t({ fr: 'Enregistrement…', ht: 'Anrejistreman…' })}>
              {t({ fr: 'Changer mon mot de passe', ht: 'Chanje modpas mwen' })}
            </Button>
          </form>
        )}
      </div>
    </main>
  );
}
