'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabase } from '../../../lib/supabaseClient';
import { Logo } from '../../../components/Logo';
import { useLanguage } from '../../../components/LanguageWrapper';
import { recordLogin } from '../../../hooks/useSubscription';

function translateError(msg: string, t: (obj: { fr: string; ht: string }) => string): string {
  const m = msg.toLowerCase();
  if (m.includes('user already registered') || m.includes('already registered'))
    return t({ fr: 'Un compte existe déjà avec cet email. Connectez-vous.', ht: 'Yon kont deja egziste ak imèl sa a. Konekte.' });
  if (m.includes('password') && m.includes('short'))
    return t({ fr: 'Le mot de passe doit contenir au moins 6 caractères.', ht: 'Modpas la dwe gen omwen 6 karaktè.' });
  if (m.includes('invalid email'))
    return t({ fr: 'Adresse email invalide.', ht: 'Adrès imèl enválid.' });
  if (m.includes('too many requests') || m.includes('rate limit'))
    return t({ fr: 'Trop de tentatives. Attendez quelques minutes.', ht: 'Twòp tantativ. Tann kèk minit.' });
  return msg;
}

type Step = 'form' | 'check-email' | 'success';

function RegisterForm() {
  const { t } = useLanguage();
  const router = useRouter();

  const [step,     setStep]     = useState<Step>('form');
  const [name,     setName]     = useState('');
  const [businessName, setBusinessName] = useState('');
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState('');
  const [resendOk, setResendOk] = useState(false);
  const [resending, setResending] = useState(false);

  const searchParams = useSearchParams();
  useEffect(() => {
    const fromUrl = searchParams?.get('business_name');
    if (fromUrl) setBusinessName(fromUrl);
  }, [searchParams]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (password.length < 6) {
      setError(t({ fr: 'Le mot de passe doit contenir au moins 6 caractères.', ht: 'Modpas la dwe gen omwen 6 karaktè.' }));
      return;
    }

    setLoading(true);

    const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
      email:   email.trim(),
      password,
      options: { data: { full_name: name.trim(), business_name: businessName.trim() || name.trim() } },
    });

    if (signUpError) {
      setError(translateError(signUpError.message, t));
      setLoading(false);
      return;
    }

    // Si Supabase a déjà confirmé l'email (confirmation désactivée dans le dashboard)
    // → la session est active immédiatement
    if (signUpData.session) {
      recordLogin();
      await new Promise(resolve => setTimeout(resolve, 500));
      router.replace('/dashboard');
      setLoading(false);
      return;
    }

    // Sinon → l'utilisateur doit confirmer son email
    setLoading(false);
    setStep('check-email');
  }

  async function handleResend() {
    setResending(true);
    setResendOk(false);
    const { error } = await supabase.auth.resend({
      type:  'signup',
      email: email.trim(),
    });
    setResending(false);
    if (!error) setResendOk(true);
    else setError(translateError(error.message, t));
  }

  // ── ÉTAPE 1 : Formulaire ─────────────────────────────────────────────────────
  if (step === 'form') {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-10">
        <div className="w-full max-w-md">

          <div className="mb-8 flex flex-col items-center gap-3">
            <img src="/profitpilot-logo.png" alt="ProfitPilot" className="h-14 w-14 rounded-2xl object-contain shadow-lg" />
            <div className="text-center">
              <h1 className="text-2xl font-bold text-[#001F3F]">ProfitPilot</h1>
              <p className="mt-1 text-sm text-slate-500">{t({ fr: 'Créez votre compte gratuitement', ht: 'Kreye kont ou gratis' })}</p>
            </div>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-widest text-slate-500">
                  {t({ fr: 'Votre nom', ht: 'Non ou' })}
                </label>
                <input
                  type="text"
                  required
                  autoComplete="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Marie Josette Pierre"
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-[#001F3F]/40 focus:ring-2 focus:ring-[#001F3F]/10"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-widest text-slate-500">
                  {t({ fr: "Nom de l'entreprise", ht: 'Non antrepriz la' })}
                </label>
                <input
                  type="text"
                  value={businessName}
                  onChange={(e) => setBusinessName(e.target.value)}
                  placeholder={t({ fr: 'Mon Entreprise', ht: 'Mon Antrepriz' })}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-[#001F3F]/40 focus:ring-2 focus:ring-[#001F3F]/10"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-widest text-slate-500">
                  {t({ fr: 'Email', ht: 'Imèl' })}
                </label>
                <input
                  type="email"
                  required
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
                    required
                    autoComplete="new-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Au moins 6 caractères"
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
                {loading ? (
                  <>
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                    {t({ fr: 'Création en cours...', ht: 'Kreyasyon an kou...' })}
                  </>
                ) : (
                  t({ fr: 'Créer mon compte', ht: 'Kreye kont mwen' })
                )}
              </button>

              <p className="text-center text-sm text-slate-500">
                {t({ fr: 'Déjà un compte ?', ht: 'Deja gen yon kont ?' })} 
                <Link href="/auth/login" className="font-semibold text-[#001F3F] hover:underline">
                  {t({ fr: 'Se connecter', ht: 'Konekte' })}
                </Link>
              </p>
            </form>
          </div>
        </div>
      </main>
    );
  }

  // ── ÉTAPE 2 : Vérifiez votre email ───────────────────────────────────────────
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-10">
      <div className="w-full max-w-md">

        <div className="mb-8 flex flex-col items-center gap-3">
          <Logo size="h-14 w-14" />
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm space-y-6">

          {/* Icon + titre */}
          <div className="flex flex-col items-center gap-4 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-50 border border-blue-100">
              <svg className="h-8 w-8 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-800">{t({ fr: 'Vérifiez votre email !', ht: 'Verifye imèl ou !' })}</h2>
              <p className="mt-2 text-sm text-slate-500 leading-relaxed">
                {t({ fr: 'Votre compte a été créé. Un email de confirmation a été envoyé à :', ht: 'Kont ou te kreye. Yo voye yon imèl konfimasyon nan :' })}
              </p>
              <p className="mt-1 font-semibold text-[#001F3F]">{email}</p>
            </div>
          </div>

          {/* Instructions */}
          <div className="rounded-xl border border-slate-100 bg-slate-50 p-4 space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">{t({ fr: 'Étapes à suivre', ht: 'Etap pou swiv' })}</p>
            <ol className="space-y-2 text-sm text-slate-600">
              <li className="flex items-start gap-2">
                <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-[#001F3F] text-[10px] font-bold text-white">1</span>
                {t({ fr: 'Ouvrez votre boîte mail', ht: 'Louvri bwat imèl ou' })}
              </li>
              <li className="flex items-start gap-2">
                <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-[#001F3F] text-[10px] font-bold text-white">2</span>
                {t({ fr: "Trouvez l'email de", ht: 'Jwenn imèl la nan' })} <strong>ProfitPilot</strong> {t({ fr: "(vérifiez aussi les", ht: "(tcheke tou" })} <strong>{t({ fr: 'Spams', ht: 'Spams' })}</strong>
              </li>
              <li className="flex items-start gap-2">
                <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-[#001F3F] text-[10px] font-bold text-white">3</span>
                Cliquez sur <strong>"Confirmer mon email"</strong>
              </li>
              <li className="flex items-start gap-2">
                <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-[#001F3F] text-[10px] font-bold text-white">4</span>
                {t({ fr: 'Revenez ici et connectez-vous', ht: 'Retounen isit epi konekte' })}
              </li>
            </ol>
          </div>

          {/* Resend */}
          {resendOk ? (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-center text-sm text-emerald-700 font-medium">
              ✅ {t({ fr: 'Email renvoyé avec succès !', ht: 'Imèl voye ak siksè !' })}
            </div>
          ) : (
            <button
              type="button"
              onClick={handleResend}
              disabled={resending}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-600 transition hover:bg-slate-50 disabled:opacity-60"
            >
              {resending ? (
                <>
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-slate-600" />
                  {t({ fr: 'Envoi...', ht: 'Anvwa...' })}
                </>
              ) : (
                t({ fr: '✉️ Renvoyer l\'email de confirmation', ht: '✉️ Voye imèl konfimasyon an ankò' })
              )}
            </button>
          )}

          {error && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
              {error}
            </div>
          )}

          {/* Go to login */}
          <Link
            href="/auth/login"
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#001F3F] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#002D5B]"
          >
            {t({ fr: 'J\'ai confirmé → Me connecter', ht: 'Mwen konfime → Konekte mwen' })}
          </Link>
        </div>
      </div>
    </main>
  );
}

export default function RegisterPage() {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-200 border-t-[#001F3F]" /></div>}>
      <RegisterForm />
    </Suspense>
  );
}