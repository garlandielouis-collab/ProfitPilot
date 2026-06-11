'use client';

import { Suspense, useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabase } from '../../../lib/supabaseClient';
import { Logo } from '../../../components/Logo';
import { recordLogin } from '../../../hooks/useSubscription';
import { useLanguage } from '../../../components/LanguageWrapper';

function translateError(msg: string, t: (obj: { fr: string; ht: string }) => string): string {
  const m = (msg ?? '').toLowerCase();
  if (m.includes('invalid login credentials') || m.includes('invalid credentials'))
    return t({ fr: 'Email ou mot de passe incorrect.', ht: 'Imèl oswa modpas pa kòrèk.' });
  if (m.includes('email not confirmed'))
    return t({ fr: 'Email pas encore confirmé. Vérifiez votre boîte mail (+ dossier Spam).', ht: 'Imèl poko konfime. Tcheke bwat resepsyon ou (+ dosye Spam).' });
  if (m.includes('too many requests') || m.includes('rate limit'))
    return t({ fr: 'Trop de tentatives. Attendez 1-2 minutes et réessayez.', ht: 'Twòp tantativ. Tann 1-2 minit epi reesyek.' });
  if (m.includes('user not found'))
    return t({ fr: 'Aucun compte trouvé avec cet email.', ht: 'Pa gen kont jwenn ak imèl sa a.' });
  if (m.includes('network') || m.includes('fetch'))
    return t({ fr: 'Erreur réseau. Vérifiez votre connexion internet.', ht: 'Erè rezo. Tcheke koneksyon entènèt ou.' });
  if (m.includes('supabase client not available'))
    return t({ fr: 'Configuration manquante. Vérifiez les variables NEXT_PUBLIC_SUPABASE_*.', ht: 'Konfigirasyon manke. Tcheke varyab NEXT_PUBLIC_SUPABASE_*.' });
  return t({ fr: 'Erreur inconnue. Vérifiez la console (F12).', ht: 'Erè enkoni. Tcheke console la (F12).' });
}

