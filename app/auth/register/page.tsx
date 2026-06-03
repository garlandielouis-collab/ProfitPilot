'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabase } from '../../../lib/supabaseClient';
import { Logo } from '../../../components/Logo';

function translateError(msg: string): string {
  const m = msg.toLowerCase();
  if (m.includes('user already registered') || m.includes('already registered'))
    return 'Un compte existe déjà avec cet email. Connectez-vous.';
  if (m.includes('password') && m.includes('short'))
    return 'Le mot de passe doit contenir au moins 6 caractères.';
  if (m.includes('invalid email'))
    return 'Adresse email invalide.';
  if (m.includes('too many requests') || m.includes('rate limit'))
    return 'Trop de tentatives. Attendez quelques minutes.';
  return msg;
}

type Step = 'form' | 'check-email' | 'success';

export default function RegisterPage() {
  const router = useRouter();

  const [step,     setStep]     = useState<Step>('form');
  const [name,     setName]     = useState('');
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState('');
  const [resendOk, setResendOk] = useState(false);
  const [resending, setResending] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (password.length < 6) {
      setError('Le mot de passe doit contenir au moins 6 caractères.');
      return;
    }

    setLoading(true);

    const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
      email:   email.trim(),
      password,
      options: { data: { full_name: name.trim() } },
    });

    if (signUpError) {
      setError(translateError(signUpError.message));
      setLoading(false);
      return;
    }

    // Si Supabase a déjà confirmé l'email (confirmation désactivée dans le dashboard)
    // → la session est active immédiatement
    if (signUpData.session) {
      // Attendre que les cookies soient sauvegardés avant de rediriger
      await new Promise(resolve => setTimeout(resolve, 500));
      router.replace('/dashboard');
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
    else setError(translateError(error.message));
  }

  // ── ÉTAPE 1 : Formulaire ─────────────────────────────────────────────────────
  if (step === 'form') {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-10">
        <div className="w-full max-w-md">

          <div className="mb-8 flex flex-col items-center gap-3">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#001F3F] text-xl font-bold text-white shadow-lg">
              PP
            </div>
            <div className="text-center">
              <h1 className="text-2xl font-bold text-[#001F3F]">ProfitPilot</h1>
              <p className="mt-1 text-sm text-slate-500">Créez votre compte gratuitement</p>
            </div>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-widest text-slate-500">
                  Nom complet
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
                  Email
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
                  Mot de passe
                </label>
                <input
                  type="password"
                  required
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Au moins 6 caractères"
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-[#001F3F]/40 focus:ring-2 focus:ring-[#001F3F]/10"
                />
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
                    Création en cours...
                  </>
                ) : (
                  'Créer mon compte'
                )}
              </button>

              <p className="text-center text-sm text-slate-500">
                Déjà un compte ?{' '}
                <Link href="/auth/login" className="font-semibold text-[#001F3F] hover:underline">
                  Se connecter
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
              <h2 className="text-xl font-bold text-slate-800">Vérifiez votre email !</h2>
              <p className="mt-2 text-sm text-slate-500 leading-relaxed">
                Votre compte a été créé. Un email de confirmation a été envoyé à :
              </p>
              <p className="mt-1 font-semibold text-[#001F3F]">{email}</p>
            </div>
          </div>

          {/* Instructions */}
          <div className="rounded-xl border border-slate-100 bg-slate-50 p-4 space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Étapes à suivre</p>
            <ol className="space-y-2 text-sm text-slate-600">
              <li className="flex items-start gap-2">
                <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-[#001F3F] text-[10px] font-bold text-white">1</span>
                Ouvrez votre boîte mail
              </li>
              <li className="flex items-start gap-2">
                <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-[#001F3F] text-[10px] font-bold text-white">2</span>
                Trouvez l'email de <strong>ProfitPilot</strong> (vérifiez aussi les <strong>Spams</strong>)
              </li>
              <li className="flex items-start gap-2">
                <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-[#001F3F] text-[10px] font-bold text-white">3</span>
                Cliquez sur <strong>"Confirmer mon email"</strong>
              </li>
              <li className="flex items-start gap-2">
                <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-[#001F3F] text-[10px] font-bold text-white">4</span>
                Revenez ici et connectez-vous
              </li>
            </ol>
          </div>

          {/* Resend */}
          {resendOk ? (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-center text-sm text-emerald-700 font-medium">
              ✅ Email renvoyé avec succès !
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
                  Envoi...
                </>
              ) : (
                '✉️ Renvoyer l\'email de confirmation'
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
            J'ai confirmé → Me connecter
          </Link>
        </div>
      </div>
    </main>
  );
}
