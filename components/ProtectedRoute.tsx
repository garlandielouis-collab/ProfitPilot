'use client';

import { useAuth } from '../lib/useAuth';

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();

  if (!user) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#001F3F] border-t-transparent" />
      </div>
    );
  }

  return <>{children}</>;
}
