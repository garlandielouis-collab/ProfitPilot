'use client';

import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';

export default function DebugPage() {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function checkAuth() {
      try {
        const { data: { user }, error } = await supabase.auth.getUser();

        if (error) {
          setError(`Auth error: ${error.message}`);
        } else if (user) {
          setUser(user);
          console.log('✅ User detected:', user.id);
        } else {
          setError('User is NULL - session not injected!');
          console.log('❌ User is NULL');
        }
      } catch (err: any) {
        setError(`Exception: ${err.message}`);
      } finally {
        setLoading(false);
      }
    }

    checkAuth();
  }, []);

  return (
    <div style={{ padding: '20px', fontFamily: 'monospace' }}>
      <h1>🔍 Session Debug Page</h1>

      <div style={{ border: '1px solid #ccc', padding: '10px', marginTop: '20px' }}>
        <h2>Status:</h2>
        {loading && <p>🔄 Checking session...</p>}

        {error && (
          <div style={{ color: 'red' }}>
            <p>❌ {error}</p>
          </div>
        )}

        {user && (
          <div style={{ color: 'green' }}>
            <p>✅ Authenticated!</p>
            <p>User ID: {user.id}</p>
            <p>Email: {user.email}</p>
            <p>Created At: {user.created_at}</p>
          </div>
        )}
      </div>

      <div style={{ marginTop: '20px', padding: '10px', backgroundColor: '#f0f0f0' }}>
        <h3>What This Means:</h3>
        {user && (
          <ul>
            <li>✅ Middleware IS working</li>
            <li>✅ Cookies ARE being injected</li>
            <li>✅ Session is active</li>
            <li>Next step: Check if RLS policies are correct in Supabase</li>
          </ul>
        )}
        {error && (
          <ul>
            <li>❌ Middleware NOT working properly</li>
            <li>❌ Cookies NOT being injected</li>
            <li>❌ Session NOT active</li>
            <li>Next step: Debug middleware.ts</li>
          </ul>
        )}
      </div>

      <div style={{ marginTop: '20px', backgroundColor: '#ffffcc', padding: '10px' }}>
        <h3>Console Output:</h3>
        <p>Open DevTools (F12) → Console tab to see the log messages</p>
        <code>✅ User detected: [your-user-id]</code>
        <p>OR</p>
        <code>❌ User is NULL</code>
      </div>
    </div>
  );
}
