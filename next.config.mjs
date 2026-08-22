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
    ];
  },

  // ── Compression gzip/brotli ───────────────────────────────────
  compress: true,

  // ── Image optimization ────────────────────────────────────────
  images: {
    formats: ['image/avif', 'image/webp'],
    minimumCacheTTL: 3600,
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
