# Diagnostic Complet: Authentification et Session

## 🚨 PROBLÈME IDENTIFIÉ

`auth.uid()` est **NULL** dans les requêtes Supabase.
- Cela signifie que les cookies de session ne sont pas transmis
- OU que l'utilisateur n'est pas connecté
- OU que le middleware ne gère pas correctement la session

## ✅ Solution Implémentée

### 1. **Middleware.ts Créé**
- Fichier: `middleware.ts` (à la racine du projet)
- Gère les redirections basées sur l'authentification
- Gère les cookies de session
- Protège les routes privées

**Que fait le middleware**:
```
- User accède à /ai-assistant sans être connecté?
  → Redirige vers /auth/login
  
- User est connecté et accède à /auth/login?
  → Redirige vers /dashboard
  
- User est connecté et accède à /ai-assistant?
  → Laisse passer + injecte les cookies de session
```

### 2. **Page de Login Existante**
- Chemin: `/app/auth/login/page.tsx`
- Utilise `supabase.auth.signInWithPassword()`
- Valide l'authentification

### 3. **Composant ProtectedRoute Existant**
- Chemin: `/components/ProtectedRoute.tsx`
- Protège les routes côté client
- Redirige vers `/auth/login` si pas connecté

---

## 📋 Flux d'Authentification Correct

### Avant (CASSÉ):
```
User accesse /ai-assistant
  ↓
Page charge (pas de vérification)
  ↓
Appel à supabase.from('ai_conversations').select()
  ↓
auth.uid() = NULL (pas de session injectée)
  ↓
RLS policy: owner_id = NULL
  ↓
❌ "permission denied" (NULL ≠ user_id)
```

### Après (FIXÉ):
```
User accesse /ai-assistant
  ↓
middleware.ts intercepte
  ↓
user = await supabase.auth.getUser()
  ↓
Si user = NULL → Redirige vers /auth/login
Si user ≠ NULL → Injecte cookies de session dans la réponse
  ↓
Page charge avec cookies dans la requête
  ↓
Appel à supabase.from('ai_conversations').select()
  ↓
auth.uid() = [user_id] (cookies injectés!)
  ↓
RLS policy: owner_id = auth.uid() ✅
  ↓
✅ Données retournées
```

---

## 🔍 Vérification étape par étape

### Étape 1: Vérifier que le middleware fonctionne

```bash
# Redémarrez le serveur
npm run dev

# Allez à http://localhost:3000/ai-assistant sans être connecté
# ✅ Vous devez être redirigé à /auth/login automatiquement
```

### Étape 2: Tester le login

```bash
# À /auth/login
# 1. Entrez un email valide
# 2. Entrez un mot de passe
# 3. Cliquez "Se connecter"
# 4. Vous devez être redirigé à /dashboard

# Vérifiez dans les DevTools (F12):
# - Application → Cookies
# - Vous devriez voir: sb-[...] (session cookie)
```

### Étape 3: Vérifier que la session persiste

```bash
# Après connexion:
# - Allez à /ai-assistant
# - ✅ Page doit charger (pas de redirection à login)
# - Les conversations doivent s'afficher

# Si redirection à /auth/login → les cookies ne sont pas sauvegardés
```

### Étape 4: Vérifier que auth.uid() n'est pas NULL

Dans votre navigateur, DevTools, allez à Console et exécutez:

```javascript
// Vérifier que supabase a la session
fetch('/api/auth/user', { method: 'GET' })
  .then(r => r.json())
  .then(data => console.log('Utilisateur:', data))

// Ou testez directement dans une server action
// (créez une conversation - si elle se crée, auth.uid() n'est pas null)
```

---

## 🧪 Tests Complets

### Test 1: Accès non authentifié
```
1. Mode incognito (pas de cookies)
2. Allez à http://localhost:3000/ai-assistant
3. ✅ RÉSULTAT ATTENDU: Redirection automatique à /auth/login
```

### Test 2: Login et redirection
```
1. À /auth/login
2. Entrez credentials
3. Cliquez "Se connecter"
4. ✅ RÉSULTAT ATTENDU: Redirection à /dashboard
5. ✅ Vérifiez cookies dans DevTools
```

### Test 3: Session persiste
```
1. Après login, allez à /ai-assistant
2. F5 pour rafraîchir
3. ✅ RÉSULTAT ATTENDU: Pas de redirection à login
4. ✅ RÉSULTAT ATTENDU: Page charge normalement
```

### Test 4: Créer une conversation (test auth.uid())
```
1. À /ai-assistant (connecté)
2. Cliquez "Nouvelle conversation"
3. ✅ RÉSULTAT ATTENDU: Conversation créée en <1 seconde
4. ✅ RÉSULTAT ATTENDU: Pas d'erreur "permission denied"

Si erreur "permission denied":
  → auth.uid() est encore NULL
  → Vérifiez que les cookies sont dans la requête (DevTools → Network)
```

