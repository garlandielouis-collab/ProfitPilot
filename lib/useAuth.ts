'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from './supabaseClient';

export function useAuth() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);

  useEffect(() => {
    let mounted = true;

    const { data: listener } = supabase.auth.onAuthStateChange((_event: any, session: any) => {
      if (!mounted) return;
      setUser(session?.user ?? null);
    });

    return () => {
      mounted = false;
      listener?.subscription.unsubscribe();
    };
  }, []);

  const requireAuth = () => {
    if (!user) {
      router.replace('/auth/login');
    }
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    router.replace('/auth/login');
  };

  return { user, requireAuth, signOut };
}
