/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  // ── URL aliases / redirects ───────────────────────────────────
  async redirects() {
    return [
      // French/Creole short names → real routes
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
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'mmrqfrshuroiirhmwywy.supabase.co',
        pathname: '/storage/v1/object/public/**',
      },
    ],
  },

  // ── Turbopack (Next 16 default) ───────────────────────────────
  turbopack: {},

  // ── Tree-shaking des grosses librairies ───────────────────────
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
    ],
  },
};

export default nextConfig;
