'use server';

import { cookies } from 'next/headers';

export default async function CookiesDebugPage() {
  const cookieStore = await cookies();
  const allCookies = cookieStore.getAll();

  const supabaseCookies = allCookies.filter(c => c.name.startsWith('sb-'));
  const jwtCookie = allCookies.find(c => c.name.includes('access-token') || c.name.includes('auth'));

  return (
    <div style={{ padding: '40px', fontFamily: 'monospace' }}>
      <h1>🍪 Cookies Debug (Server-Side)</h1>

      <div style={{ marginTop: '20px', padding: '20px', backgroundColor: '#f0f0f0', borderRadius: '8px' }}>
        <h2>All Cookies ({allCookies.length} total):</h2>
        <pre>
          {allCookies.map(c => `${c.name} = ${c.value.substring(0, 50)}...`).join('\n')}
        </pre>
      </div>

      <div style={{ marginTop: '20px', padding: '20px', backgroundColor: '#fff3cd', borderRadius: '8px' }}>
        <h2>Supabase Cookies ({supabaseCookies.length}):</h2>
        {supabaseCookies.length === 0 ? (
          <p style={{ color: 'red' }}>❌ NO SUPABASE COOKIES FOUND!</p>
        ) : (
          <pre>
            {supabaseCookies.map(c => `✅ ${c.name} = ${c.value.substring(0, 100)}...`).join('\n')}
          </pre>
        )}
      </div>

      <div style={{ marginTop: '20px', padding: '20px', backgroundColor: '#d1ecf1', borderRadius: '8px' }}>
        <h2>JWT Cookie:</h2>
        {jwtCookie ? (
          <pre>
            ✅ {jwtCookie.name} = {jwtCookie.value.substring(0, 100)}...
          </pre>
        ) : (
          <p style={{ color: 'red' }}>❌ NO JWT COOKIE FOUND!</p>
        )}
      </div>

      <div style={{ marginTop: '20px', padding: '20px', backgroundColor: '#f8d7da', borderRadius: '8px' }}>
        <h2>Diagnosis:</h2>
        {supabaseCookies.length === 0 ? (
          <>
            <p>❌ <strong>Supabase cookies are missing on the server!</strong></p>
            <p>This means:</p>
            <ul>
              <li>Cookies are not being sent from browser to server</li>
              <li>OR cookies are not being stored after login</li>
              <li>This is why auth.uid() is NULL in PostgreSQL</li>
            </ul>
          </>
        ) : (
          <>
            <p>✅ Supabase cookies ARE present on the server</p>
            <p>If auth.uid() is still NULL, the problem is in:</p>
            <ul>
              <li>How createServerClient reads the cookies</li>
              <li>JWT validation in Supabase</li>
              <li>Next.js cookie configuration</li>
            </ul>
          </>
        )}
      </div>
    </div>
  );
}
