const PUBLIC_APP_PATHS = [
  '/',
  '/pricing',
  '/checkout',
  '/auth/login',
  '/auth/register',
  '/auth/callback',
  '/auth/forgot-password',
  '/auth/reset-password',
  '/auth/accept-invitation',
  '/onboarding',
  '/blog',
  '/faq',
  '/guide',
  '/legal',
  '/updates',
  '/store',
  '/apercu',
] as const;

export function isPublicAppPath(pathname: string | null | undefined): boolean {
  if (!pathname) return false;

  const normalized = pathname.startsWith('/') ? pathname : `/${pathname}`;
  return PUBLIC_APP_PATHS.some((route) => {
    if (route === '/') return normalized === '/';
    if (route === '/store' || route === '/apercu') {
      return normalized === route || normalized.startsWith(`${route}/`);
    }
    return normalized === route || normalized.startsWith(`${route}/`);
  });
}

export { PUBLIC_APP_PATHS };
