# 🧪 Middleware Test: Is Your Session Being Injected?

## The Test

Your middleware.ts should be injecting the session cookies so Supabase knows who you are.

**If session is NULL → Middleware is broken**  
**If session is NOT NULL → Middleware is working (proceed to RLS debugging)**

---

## Quick Test (3 steps)

### STEP 1: Start the Dev Server
```bash
npm run dev
```

Wait for it to be ready at `http://localhost:3000`

### STEP 2: Login
```
1. Go to http://localhost:3000/auth/login
2. Enter your email and password
3. Click "Se connecter"
4. Wait for redirect to /dashboard
```

### STEP 3: Open Debug Page
```
1. Go to: http://localhost:3000/debug
2. Look at the page:
   - ✅ GREEN text = Session IS injected (middleware working)
   - ❌ RED text = Session is NULL (middleware broken)
3. Open DevTools (F12) → Console
   - Look for: ✅ "User detected: [id]"  
   - OR: ❌ "User is NULL"
```

---

## What to Expect

### ✅ IF SESSION IS DETECTED
```
Page shows: ✅ Authenticated!
Console shows: ✅ User detected: abc-123-def

Next step: Your middleware IS working
           Problem is likely RLS policies in Supabase
```

### ❌ IF SESSION IS NULL
```
Page shows: ❌ User is NULL - session not injected!
Console shows: ❌ User is NULL

Next step: Your middleware is NOT working
           We need to debug middleware.ts
```

---

## Advanced Test (Server-Side)

If you want to also test the server-side detection:

### Open API Test
```
1. After login, go to: http://localhost:3000/api/debug/user
2. Look at the JSON response:
```

**If successful:**
```json
{
  "success": true,
  "user": {
    "id": "your-user-id",
    "email": "your@email.com",
    "created_at": "2026-..."
  },
  "businesses": [...],
  "diagnosis": "✅ Middleware IS injecting session cookies correctly"
}
```

**If failed:**
```json
{
  "success": false,
  "error": "User is NULL - no session detected",
  "diagnosis": "❌ Middleware is NOT injecting session cookies correctly"
}
```

---

## If Middleware IS NOT Working

**Symptoms:**
- Session always NULL
- 403 errors on all queries
- Redirected to login even after logging in

**Possible causes:**
1. Cookies not being saved after login
2. Middleware not reading cookies correctly
3. createServerClient not initialized properly

**To debug:**

### Check 1: Are cookies saved after login?
```
1. F12 → Application → Cookies
2. After login, do you see "sb-..." cookies?
   ✅ YES → Cookies are saved
   ❌ NO → Login isn't saving cookies
```

### Check 2: Is middleware being called?
Add logging to middleware.ts:

```typescript
export async function middleware(request: NextRequest) {
  console.log('🔍 [Middleware] Called for:', request.nextUrl.pathname);
  console.log('🔍 [Middleware] Cookies:', request.cookies.getAll());
  
  // ... rest of middleware
}
```

Then check browser DevTools → Console for the logs.

### Check 3: Is getSupabaseServer working?
Add logging to lib/supabaseServerClient.ts:

```typescript
export async function getSupabaseServer() {
  const cookieStore = await cookies();
  console.log('🔍 [getSupabaseServer] Cookie count:', cookieStore.getAll().length);
  
  // ... rest of function
}
```

---

## Summary

**This test tells you:**
- ✅ If middleware is injecting cookies correctly
- ✅ If the browser is storing cookies properly
- ✅ If the server can read the authenticated user

**If this test passes:** Problem is RLS policies (database side)  
**If this test fails:** Problem is middleware/cookies (code side)

---

## Timeline

- **Test takes:** 2-3 minutes
- **Provides clarity on:** Where the real problem is
- **Next step:** Based on test result (RLS or middleware)

Go! Test it now! 🚀
