# 🔴 DEBUG: user_id is NULL - Complete Diagnostic

## Le Problème
```
Même connecté → auth.getUser() retourne NULL
Même après login → user_id = NULL dans les requêtes
```

## Causes Possibles (par ordre de probabilité)

### ❌ Cause 1: Cookies non sauvegardés après login (PLUS PROBABLE)
Après `signInWithPassword()`, Supabase crée les cookies, MAIS:
- Le navigateur ne les reçoit pas
- OU ils ne sont pas stockés
- OU ils sont supprimés immédiatement

### ❌ Cause 2: Client Supabase browser mal configuré
`lib/supabaseClient.ts` peut ne pas être configuré pour:
- Envoyer les cookies
- Les lire depuis le navigateur

### ❌ Cause 3: Pas d'utilisateur créé dans Supabase
- Pas encore d'utilisateur dans Supabase auth
- Ou le register ne fonctionne pas

### ❌ Cause 4: Middleware intercepte et supprime la session
- Middleware crée un conflit avec la session
- Ou redirige avant que les cookies soient sauvegardés

---

## 🔍 DIAGNOSTIC STEP-BY-STEP

### ÉTAPE 1: Vérifier que vous avez un compte Supabase

**Action**: Allez à Supabase Dashboard:
```
1. https://app.supabase.com/
2. Votre projet
3. Authentication → Users
4. Cherchez votre email

✅ SI vous voyez votre email → Un compte existe
❌ SI liste vide → Vous n'avez pas créé de compte
```

**SI PAS DE COMPTE**: Allez à `/auth/register` et créez un compte d'abord.

---

### ÉTAPE 2: Vérifier que le login crée des cookies

**Action**: Testez le login avec DevTools:

```bash
1. Ouvrez http://localhost:3000/auth/login
2. Ouvrez DevTools (F12)
3. Allez à: Console
4. Avant de login, exécutez:
   console.log(document.cookie)
   
5. Vous devez voir: (rien ou vieux cookies)
```

**Action**: Maintenant connectez-vous:
```bash
1. À la page login, entrez email + password
2. Cliquez "Se connecter"
3. ATTENDEZ 2 secondes
4. Exécutez dans la console:
   console.log(document.cookie)
   
✅ RÉSULTAT ATTENDU: Vous devez voir "sb-..." cookie
❌ SI vide: Les cookies ne sont pas sauvegardés
```

---

### ÉTAPE 3: Vérifier que les cookies sont envoyés au serveur

**Action**: Regardez les cookies dans Network:

```bash
1. DevTools → Network tab
2. Cliquez sur n'importe quelle requête à votre serveur
3. Allez à: Headers
4. Cherchez: "Cookie: sb-..."

✅ RÉSULTAT ATTENDU: Vous voyez "Cookie: sb-[projet]-auth-token=..."
❌ SI absent: Les cookies ne sont pas envoyés au serveur
```

---

### ÉTAPE 4: Vérifier que Supabase client browser envoie les cookies

**Fichier**: `lib/supabaseClient.ts`

```typescript
// ❌ MAUVAIS (ne sauvegarde pas les cookies)
const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

// ✅ CORRECT (sauvegarde les cookies)
const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  // (pas besoin de config custom pour browser)
)
```

**Cherchez**: Votre fichier a-t-il cette configuration?

---

### ÉTAPE 5: Vérifier que middleware ne casse pas la session

**Action**: Testez SANS middleware:

```bash
# Temporairement, renommez le middleware
1. Renommez: middleware.ts → middleware.ts.bak
2. Redémarrez le serveur
3. Testez le login

✅ SI ça marche maintenant → Middleware casse la session
❌ SI toujours NULL → Le problème est ailleurs
```

---

### ÉTAPE 6: Vérifier que le login appelle router.push()

**Fichier**: `app/auth/login/page.tsx`

Cherchez cette partie:
```typescript
async function handleSubmit(e: React.FormEvent) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email: email.trim().toLowerCase(),
    password: password,
  });

  if (error) {
    setError(error.message);
    return;
  }

  // ✅ DOIT AVOIR CETTE LIGNE:
  router.push('/dashboard');  // ← Cette redirection
}
```

**SI MANQUANT**: Le login réussit mais ne redirige pas → Les cookies ne sont jamais créés.

---

### ÉTAPE 7: Vérifier qu'il y a une ATTENTE après le login

```typescript
// ❌ MAUVAIS (pas d'attente pour les cookies)
const { data, error } = await supabase.auth.signInWithPassword(...)
router.push('/dashboard')  // Trop rapide!

// ✅ CORRECT (attente pour les cookies)
const { data, error } = await supabase.auth.signInWithPassword(...)
// Attendre un peu pour que les cookies soient sauvegardés
await new Promise(r => setTimeout(r, 1000))
router.push('/dashboard')
```

---

## 🔧 FIXES À APPLIQUER

