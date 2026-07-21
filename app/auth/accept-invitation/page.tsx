'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { supabase } from '../../../lib/supabaseClient';
import { Logo } from '../../../components/Logo';

// ── States ────────────────────────────────────────────────────────────────────

type PageState =
  | { phase: 'loading' }
  | { phase: 'invalid'; message: string }
  | { phase: 'form';    email: string; companyName: string }
  | { phase: 'success'; email: string; companyName: string };

// ── Eye icon ─────────────────────────────────────────────────────────────────

function EyeIcon({ open }: { open: boolean }) {
  return open ? (
    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.878 9.878L3 3m6.878 6.878L21 21" />
    </svg>
  ) : (
    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
    </svg>
  );
}

// ── Inner component (uses useSearchParams) ────────────────────────────────────

function AcceptInvitationInner() {
  const params   = useSearchParams();
  const router   = useRouter();
  const token    = params.get('token') ?? '';

  const [state,        setState]        = useState<PageState>({ phase: 'loading' });
  const [password,     setPassword]     = useState('');
  const [confirm,      setConfirm]      = useState('');
  const [showPwd,      setShowPwd]      = useState(false);
  const [showConfirm,  setShowConfirm]  = useState(false);
  const [submitting,   setSubmitting]   = useState(false);
  const [formError,    setFormError]    = useState('');

  // ── Validate token on mount ───────────────────────────────────────────────

  useEffect(() => {
    if (!token) {
      setState({ phase: 'invalid', message: 'Lien d\'invitation invalide ou manquant.' });
      return;
    }

    fetch(`/api/invitations?token=${encodeURIComponent(token)}`)
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok) {
          setState({ phase: 'invalid', message: json.error ?? 'Invitation invalide.' });
        } else {
          setState({ phase: 'form', email: json.email, companyName: json.companyName });
        }
      })
      .catch(() => setState({ phase: 'invalid', message: 'Erreur réseau. Réessayez.' }));
  }, [token]);

  // ── Submit ────────────────────────────────────────────────────────────────

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError('');

    if (password.length < 8) {
      setFormError('Le mot de passe doit contenir au moins 8 caractères.');
      return;
    }
    if (password !== confirm) {
      setFormError('Les mots de passe ne correspondent pas.');
      return;
    }

    setSubmitting(true);

    try {
      const res  = await fetch('/api/invitations', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ token, password }),
      });
      const json = await res.json();

      if (!res.ok) {
        setFormError(json.error ?? 'Une erreur est survenue.');
        setSubmitting(false);
        return;
      }

      // Sign in immediately
      const { error: signInErr } = await supabase.auth.signInWithPassword({
        email:    json.email,
        password,
      });

      if (signInErr) {
        // Account created but sign-in failed → redirect to login
        if (state.phase === 'form') {
          setState({ phase: 'success', email: json.email, companyName: state.companyName });
        }
        return;
      }

      // Success — redirect to dashboard
      if (state.phase === 'form') {
        setState({ phase: 'success', email: json.email, companyName: state.companyName });
      }
      setTimeout(() => router.replace('/dashboard'), 1800);

    } catch {
      setFormError('Erreur réseau. Vérifiez votre connexion.');
      setSubmitting(false);
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  const inp = 'w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-[#001F3F]/40 focus:ring-2 focus:ring-[#001F3F]/10';

  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-50 to-blue-50/30 px-4 py-12">
      <div className="w-full max-w-md">

        {/* Logo */}
        <div className="mb-8 flex flex-col items-center gap-3">
          <Logo size="h-14 w-14" />
          <div className="text-center">
            <h1 className="text-2xl font-bold text-[#001F3F]">ProfitPilot</h1>
            <p className="mt-1 text-sm text-slate-500">Invitation d&apos;équipe</p>
          </div>
        </div>

        {/* ── Loading ── */}
        {state.phase === 'loading' && (
          <div className="flex flex-col items-center gap-4 rounded-3xl border border-slate-200 bg-white p-10 shadow-sm">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-200 border-t-[#001F3F]" />
            <p className="text-sm text-slate-500">Vérification de l&apos;invitation…</p>
          </div>
        )}

        {/* ── Invalid ── */}
        {state.phase === 'invalid' && (
          <div className="rounded-3xl border border-red-200 bg-white p-8 shadow-sm text-center space-y-4">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-red-100">
              <svg className="h-7 w-7 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-800">Invitation invalide</h2>
              <p className="mt-2 text-sm text-slate-500">{state.message}</p>
            </div>
            <a href="/auth/login" className="inline-block rounded-xl bg-[#001F3F] px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-[#002D5B]">
              Se connecter
            </a>
          </div>
        )}

        {/* ── Form ── */}
        {state.phase === 'form' && (
          <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">

            {/* Invitation header */}
            <div className="mb-6 rounded-2xl bg-blue-50 border border-blue-100 px-5 py-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-[#001F3F]">
                  <svg className="h-5 w-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                  </svg>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-widest text-blue-500">Invitation reçue</p>
                  <p className="text-sm font-bold text-[#001F3F]">{state.companyName}</p>
                  <p className="text-xs text-slate-500">{state.email}</p>
                </div>
              </div>
            </div>

            <h2 className="mb-1 text-xl font-bold text-[#001F3F]">Choisissez votre mot de passe</h2>
            <p className="mb-6 text-sm text-slate-500">
              Créez un mot de passe sécurisé pour votre compte. Minimum 8 caractères.
            </p>

            <form onSubmit={handleSubmit} className="space-y-4">

              {/* Email (read-only) */}
              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-widest text-slate-500">Email</label>
                <input value={state.email} readOnly className={`${inp} cursor-not-allowed opacity-60`} />
              </div>

              {/* Password */}
              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-widest text-slate-500">
                  Mot de passe *
                </label>
                <div className="relative">
                  <input
                    type={showPwd ? 'text' : 'password'}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="Minimum 8 caractères"
                    autoComplete="new-password"
                    className={`${inp} pr-11`}
                    required
                  />
                  <button type="button" onClick={() => setShowPwd(v => !v)} tabIndex={-1}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                    <EyeIcon open={showPwd} />
                  </button>
                </div>
                {/* Strength indicator */}
                {password.length > 0 && (
                  <div className="mt-2 flex gap-1">
                    {[1, 2, 3, 4].map((i) => {
                      const strength = Math.min(4, Math.floor(password.length / 3));
                      return (
                        <div key={i} className={`h-1 flex-1 rounded-full transition-colors ${i <= strength
                          ? strength <= 1 ? 'bg-red-400' : strength <= 2 ? 'bg-amber-400' : strength <= 3 ? 'bg-yellow-400' : 'bg-emerald-500'
                          : 'bg-slate-200'}`} />
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Confirm password */}
              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-widest text-slate-500">
                  Confirmer le mot de passe *
                </label>
                <div className="relative">
                  <input
                    type={showConfirm ? 'text' : 'password'}
                    value={confirm}
                    onChange={e => setConfirm(e.target.value)}
                    placeholder="Répétez le mot de passe"
                    autoComplete="new-password"
                    className={`${inp} pr-11 ${confirm && password !== confirm ? 'border-red-300 focus:border-red-400 focus:ring-red-100' : ''}`}
                    required
                  />
                  <button type="button" onClick={() => setShowConfirm(v => !v)} tabIndex={-1}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                    <EyeIcon open={showConfirm} />
                  </button>
                </div>
                {confirm && password !== confirm && (
                  <p className="mt-1 text-xs text-red-500">Les mots de passe ne correspondent pas.</p>
                )}
                {confirm && password === confirm && confirm.length >= 8 && (
                  <p className="mt-1 text-xs text-emerald-600">✓ Les mots de passe correspondent.</p>
                )}
              </div>

              {formError && (
                <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
                  {formError}
                </div>
              )}

              <button
                type="submit"
                disabled={submitting || !password || !confirm}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#001F3F] px-4 py-3.5 text-sm font-bold text-white transition hover:bg-[#002D5B] disabled:opacity-50"
              >
                {submitting ? (
                  <><span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" /> Création du compte…</>
                ) : 'Créer mon compte et rejoindre l\'équipe →'}
              </button>
            </form>

            <p className="mt-4 text-center text-xs text-slate-400">
              Déjà un compte ?{' '}
              <a href="/auth/login" className="text-[#001F3F] font-semibold hover:underline">
                Se connecter
              </a>
            </p>
          </div>
        )}

        {/* ── Success ── */}
        {state.phase === 'success' && (
          <div className="rounded-3xl border border-emerald-200 bg-white p-8 shadow-sm text-center space-y-5">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-100">
              <svg className="h-8 w-8 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div>
              <h2 className="text-xl font-bold text-[#001F3F]">Compte créé avec succès ! 🎉</h2>
              <p className="mt-2 text-sm text-slate-500">
                Bienvenue dans <strong className="text-[#001F3F]">{state.companyName}</strong>.<br />
                Vous allez être redirigé vers le tableau de bord…
              </p>
            </div>
            <div className="flex items-center justify-center gap-2 text-sm text-emerald-600">
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-emerald-200 border-t-emerald-600" />
              Redirection en cours…
            </div>
            <a href="/dashboard" className="inline-block rounded-xl bg-[#001F3F] px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-[#002D5B]">
              Aller au tableau de bord →
            </a>
          </div>
        )}

      </div>
    </main>
  );
}

// ── Export ────────────────────────────────────────────────────────────────────

export default function AcceptInvitationPage() {
  return (
    <Suspense fallback={
      <main className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-200 border-t-[#001F3F]" />
      </main>
    }>
      <AcceptInvitationInner />
    </Suspense>
  );
}
