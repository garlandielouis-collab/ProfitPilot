'use client';

// ─────────────────────────────────────────────────────────────────────────────
// L'écran de connexion — les quatre lignes du tableau §6.1
//
//   Couleur     Un seul élément émeraude : le bouton « Se connecter ». Le reste
//               en marine sur fond clair. L'accent tombe exactement sur l'action
//               attendue. Avant : le bouton était marine comme tout le reste —
//               l'écran n'avait aucun point d'accent, donc rien ne guidait.
//
//   Hiérarchie  Ce que vous faites ici (titre), ce qu'il faut saisir (libellés
//               DISTINCTS des placeholders — le contraste, pas un cadre), l'action
//               (bouton plein), et en tertiaire, en texte : « Pas de compte ? ».
//               Le lien « Mot de passe oublié » est souligné et distinct — il
//               n'existait pas du tout : un marchand qui oubliait son mot de
//               passe n'avait aucun chemin (§3.1, le flux incomplet).
//
//   Proximité   Le bloc logo + titre + sous-titre est verrouillé à espacement
//               constant, puis 24 px le séparent du formulaire. Avant, le logo
//               flottait à mi-distance : il ne se rattachait visuellement à rien.
//
//   Contexte    Connexion par NUMÉRO en premier, +509 prérempli, clavier
//   haïtien     numérique ; l'e-mail en option secondaire. Beaucoup de marchands
//               vivent sur WhatsApp et n'ouvrent jamais leur boîte mail — leur
//               demander une adresse e-mail pour entrer chez eux, c'est leur
//               demander de retenir une chose de plus.
//
// Et un message de réseau clair si la connexion échoue — pas de silence (§3.7).
// ─────────────────────────────────────────────────────────────────────────────

import { Suspense, useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Eye, EyeOff } from 'lucide-react';
import { supabase } from '../../../lib/supabaseClient';
import { Logo } from '../../../components/Logo';
import { recordLogin } from '../../../hooks/useSubscription';
import { useLanguage } from '../../../components/LanguageWrapper';
import { recordLoginSession } from '../../actions/security';
import { ensurePhoneLinked, resolvePhoneLogin } from '../../actions/phoneAuth';
import { Button, Field, PhoneField } from '../../../components/ds';

type Mode = 'phone' | 'email';

function translateError(msg: string, t: (obj: { fr: string; ht: string }) => string): string {
  const m = (msg ?? '').toLowerCase();
  if (m.includes('invalid login credentials') || m.includes('invalid credentials'))
    return t({ fr: 'Identifiant ou mot de passe incorrect.', ht: 'Idantifyan oswa modpas pa kòrèk.' });
  if (m.includes('email not confirmed'))
    return t({ fr: 'Email pas encore confirmé. Vérifiez votre boîte mail (+ dossier Spam).', ht: 'Imèl poko konfime. Tcheke bwat resepsyon ou (+ dosye Spam).' });
  if (m.includes('too many requests') || m.includes('rate limit'))
    return t({ fr: 'Trop de tentatives. Attendez 1 à 2 minutes et réessayez.', ht: 'Twòp tantativ. Tann 1 a 2 minit epi reeseye.' });
  if (m.includes('user not found'))
    return t({ fr: 'Aucun compte trouvé avec cet identifiant.', ht: 'Pa gen kont ak idantifyan sa a.' });
  // Backend injoignable ≠ internet coupé : le remède n'est pas le même.
  if (m.includes('supabase_unreachable') || m.includes('injoignable'))
    return t({
      fr: 'Serveur ProfitPilot injoignable. Votre connexion fonctionne, mais le serveur ne répond pas — réessayez dans un instant.',
      ht: 'Sèvè ProfitPilot pa reponn. Koneksyon ou bon, men sèvè a pa disponib — reeseye nan yon ti moman.',
    });
  if (m.includes('pas de connexion internet') || m.includes('network') || m.includes('fetch'))
    return t({ fr: 'Pas de réseau. Vérifiez votre connexion, puis réessayez.', ht: 'Pa gen rezo. Tcheke koneksyon ou, epi reeseye.' });
  if (m.includes('trop de temps'))
    return t({ fr: 'Le serveur met trop de temps à répondre. Réessayez.', ht: 'Sèvè a pran twòp tan. Reeseye.' });
  if (m.includes('supabase client not available'))
    return t({ fr: 'Configuration manquante. Vérifiez les variables NEXT_PUBLIC_SUPABASE_*.', ht: 'Konfigirasyon manke. Tcheke varyab NEXT_PUBLIC_SUPABASE_*.' });
  return t({ fr: 'Connexion impossible. Réessayez dans un instant.', ht: 'Koneksyon pa posib. Reeseye nan yon ti moman.' });
}

