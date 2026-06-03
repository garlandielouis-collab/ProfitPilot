'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabase } from '../../../lib/supabaseClient';
import { Logo } from '../../../components/Logo';

function translateError(msg: string): string {
  const m = (msg ?? '').toLowerCase();
  if (m.includes('invalid login credentials') || m.includes('invalid credentials'))
    return 'Email ou mot de passe incorrect.';
  if (m.includes('email not confirmed'))
    return 'Email pas encore confirmé. Vérifiez votre boîte mail (+ dossier Spam).';
  if (m.includes('too many requests') || m.includes('rate limit'))
    return 'Trop de tentatives. Attendez 1-2 minutes et réessayez.';
  if (m.includes('user not found'))
    return 'Aucun compte trouvé avec cet email.';
  if (m.includes('network') || m.includes('fetch'))
    return 'Erreur réseau. Vérifiez votre connexion internet.';
  if (m.includes('supabase client not available'))
    return 'Configuration manquante. Vérifiez les variables NEXT_PUBLIC_SUPABASE_*.';
  return msg || 'Erreur inconnue. Vérifiez la console (F12).';
}

export default function LoginPage() {
  const router = useRouter();

  const [email,       setEmail]       = useState('');
  const [password,    setPassword]    = useState('');
  const [loading,     setLoading]     = useState(false);
  const [error,       setError]       = useState('');
  const [emailNeeded, setEmailNeeded] = useState(false);
  const [resendSent,  setResendSent]  = useState(false);
  const [resending,   setResending]   = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setEmailNeeded(false);
    setResendSent(false);

    if (!email.trim()) { setError('Entrez votre email.'); return; }
    if (!password)     { setError('Entrez votre mot de passe.'); return; }

    setLoading(true);

    try {
      const { data, error: authError } = await supabase.auth.signInWithPassword({
        email:    email.trim().toLowerCase(),
        password,
      });

      console.log('[Login] data:', data);
      console.log('[Login] error:', authError);

      if (authError) {
        if (authError.message.toLowerCase().includes('email not confirmed')) {
          setEmailNeeded(true);
        } else {
          setError(translateError(authError.message));
        }
        setLoading(false);
        return;
      }

      // Succès - Attendre que les cookies soient sauvegardés avant de rediriger
      await new Promise(resolve => setTimeout(resolve, 500));
      router.replace('/dashboard');

    } catch (err: any) {
      console.error('[Login] exception:', err);
      setError(translateError(err?.message ?? String(err)));
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
      if (error) setError(translateError(error.message));
      else       setResendSent(true);
    } catch (err: any) {
      setError(translateError(err?.message ?? String(err)));
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
              <h2 className="text-lg font-bold text-slate-800">Confirmez votre email</h2>
              <p className="mt-1 text-sm text-slate-500">
                Email envoyé à <strong className="text-slate-700">{email}</strong>.
                <br />Cliquez le lien dans cet email. Vérifiez aussi les <strong>Spams</strong>.
              </p>
            </div>
          </div>

          {resendSent
            ? <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-center text-sm font-medium text-emerald-700">✅ Email renvoyé !</div>
            : <button type="button" onClick={handleResend} disabled={resending}
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60">
                {resending
                  ? <><span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-slate-600" /> Envoi...</>
                  : 'Renvoyer l\'email de confirmation'}
              </button>
          }

          {error && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">{error}</div>}

          <button type="button" onClick={() => { setEmailNeeded(false); setError(''); }}
            className="w-full text-center text-sm text-slate-400 hover:text-slate-600">
            ← Retour à la connexion
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
            <p className="mt-1 text-sm text-slate-500">Connectez-vous à votre compte</p>
          </div>
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
          <form onSubmit={handleSubmit} noValidate className="space-y-5">

            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-widest text-slate-500">
                Email
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
                Mot de passe
              </label>
              <input
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
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
              {loading
                ? <><span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" /> Connexion...</>
                : 'Se connecter'}
            </button>

          </form>

          <p className="mt-6 text-center text-sm text-slate-500">
            Pas encore de compte ?{' '}
            <Link href="/auth/register" className="font-semibold text-[#001F3F] hover:underline">
              Créer un compte
            </Link>
          </p>
        </div>
      </div>
    </main>
  );
}
