import './globals.css';
import type { Metadata } from 'next';
import { Inter, Plus_Jakarta_Sans } from 'next/font/google';
import { Providers }       from '../components/providers/Providers';
import { LanguageWrapper } from '../components/LanguageWrapper';
import { AppShell }        from '../components/AppShell';

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
      <body>
        <Providers>
          <LanguageWrapper>
            <AppShell>{children}</AppShell>
          </LanguageWrapper>
        </Providers>
      </body>
    </html>
  );
}
