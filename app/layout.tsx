import './globals.css';
import type { Metadata } from 'next';
import { Inter, Plus_Jakarta_Sans } from 'next/font/google';
import { Providers }       from '../components/providers/Providers';
import { LanguageWrapper } from '../components/LanguageWrapper';
import { AppShell }        from '../components/AppShell';
import { RegisterSW }     from '../components/RegisterSW';

const inter = Inter({
  subsets:  ['latin'],
  variable: '--font-inter',
  display:  'swap',
  preload:  false,
  fallback: ['system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
});

const jakarta = Plus_Jakarta_Sans({
  subsets:  ['latin'],
  variable: '--font-jakarta',
  weight:   ['400', '500', '600', '700'],
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

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" className={`${inter.variable} ${jakarta.variable}`} suppressHydrationWarning data-scroll-behavior="smooth">
      <head>
        <link rel="manifest" href="/manifest.json" />
        <link rel="icon" type="image/svg+xml" href="data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><rect width=%22100%22 height=%22100%22 rx=%2220%22 fill=%22%23001F3F%22/><text x=%2250%22 y=%2270%22 font-size=%2260%22 text-anchor=%22middle%22 fill=%22white%22 font-family=%22Arial,sans-serif%22 font-weight=%22bold%22>PP</text></svg>" />
        <link rel="apple-touch-icon" href="data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><rect width=%22100%22 height=%22100%22 rx=%2220%22 fill=%22%23001F3F%22/><text x=%2250%22 y=%2270%22 font-size=%2260%22 text-anchor=%22middle%22 fill=%22white%22 font-family=%22Arial,sans-serif%22 font-weight=%22bold%22>PP</text></svg>" />
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
      </body>
    </html>
  );
}
