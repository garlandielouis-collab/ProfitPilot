'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from './supabaseClient';

// ── Module-level session cache ─────────────────────────────────────────────
// Populated the very first time getSession() resolves so that subsequent
// useAuth() calls can initialise synchronously (no spinner flash).
let _cachedUser: any = undefined; // undefined = not yet loaded; null = loaded, no session

export function useAuth() {
  const router = useRouter();
  // If we already know the session, start with it; otherwise start undefined
  const [user, setUser] = useState<any>(_cachedUser);
  const loaded = useRef(_cachedUser !== undefined);

  useEffect(() => {
    let mounted = true;

    // 1. Fast path: read session from Supabase's own localStorage cache (<1ms)
    if (!loaded.current) {
      loaded.current = true;
      supabase.auth.getSession().then(({ data: { session } }: any) => {
        if (!mounted) return;
        _cachedUser = session?.user ?? null;
        setUser(_cachedUser);
      });
    }

    // 2. Keep in sync with auth state changes (login / logout / token refresh)
    const { data: listener } = supabase.auth.onAuthStateChange((_event: any, session: any) => {
      if (!mounted) return;
      _cachedUser = session?.user ?? null;
      setUser(_cachedUser);
    });

    return () => {
      mounted = false;
      listener?.subscription.unsubscribe();
    };
  }, []);

  const requireAuth = () => {
    if (!user) router.replace('/auth/login');
  };

  const signOut = async () => {
    _cachedUser = null;
    await supabase.auth.signOut();
    router.replace('/auth/login');
  };

  return { user, requireAuth, signOut };
}
