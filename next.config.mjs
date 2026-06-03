/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

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
