import './globals.css';
import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { Providers }       from '../components/providers/Providers';
import { LanguageWrapper } from '../components/LanguageWrapper';
import { AppShell }        from '../components/AppShell';
import { RegisterSW }     from '../components/RegisterSW';
import { AppOnly }        from '../components/AppOnly';
import { OfflineSalesSync } from '../components/offline/OfflineSalesSync';
import { SpacingDebugger } from '../components/dev/SpacingDebugger';

// Une seule famille de police, longtemps (masterclass §10). Plus Jakarta Sans
// était chargée pour les titres et n'a jamais servi : zéro classe `font-display`
// dans le produit. Une deuxième famille dans le bundle, c'est un téléchargement
// de plus sur une connexion irrégulière — pour une différence que personne ne
// voit. « L'association de polices est un art difficile qui rate presque
// toujours au début, et qui n'apporte rien à un marchand qui veut lire son
// chiffre du jour. »
const inter = Inter({
  subsets:  ['latin'],
  variable: '--font-inter',
  display:  'swap',
  preload:  false,
  fallback: ['system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
});

export const metadata: Metadata = {
  title: {
    default:  'ProfitPilot — Gestion Financière Intelligente pour Entrepreneurs Haïtiens',
    template: '%s | ProfitPilot',
  },
  description:
    "ProfitPilot vous permet de gérer ventes, stocks, dettes et finances avec l'IA PilotAI. La solution conçue pour les entrepreneurs haïtiens modernes.",
  keywords: ['ProfitPilot', 'gestion financière', 'Haiti', 'entrepreneuriat', 'ventes', 'stocks', 'PilotAI', 'HTG', 'USD'],
  authors: [{ name: 'ProfitPilot' }],
  openGraph: {
    type:        'website',
    locale:      'fr_HT',
    siteName:    'ProfitPilot',
    title:       'ProfitPilot — Dominez Vos Finances',
    description: 'La solution de gestion intelligente pour les entrepreneurs haïtiens modernes. Ventes, stocks, dettes, rapports HTG/USD et IA.',
  },
  twitter: {
    card:        'summary_large_image',
    title:       'ProfitPilot — Dominez Vos Finances',
    description: 'La solution de gestion intelligente pour les entrepreneurs haïtiens modernes.',
  },
  robots: { index: true, follow: true },
};

/**
 * L’origine de Supabase (sans le chemin), ou `null` si la variable manque.
 * Sert uniquement à ouvrir la connexion d’avance — aucune donnée n’y transite
 * depuis le HTML.
 */
const supabaseOrigin = (() => {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    return url ? new URL(url).origin : null;
  } catch {
    return null;
  }
})();

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" className={inter.variable} suppressHydrationWarning data-scroll-behavior="smooth">
      <head>
        {/*
          La poignée de main avec Supabase, lancée AVANT d’en avoir besoin.

          Tout ce que l’application affiche vient de là : session, commerce,
          offre, chiffres. Le premier appel payait donc DNS + TCP + TLS avant
          même d’émettre sa requête — mesuré entre 0,4 et 1,1 s depuis une
          connexion haïtienne, en plein sur le chemin critique.

          `preconnect` ouvre la connexion pendant que le JavaScript se
          télécharge : quand la première requête part, la route est déjà
          établie. `dns-prefetch` sert de repli aux navigateurs qui ignorent
          `preconnect`. L’hôte vient de la variable publique, rien n’est
          écrit en dur ici.
        */}
        {supabaseOrigin && (
          <>
            <link rel="preconnect" href={supabaseOrigin} crossOrigin="" />
            <link rel="dns-prefetch" href={supabaseOrigin} />
          </>
        )}
        <link rel="manifest" href="/manifest.json" />
        <link rel="icon" type="image/png" href="/ProfitPilot-favicon.png" />
        <link rel="apple-touch-icon" sizes="180x180" href="/ProfitPilot-favicon.png" />
        <meta name="apple-mobile-web-app-title" content="ProfitPilot" />
        <meta name="theme-color" content="#001F3F" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
      </head>
      <body>
        <Providers>
          <LanguageWrapper>
            <AppShell>{children}</AppShell>
          </LanguageWrapper>
        </Providers>
        <RegisterSW />
        {/* Rejeu des ventes saisies hors connexion (Bonus 4).
            Sous `AppOnly` : il rejoue les ventes du MARCHAND, et n'a donc rien
            à faire sur la vitrine que visite son client. */}
        <AppOnly>
          <OfflineSalesSync />
        </AppOnly>
        {/* Le carré rouge, version développeur (masterclass §2) — Maj + G.
            Jamais chez un marchand : la condition retire le composant du
            paquet de production. */}
        {process.env.NODE_ENV === 'development' && <SpacingDebugger />}
      </body>
    </html>
  );
}
