'use client';

/**
 * Aggregator hook — returns current auth user + both sub-hooks
 * so any Settings tab can import a single hook.
 *
 * Usage:
 *   const { userId, profile, prefs } = useSettings();
 */

import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useBusinessProfile } from './useBusinessProfile';
import { usePreferences }     from './usePreferences';

export function useSettings() {
  const [userId,    setUserId]    = useState<string | undefined>(undefined);
  const [userEmail, setUserEmail] = useState<string | undefined>(undefined);
  const [loading,   setLoading]   = useState(true);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }: { data: { user: { id?: string; email?: string } | null } }) => {
      setUserId(data.user?.id);
      setUserEmail(data.user?.email ?? undefined);
      setLoading(false);
    });
  }, []);

  const profile = useBusinessProfile(userId);
  const prefs   = usePreferences(userId);

  return { userId, userEmail, loading, profile, prefs };
}