function LoginForm() {
  const { t } = useLanguage();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [mode,        setMode]        = useState<Mode>('phone');
  const [phone,       setPhone]       = useState('');
  const [email,       setEmail]       = useState('');
  const [password,    setPassword]    = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading,     setLoading]     = useState(false);
  const [error,       setError]       = useState('');
  const [emailNeeded, setEmailNeeded] = useState(false);
  const [resendSent,  setResendSent]  = useState(false);
  const [resending,   setResending]   = useState(false);

  useEffect(() => {
    if (searchParams?.get('error') === 'confirmation_failed') {
      setError(t({ fr: 'Le lien de confirmation a expiré. Renvoyez-vous un e-mail ci-dessous.', ht: 'Lyen konfimasyon an ekspire. Voye yon imèl ankò anba.' }));
      setEmailNeeded(true);
      setMode('email');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Ouvre la session. Le chemin est le même quel que soit l'identifiant : une
   *  seule mécanique de session à maintenir (§3.4, cohérence). */
  async function openSession(withEmail: string) {
    const { data, error: authError } = await supabase.auth.signInWithPassword({
      email: withEmail.trim().toLowerCase(),
      password,
    });

    if (authError) {
      const m = authError.message.toLowerCase();
      if (m.includes('email not confirmed') || m.includes('email_not_confirmed')) {
        setEmail(withEmail);
        setEmailNeeded(true);
      } else {
        setError(translateError(authError.message, t));
      }
      return false;
    }

    recordLogin();
    void recordLoginSession();
    // Rattrape le numéro laissé en métadonnées quand l'inscription exigeait une
    // confirmation par e-mail : sans cela, la connexion par numéro ne marcherait
    // jamais pour ces comptes-là.
    void ensurePhoneLinked();
    // On laisse la session se propager avant de naviguer.
    await new Promise((resolve) => setTimeout(resolve, 300));
    void data;
    router.replace('/dashboard');
    return true;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setEmailNeeded(false);
    setResendSent(false);

    if (mode === 'phone' && !phone.trim()) {
      setError(t({ fr: 'Entrez votre numéro de téléphone.', ht: 'Antre nimewo telefòn ou.' })); return;
    }
    if (mode === 'email' && !email.trim()) {
      setError(t({ fr: 'Entrez votre adresse e-mail.', ht: 'Antre adrès imèl ou.' })); return;
    }
    if (!password) {
      setError(t({ fr: 'Entrez votre mot de passe.', ht: 'Antre modpas ou.' })); return;
    }

    setLoading(true);
    try {
      if (mode === 'email') {
        await openSession(email);
      } else {
        // Le numéro est résolu côté serveur, et seulement si le mot de passe
        // est le bon : l'adresse ne sort jamais pour un numéro tapé au hasard.
        const found = await resolvePhoneLogin(phone, password);
        if (!found.ok) {
          setError(
            found.reason === 'bad_phone'
              ? t({ fr: 'Numéro incomplet. Huit chiffres, par exemple 3712 4521.', ht: 'Nimewo pa konplè. Uit chif, egzanp 3712 4521.' })
              : found.reason === 'no_account'
              ? t({ fr: 'Aucun compte avec ce numéro. Connectez-vous par e-mail, puis rattachez votre numéro dans les réglages.', ht: 'Pa gen kont ak nimewo sa a. Konekte ak imèl, epi mete nimewo ou nan reglaj yo.' })
              : found.reason === 'bad_password'
              ? t({ fr: 'Numéro ou mot de passe incorrect.', ht: 'Nimewo oswa modpas pa kòrèk.' })
              : t({ fr: 'Connexion par numéro indisponible pour le moment. Utilisez votre e-mail.', ht: 'Koneksyon ak nimewo pa disponib kounye a. Sèvi ak imèl ou.' }),
          );
        } else {
          await openSession(found.email);
        }
      }
    } catch (err: any) {
      setError(translateError(err?.message ?? String(err), t));
    } finally {
      setLoading(false);
    }
  }

  async function handleResend() {
    setResending(true);
    setError('');
    try {
      const { error: resendErr } = await supabase.auth.resend({ type: 'signup', email: email.trim().toLowerCase() });
      if (resendErr) setError(translateError(resendErr.message, t));
      else setResendSent(true);
    } catch (err: any) {
      setError(translateError(err?.message ?? String(err), t));
    }
    setResending(false);
  }

  // ── E-mail pas confirmé ────────────────────────────────────────────────────
  if (emailNeeded) {
    return (
      <Frame>
        <div className="text-center">
          <h1 className="text-screen font-bold text-primary">
            {t({ fr: 'Confirmez votre e-mail', ht: 'Konfime imèl ou' })}
          </h1>
          <p className="mt-2 text-body text-text2">
            {t({ fr: 'Un lien a été envoyé à ', ht: 'Yon lyen voye nan ' })}
            <span className="font-bold text-primary">{email}</span>.{' '}
            {t({ fr: 'Regardez aussi dans les spams.', ht: 'Gade tou nan spam yo.' })}
          </p>
        </div>

        <div className="mt-8 space-y-4">
          {resendSent ? (
            <p className="rounded-surface bg-success/10 px-4 py-3 text-center text-body font-bold text-success">
              {t({ fr: 'E-mail renvoyé.', ht: 'Imèl voye ankò.' })}
            </p>
          ) : (
            <Button variant="outline" block loading={resending} onClick={handleResend}>
              {t({ fr: "Renvoyer l'e-mail", ht: 'Voye imèl la ankò' })}
            </Button>
          )}

          {error && <ErrorNote>{error}</ErrorNote>}

          <Button
            variant="link"
            block
            onClick={() => { setEmailNeeded(false); setError(''); }}
          >
            {t({ fr: 'Revenir à la connexion', ht: 'Retounen nan koneksyon' })}
          </Button>
        </div>
      </Frame>
    );
  }

  // ── Connexion ──────────────────────────────────────────────────────────────
  return (
    <Frame>
      {/* Le bloc d'identité : logo, titre, sous-titre, espacement constant.
          Il se lit comme UN élément (§4.5, proximité). */}
      <div className="flex flex-col items-center gap-2 text-center">
        <Logo size="h-12 w-12" />
        <h1 className="text-screen font-bold text-primary">ProfitPilot</h1>
        <p className="text-body text-text2">
          {t({ fr: 'Votre commerce, au clair.', ht: 'Komès ou, byen klè.' })}
        </p>
      </div>

      {/* 24 px séparent deux groupes distincts — et rien d'autre : pas de carte
          dans une carte, pas de trait (§5.5, §4.5). */}
      <form onSubmit={handleSubmit} noValidate className="mt-8 space-y-4">
        {mode === 'phone' ? (
          <PhoneField
            label={t({ fr: 'Votre numéro', ht: 'Nimewo ou' })}
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            autoFocus
          />
        ) : (
          <Field
            label={t({ fr: 'Votre e-mail', ht: 'Imèl ou' })}
            type="email"
            inputMode="email"
            autoComplete="email"
            placeholder="marchand@exemple.ht"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoFocus
          />
        )}

        <Field
          label={t({ fr: 'Mot de passe', ht: 'Modpas' })}
          type={showPassword ? 'text' : 'password'}
          autoComplete="current-password"
          placeholder="••••••••"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          suffix={
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword
                ? t({ fr: 'Masquer le mot de passe', ht: 'Kache modpas la' })
                : t({ fr: 'Afficher le mot de passe', ht: 'Montre modpas la' })}
              className="pressable flex h-touch w-touch items-center justify-center rounded-control text-muted"
            >
              {showPassword ? <EyeOff className="h-5 w-5" strokeWidth={1.8} aria-hidden />
                            : <Eye    className="h-5 w-5" strokeWidth={1.8} aria-hidden />}
            </button>
          }
        />

        {error && <ErrorNote>{error}</ErrorNote>}

        {/* LE point d'émeraude de l'écran. Un seul, sur l'action attendue. */}
        <Button type="submit" variant="accent" size="lg" block loading={loading}
          loadingLabel={t({ fr: 'Connexion…', ht: 'Koneksyon…' })}>
          {t({ fr: 'Se connecter', ht: 'Konekte' })}
        </Button>

        {/* L'autre identifiant, en tertiaire : présent, jamais au même poids
            que l'action principale (§4.5). */}
        <button
          type="button"
          onClick={() => { setMode(mode === 'phone' ? 'email' : 'phone'); setError(''); }}
          className="pressable block w-full min-h-touch text-note text-text2 underline underline-offset-4"
        >
          {mode === 'phone'
            ? t({ fr: 'Utiliser plutôt mon e-mail', ht: 'Sèvi ak imèl mwen pito' })
            : t({ fr: 'Utiliser plutôt mon numéro', ht: 'Sèvi ak nimewo mwen pito' })}
        </button>
      </form>

      {/* Deux sorties, toutes deux en texte : oublier son mot de passe n'était
          pas un chemin prévu du tout avant (§3.1). */}
      <div className="mt-8 space-y-3 text-center">
        <Link
          href="/auth/forgot-password"
          className="pressable inline-flex min-h-touch items-center text-note text-text2 underline underline-offset-4"
        >
          {t({ fr: 'Mot de passe oublié ?', ht: 'Ou bliye modpas ou ?' })}
        </Link>
        <p className="text-body text-text2">
          {t({ fr: 'Pas encore de compte ?', ht: 'Ou pòkò gen kont ?' })}{' '}
          <Link href="/auth/register" className="font-bold text-primary underline underline-offset-4">
            {t({ fr: 'Créer mon compte', ht: 'Kreye kont mwen' })}
          </Link>
        </p>
      </div>
    </Frame>
  );
}

/** Le cadre commun : fond neutre, contenu centré, respiration constante. */
function Frame({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-surface px-4 py-10">
      <div className="w-full max-w-sm">{children}</div>
    </main>
  );
}

/** Le rouge système, et seulement ici : quelque chose a échoué (§4.2). */
function ErrorNote({ children }: { children: React.ReactNode }) {
  return (
    <p role="alert" className="rounded-surface bg-danger/10 px-4 py-3 text-body text-danger">
      {children}
    </p>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className="flex min-h-screen items-center justify-center bg-surface">
        <span className="h-8 w-8 animate-spin rounded-pill border-2 border-border border-t-primary" aria-label="Chargement" />
      </div>
    }>
      <LoginForm />
    </Suspense>
  );
}
