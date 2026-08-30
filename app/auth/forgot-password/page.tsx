'use client';

// ─────────────────────────────────────────────────────────────────────────────
// Mot de passe oublié — le chemin qui n'existait pas (§3.1)
//
// « On dessine l'écran idéal et on oublie les chemins réels : pas de bouton
//   passer, pas de recherche quand la liste préremplie ne suffit pas, pas
//   d'état caché, pas de retour possible. »
//
// L'écran de connexion n'avait aucun lien « mot de passe oublié », et aucune
// page derrière. Un marchand qui oubliait son mot de passe était simplement
// dehors, avec ses chiffres à l'intérieur. Un flux se conçoit du premier jour
// au pire jour — celui-ci est le pire jour.
//
// Le compte se récupère par e-mail, y compris pour qui se connecte au numéro :
// c'est le seul canal que nous contrôlons sans fournisseur SMS. On le dit
// franchement plutôt que de laisser chercher.
// ─────────────────────────────────────────────────────────────────────────────

import { useState } from 'react';
import Link from 'next/link';
import { MailCheck } from 'lucide-react';
import { supabase } from '../../../lib/supabaseClient';
import { Logo } from '../../../components/Logo';
import { useLanguage } from '../../../components/LanguageWrapper';
import { Button, Field } from '../../../components/ds';

export default function ForgotPasswordPage() {
  const { t } = useLanguage();
  const [email, setEmail]     = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent]       = useState(false);
  const [error, setError]     = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!email.trim()) {
      setError(t({ fr: 'Entrez votre adresse e-mail.', ht: 'Antre adrès imèl ou.' }));
      return;
    }
    setLoading(true);
    try {
      const { error: sendErr } = await supabase.auth.resetPasswordForEmail(
        email.trim().toLowerCase(),
        { redirectTo: `${window.location.origin}/auth/reset-password` },
      );
      // On confirme l'envoi même si l'adresse est inconnue : répondre « aucun
      // compte » transformerait cet écran en détecteur de comptes.
      if (sendErr && !/user not found/i.test(sendErr.message)) {
        setError(t({
          fr: 'Envoi impossible pour le moment. Vérifiez votre connexion et réessayez.',
          ht: 'Pa ka voye kounye a. Tcheke koneksyon ou epi reeseye.',
        }));
      } else {
        setSent(true);
      }
    } catch {
      setError(t({
        fr: 'Pas de réseau. Vérifiez votre connexion, puis réessayez.',
        ht: 'Pa gen rezo. Tcheke koneksyon ou, epi reeseye.',
      }));
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-surface px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center gap-2 text-center">
          <Logo size="h-12 w-12" />
          <h1 className="text-screen font-bold text-primary">
            {sent
              ? t({ fr: 'Regardez vos e-mails', ht: 'Gade imèl ou yo' })
              : t({ fr: 'Mot de passe oublié', ht: 'Modpas bliye' })}
          </h1>
          <p className="text-body text-text2">
            {sent
              ? t({ fr: 'Si un compte existe à cette adresse, le lien y est déjà. Regardez aussi dans les spams.', ht: 'Si gen yon kont ak adrès sa a, lyen an deja la. Gade tou nan spam yo.' })
              : t({ fr: 'Nous vous envoyons un lien pour en choisir un nouveau.', ht: 'N ap voye yon lyen pou w chwazi yon lòt.' })}
          </p>
        </div>

        {sent ? (
          <div className="mt-8 space-y-6 text-center">
            <MailCheck className="mx-auto h-10 w-10 text-success" strokeWidth={1.5} aria-hidden />
            <Link href="/auth/login" className="block">
              <Button variant="outline" block>
                {t({ fr: 'Revenir à la connexion', ht: 'Retounen nan koneksyon' })}
              </Button>
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} noValidate className="mt-8 space-y-4">
            <Field
              label={t({ fr: 'Votre e-mail', ht: 'Imèl ou' })}
              hint={t({
                fr: "Même si vous vous connectez avec votre numéro, la récupération passe par l'e-mail de votre compte.",
                ht: 'Menm si w konekte ak nimewo ou, rekiperasyon an pase pa imèl kont ou.',
              })}
              type="email"
              inputMode="email"
              autoComplete="email"
              placeholder="marchand@exemple.ht"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoFocus
            />

            {error && (
              <p role="alert" className="rounded-surface bg-danger/10 px-4 py-3 text-body text-danger">
                {error}
              </p>
            )}

            <Button type="submit" variant="accent" size="lg" block loading={loading}
              loadingLabel={t({ fr: 'Envoi…', ht: 'Ap voye…' })}>
              {t({ fr: 'Envoyer le lien', ht: 'Voye lyen an' })}
            </Button>

            <Link
              href="/auth/login"
              className="pressable block min-h-touch text-center text-note text-text2 underline underline-offset-4"
            >
              {t({ fr: 'Revenir à la connexion', ht: 'Retounen nan koneksyon' })}
            </Link>
          </form>
        )}
      </div>
    </main>
  );
}