### Test 5: Lister les messages
```
1. Dans une conversation
2. Les messages doivent s'afficher
3. ✅ RÉSULTAT ATTENDU: Pas d'erreur
```

---

## 🐛 Dépannage

### Problème: Toujours redirigé à /auth/login même après connexion

**Diagnostic**:
- Les cookies ne sont pas sauvegardés après le login
- OU le middleware ne lit pas les cookies correctement

**Solution**:
1. Vérifiez que `/app/auth/login/page.tsx` appelle `router.push()` après login
2. Attendez 1-2 secondes avant la redirection (temps pour sauvegarder les cookies)
3. Vérifiez les variables d'environnement:
   ```bash
   echo %NEXT_PUBLIC_SUPABASE_URL%
   echo %NEXT_PUBLIC_SUPABASE_ANON_KEY%
   ```

### Problème: Permission denied sur les conversations

**Diagnostic**:
- auth.uid() est NULL (session pas injectée)
- Cookies ne sont pas dans la requête

**Solution**:
1. Vérifiez que vous êtes connecté (cookies présents)
2. Vérifiez dans DevTools → Network:
   - Request headers → Cookie
   - Devrait contenir `sb-...` session cookie
3. Si absent, allez à `/auth/login` et connectez-vous à nouveau

### Problème: Erreur "ERREUR CRITIQUE: L'utilisateur n'est pas connecté"

**Diagnostic**:
- Le middleware fonctionne
- Mais une server action reçoit une requête sans cookies

**Causes possibles**:
1. Client-side code n'envoie pas les cookies
2. CORS headers bloquent les cookies
3. Supabase client (browser) pas configuré pour envoyer les cookies

**Solution**:
- Vérifiez `lib/supabaseClient.ts` envoie les credentials:
```typescript
const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)
```

---

## 📊 Architecture de la Session

```
┌─────────────────────────────────────────────────────┐
│                   Utilisateur                        │
│                                                      │
│  Navigateur (cookies automatiquement envoyés)       │
└──────────────────┬──────────────────────────────────┘
                   │
                   │ POST /auth/login
                   ↓
┌──────────────────────────────────────────────────────┐
│              /app/auth/login/page.tsx                │
│                                                      │
│ - supabase.auth.signInWithPassword(email, password) │
│ - Crée session automatiquement dans les cookies    │
│ - router.push('/dashboard')                        │
└──────────────────┬──────────────────────────────────┘
                   │
                   │ Navigateur a maintenant les cookies
                   │ dans: document.cookie
                   │
                   ↓
┌──────────────────────────────────────────────────────┐
│                 middleware.ts                        │
│                                                      │
│ - Intercepte TOUTES les requêtes                    │
│ - Lit les cookies (request.cookies)                 │
│ - Crée Supabase client avec les cookies            │
│ - Appelle auth.getUser() → user ≠ NULL             │
│ - Ajoute les cookies à la réponse                  │
│ - Redirige ou laisse passer                        │
└──────────────────┬──────────────────────────────────┘
                   │
                   ↓
┌──────────────────────────────────────────────────────┐
│            Serveur (Next.js pages/API)              │
│                                                      │
│ - Requête arrive avec cookies                       │
│ - getSupabaseServer() lit les cookies              │
│ - Crée client Supabase avec auth injecté           │
│ - auth.getUser() → user ≠ NULL ✅                  │
│ - RLS: owner_id = auth.uid() ✅                    │
│ - Données retournées ✅                            │
└──────────────────────────────────────────────────────┘
```

---

## ✅ Checklist Finale

- [ ] middleware.ts existe à la racine
- [ ] Login redirect works (/auth/login accessible)
- [ ] Création de conversation réussie (<1s)
- [ ] Liste des messages fonctionne
- [ ] Pas d'erreur "permission denied"
- [ ] Cookies visibles dans DevTools
- [ ] Session persiste après F5
- [ ] Déconnexion redirige à /auth/login

---

## 🎯 Prochaines Étapes

1. **Redémarrez le serveur** (npm run dev)
2. **Testez le login** (allez à /auth/login)
3. **Testez les protections** (accès à /ai-assistant sans login)
4. **Vérifiez les cookies** (DevTools → Application → Cookies)
5. **Testez la création** (nouvelle conversation)
6. **Testez la persistance** (F5, cookies restent)

Si tout fonctionne → ✅ Le problème est résolu!
Si problèmes persistent → Utilisez le dépannage ci-dessus.