### FIX 1: Vérifier lib/supabaseClient.ts

**Fichier**: `lib/supabaseClient.ts`

Devrait ressembler à ceci:
```typescript
'use client';

import { createBrowserClient } from '@supabase/ssr';

export const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);
```

**SI C'EST DIFFÉRENT** → Remplacez avec ce qui est au-dessus.

---

### FIX 2: Ajouter attente après le login

**Fichier**: `app/auth/login/page.tsx`

Trouvez cette section:
```typescript
if (error) {
  setError(error.message);
  return;
}

// AJOUTER CECI:
// Wait for cookies to be set before redirecting
await new Promise(resolve => setTimeout(resolve, 1000));
router.push('/dashboard');
```

---

### FIX 3: Vérifier que register crée un compte

**Fichier**: `app/auth/register/page.tsx`

Doit appeler:
```typescript
const { data, error } = await supabase.auth.signUp({
  email: email.trim().toLowerCase(),
  password: password,
});
```

---

## 🧪 TEST COMPLET

```bash
# ÉTAPE 1: Vérifier les cookies existants
F12 → Application → Cookies → Supprimer tous les "sb-..." cookies

# ÉTAPE 2: Aller à /auth/register
# Créer un NOUVEAU compte (nouveau email)

# ÉTAPE 3: Vous devez être auto-connecté
# ✅ RÉSULTAT ATTENDU: Redirigé à /dashboard
# ❌ SI redirection à /auth/login: Les cookies ne sont pas sauvegardés

# ÉTAPE 4: Tester les cookies
F12 → Application → Cookies
✅ Vous devez voir: sb-[...]-auth-token

# ÉTAPE 5: Tester la creation de conversation
# Allez à /ai-assistant
# Cliquez "Nouvelle conversation"
✅ Doit être créée rapidement
❌ Si "permission denied": user_id toujours NULL
```

---

## 📊 Tableau de Diagnostic

| Étape | Test | Résultat ✅ | Résultat ❌ | Cause |
|-------|------|-----------|-----------|-------|
| 1 | Compte existe dans Supabase | Voir email | Pas dans auth | Pas d'utilisateur créé |
| 2 | Cookies après login | `sb-...` visible | Vide | Supabase ne crée pas les cookies |
| 3 | Cookies envoyés au serveur | `Cookie: sb-...` dans headers | Absent | Navigateur ne les envoie pas |
| 4 | Client browser configuré | Pas d'erreur Supabase | Erreur auth | Config client mauvaise |
| 5 | Middleware ne casse pas | Marche sans middleware | Toujours NULL | Middleware interfère |
| 6 | Login appelle router.push | Redirection à /dashboard | Pas de redirection | Code login mauvais |
| 7 | Attente pour cookies | Cookies sauvegardés | Redirection trop rapide | Pas d'attente |

---

## 🚨 Les Causes les Plus Communes

### Cause #1: MANQUE D'ATTENTE APRÈS LOGIN (80% des cas)
```typescript
// MAUVAIS - Redirection immédiate
await supabase.auth.signInWithPassword(...)
router.push('/dashboard')  // ← Les cookies ne sont pas encore sauvegardés!

// CORRECT - Attendre un peu
await supabase.auth.signInWithPassword(...)
await new Promise(r => setTimeout(r, 1000))
router.push('/dashboard')
```

### Cause #2: COOKIES BLOQUÉS PAR NAVIGATEUR
- Vérifiez que les cookies sont activés
- Vérifiez qu'il n'y a pas de VPN qui bloque les cookies
- Essayez en mode incognito (pas d'extensions)

### Cause #3: MIDDLEWARE CASSE LA SESSION
- Renommez `middleware.ts` en `middleware.ts.bak`
- Redémarrez le serveur
- Testez le login
- SI ça marche → Middleware est le problème

### Cause #4: SUPABASE CLIENT PAS CONFIGURÉ
- Vérifiez `lib/supabaseClient.ts`
- Doit créer le client avec les bonnes clés
- Doit être `createBrowserClient` (pas `createServerClient`)

---

## 🎯 Prochaines Étapes

1. **Exécutez chaque ÉTAPE du diagnostic**
2. **Identifiez exactement où ça casse** (à quelle étape)
3. **Appliquez le FIX correspondant**
4. **Testez à nouveau**

**NE PASSEZ PAS à l'étape suivante jusqu'à ce que l'étape actuelle réussisse!**

---

## 📞 Si Vous Êtes Bloqué

À quelle étape le diagnostic échoue?

1. Cookies non visibles après login? → FIX 2 (ajouter attente)
2. Cookies créés mais pas envoyés au serveur? → Vérifier navigateur settings
3. Middleware casse la session? → Renommer middleware.ts
4. Pas d'utilisateur créé? → Aller à /auth/register et créer un compte

**Dites-moi à quelle étape ça échoue et je vous aide!**