function LoginForm() {
  const { t } = useLanguage();
  const router = useRouter();
  const searchParams = useSearchParams();

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
      setError(t({ fr: 'Le lien de confirmation a expiré ou est invalide. Renvoyez un email ci-dessous.', ht: 'Lyen konfimasyon an ekspire oswa envalid. Voye yon imèl ankò anba.' }));
      setEmailNeeded(true);
    }
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setEmailNeeded(false);
    setResendSent(false);

    if (!email.trim()) { setError('Entrez votre email.'); return; }
    if (!password)     { setError('Entrez votre mot de passe.'); return; }

    setLoading(true);

    try {
      console.group('🔍 [LOGIN DIAGNOSTIC]');
      console.log('1. Email:', email.trim().toLowerCase());

      const { data, error: authError } = await supabase.auth.signInWithPassword({
        email:    email.trim().toLowerCase(),
        password,
      });

      console.log('2. signInWithPassword résultat:');
      console.log('   → error:', authError ? `${authError.message} (status=${authError.status})` : 'null ✅');
      console.log('   → user exists:', !!data?.user, '| user.id:', data?.user?.id ?? 'null');
      console.log('   → session exists:', !!data?.session);
      console.log('   → access_token exists:', !!data?.session?.access_token);
      console.log('   → refresh_token exists:', !!data?.session?.refresh_token);
      console.groupEnd();

      if (authError) {
        console.warn('[Login] ❌ Erreur auth:', authError.message, 'status:', authError.status);
        if (
          authError.message.toLowerCase().includes('email not confirmed') ||
          authError.message.toLowerCase().includes('email_not_confirmed')
        ) {
          setEmailNeeded(true);
        } else {
          setError(translateError(authError.message, t));
        }
        setLoading(false);
        return;
      }

      console.log('[Login] ✅ Connexion réussie — navigation vers /dashboard');
      console.log('[Login] user.id:', data.user?.id);
      console.log('[Login] session.expires_at:', data.session?.expires_at);

      // Vérifier la session immédiatement après login (preuve que les cookies sont posés)
      const { data: { session: verif } } = await supabase.auth.getSession();
      console.log('[Login] 3. Vérif getSession() juste après login:', !!verif, '| user:', verif?.user?.id ?? 'null');

      // Succès - laisser onAuthStateChange propager la session avant de naviguer
      recordLogin();
      await new Promise(resolve => setTimeout(resolve, 300));
      router.replace('/dashboard');
      setLoading(false);

    } catch (err: any) {
      console.error('[Login] exception:', err);
      setError(translateError(err?.message ?? String(err), t));
      setLoading(false);
    }
  }

  async function handleResend() {
    setResending(true);
    setError('');
    try {
      const { error } = await supabase.auth.resend({
        type:  'signup',
        email: email.trim().toLowerCase(),
      });
      if (error) setError(translateError(error.message, t));
      else       setResendSent(true);
    } catch (err: any) {
      setError(translateError(err?.message ?? String(err), t));
    }
    setResending(false);
  }

  // ── UI : Email pas confirmé ────────────────────────────────────────────────
  if (emailNeeded) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-10">
        <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-8 shadow-sm space-y-5">

          <div className="flex flex-col items-center gap-3 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-100">
              <svg className="h-7 w-7 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-800">{t({ fr: 'Confirmez votre email', ht: 'Konfime imèl ou' })}</h2>
              <p className="mt-1 text-sm text-slate-500">
                {t({ fr: 'Email envoyé à ', ht: 'Imèl voye nan ' })}
                <strong className="text-slate-700">{email}</strong>.
                <br />{t({ fr: 'Cliquez le lien dans cet email. Vérifiez aussi les ', ht: 'Klike sou lyen an nan imèl sa a. Tcheke tou ' })}
                <strong>{t({ fr: 'Spams', ht: 'Spams' })}</strong>.
              </p>
            </div>
          </div>

          {resendSent
            ? <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-center text-sm font-medium text-emerald-700">✅ {t({ fr: 'Email renvoyé !', ht: 'Imèl voye ankò !' })}</div>
            : <button type="button" onClick={handleResend} disabled={resending}
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60">
                {resending
                  ? <><span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-slate-600" /> {t({ fr: 'Envoi...', ht: 'Anvwa...' })}</>
                  : t({ fr: 'Renvoyer l\'email de confirmation', ht: 'Voye imèl konfimasyon an ankò' })}
              </button>
          }

          {error && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">{error}</div>}

          <button type="button" onClick={() => { setEmailNeeded(false); setError(''); }}
            className="w-full text-center text-sm text-slate-400 hover:text-slate-600">
            {t({ fr: '← Retour à la connexion', ht: '← Retounen nan koneksyon' })}
          </button>
        </div>
      </main>
    );
  }

  // ── UI : Formulaire normal ────────────────────────────────────────────────
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-10">
      <div className="w-full max-w-md">

        <div className="mb-8 flex flex-col items-center gap-3">
          <Logo size="h-14 w-14" />
          <div className="text-center">
            <h1 className="text-2xl font-bold text-[#001F3F]">ProfitPilot</h1>
            <p className="mt-1 text-sm text-slate-500">{t({ fr: 'Connectez-vous à votre compte', ht: 'Konekte ak kont ou' })}</p>
          </div>
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
          <form onSubmit={handleSubmit} noValidate className="space-y-5">

            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-widest text-slate-500">
                {t({ fr: 'Email', ht: 'Imèl' })}
              </label>
              <input
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="vous@example.com"
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-[#001F3F]/40 focus:ring-2 focus:ring-[#001F3F]/10"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-widest text-slate-500">
                {t({ fr: 'Mot de passe', ht: 'Modpas' })}
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 pr-11 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-[#001F3F]/40 focus:ring-2 focus:ring-[#001F3F]/10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(p => !p)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                  tabIndex={-1}
                >
                  {showPassword ? (
                    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.878 9.878L3 3m6.878 6.878L21 21" />
                    </svg>
                  ) : (
                    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </svg>
                  )}
                </button>
              </div>
            </div>

            {error && (
              <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#001F3F] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#002D5B] disabled:opacity-60"
            >
              {loading
                ? <><span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" /> {t({ fr: 'Connexion...', ht: 'Koneksyon...' })}</>
                : t({ fr: 'Se connecter', ht: 'Konekte' })}
            </button>

          </form>

          <p className="mt-6 text-center text-sm text-slate-500">
            {t({ fr: 'Pas encore de compte ?', ht: 'Pokò gen kont ?' })}{' '}
            <Link href="/auth/register" className="font-semibold text-[#001F3F] hover:underline">
              {t({ fr: 'Créer un compte', ht: 'Kreye yon kont' })}
            </Link>
          </p>
        </div>
      </div>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-200 border-t-[#001F3F]" /></div>}>
      <LoginForm />
    </Suspense>
  );
}
