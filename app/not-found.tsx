'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

// Any unknown URL → silently redirect to dashboard.
// 404s in this app are always either a stale link or a build issue — never a page
// the user can fix themselves by reading an error screen.
export default function NotFound() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/dashboard');
  }, [router]);

  // Show nothing while redirecting
  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
    </div>
  );
}
