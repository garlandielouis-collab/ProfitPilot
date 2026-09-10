// Storage images live on the Supabase project host. Derive it from the env var so
// swapping projects does not silently break next/image with an "un-configured host".
const supabaseHost = (() => {
  try {
    return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname;
  } catch {
    return null;
  }
})();

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  // ── URL aliases / redirects ───────────────────────────────────
  async redirects() {
    return [
      { source: '/parametres',    destination: '/settings',              permanent: true },
      { source: '/stocks',        destination: '/inventory',             permanent: true },
      { source: '/ventes',        destination: '/sales',                 permanent: true },
      { source: '/comptabilite',  destination: '/rapports/comptabilite', permanent: true },
      { source: '/marketing',     destination: '/dashboard',             permanent: true },
      { source: '/achats',        destination: '/purchases',             permanent: true },
      { source: '/fournisseurs',  destination: '/suppliers',             permanent: true },
      { source: '/depenses',      destination: '/expenses',              permanent: true },
      { source: '/assistant',     destination: '/ai-assistant',          permanent: true },
      { source: '/pilot',         destination: '/ai-assistant',          permanent: true },
      // L'éditeur de vitrine vit sous /boutique, avec le reste du module
      // boutique. Cette redirection honore l'adresse attendue sans créer un
      // second endroit où l'on configure la même chose.
      { source: '/dashboard/store-builder', destination: '/boutique/builder', permanent: false },
      { source: '/store-builder',           destination: '/boutique/builder', permanent: false },
    ];
  },

  // ── Compression gzip/brotli ───────────────────────────────────
  compress: true,

  // ── Image optimization ────────────────────────────────────────
  images: {
    formats: ['image/avif', 'image/webp'],
    minimumCacheTTL: 3600,

    // Les trois qualités que le code demande réellement, et il FAUT les
    // déclarer.
    //
    // Next 16 a rendu `images.qualities` strict : toute valeur absente de cette
    // liste est refusée, et l'image ne se rend pas. Sans clé, la liste vaut
    // `[75]` — or le produit n'emploie 75 nulle part :
    //
    //   72  le défaut de `StoreImage`. Au-delà, le poids monte plus vite que ce
    //       que l'œil distingue sur une vignette de 300 px — et le poids, sur
    //       une connexion mobile haïtienne, c'est la vente.
    //   80  les bannières, qui occupent l'écran entier au premier coup d'œil.
    //
    // Conséquence de l'oubli : toutes les images de gabarit — bannière,
    // histoire, bande, vignettes de rayon — échouaient sur les 22 gabarits. Les
    // pages rendaient leur texte et leurs cadres vides, ce qui ressemblait à un
    // gabarit cassé et n'était qu'une liste trop courte ici.
    qualities: [72, 75, 80],

    remotePatterns: supabaseHost
      ? [
          {
            protocol: 'https',
            hostname: supabaseHost,
            pathname: '/storage/v1/object/public/**',
          },
        ]
      : [],
  },

  // ── Turbopack ─────────────────────────────────────────────────
  turbopack: {},

  // ── Tree-shaking + bundle splitting ──────────────────────────
  experimental: {
    optimizePackageImports: [
      'recharts',
      'framer-motion',
      'lucide-react',
      '@radix-ui/react-dialog',
      '@radix-ui/react-dropdown-menu',
      '@radix-ui/react-select',
      '@radix-ui/react-tabs',
      'react-markdown',
      '@supabase/supabase-js',
      '@supabase/ssr',
      'sonner',
      'date-fns',
    ],
  },
};

export default nextConfig;
