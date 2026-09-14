# Migrations à coller dans le SQL Editor

Les migrations de ce dossier ne sont **pas** appliquées automatiquement : il n'y
a ni `supabase db push`, ni psql, ni endpoint SQL depuis le poste de dev. Chaque
fichier se colle à la main dans le SQL Editor de Supabase.

D'où ce fichier : savoir, sans deviner, ce qui reste à coller.

## État vérifié le 13/09/2026

Vérification faite depuis le poste, avec la clé de service, en lisant l'API
(présence d'une fonction, d'une table, d'une colonne) — aucune donnée modifiée.

| Migration | État | Comment c'est vérifié |
|---|---|---|
| … jusqu'à `20260910` | appliquée | tables des lots précédents présentes |
| `20260911_document_center_foundation` | **appliquée** | `document_types`, `document_permissions` répondent |
| `20260911_views_multidevise` | **À COLLER** | `fn_to_business_currency` absente (PGRST202) |
| `20260912_creances_confirmation_taux` | **À COLLER** | idem — c'est elle qui (re)crée la fonction |
| `20260912_document_center_relations` | **appliquée** | `document_links`, `document_versions` répondent |
| `20260913_clients_multidevise` | **À COLLER** | elle appelle `fn_to_business_currency`, absente : sa création aurait échoué |
| `20260913_document_templates` | **appliquée** | `document_templates` répond |
| `20260913_views_security_invoker` | **inconnu — À COLLER** | `security_invoker` ne se lit pas par l'API ; la clé de service contourne la RLS de toute façon |
| `20260914_document_requirements` | **appliquée** | `document_requirements` répond |
| `20260915_store_templates_catalogue` | **appliquée** | `store_templates.family` répond |
| `20260916_store_presentation_credit` | **appliquée** | `ai_credit_costs` contient `store_presentation` |
| `20260917_review_requests` | **À COLLER** | `orders.delivered_at` n'existe pas (400) |

## Dans cet ordre

1. **`20260913_views_security_invoker.sql`** — *le plus urgent, et indépendant*
   `security_invoker` sur 16 vues. Sans elle, huit vues (`v_grand_livre`,
   `v_balance_verification`, `v_dashboard_kpi`, `v_monthly_pnl`, `v_top_products`,
   `v_top_products_margin`, `v_supplier_debt_summary`, `v_ap_aging`) sont lisibles
   par **n'importe quel compte connecté**, toutes entreprises confondues, depuis
   le `GRANT ALL` du 13/07. L'inscription étant libre, un inconnu peut créer un
   compte et lire le grand livre des autres.
   *Attendu :* 17 lignes, toutes `{security_invoker=on}` — sauf
   `v_customer_rankings`, qui le devient à l'étape 3.
   *Aucun écran ne lit ces huit vues : rien ne casse.*

2. **`20260911_views_multidevise.sql`** puis **`20260912_creances_confirmation_taux.sql`**
   Créent `fn_to_business_currency` et refont `v_monthly_kpis`,
   `v_product_profitability`, `v_receivables`, `confirm_store_order`.
   Sans elles : le pilotage additionne encore gourdes et dollars comme si
   1 $ = 1 G, les ventes annulées restent des créances, et une commande boutique
   confirmée copie le prix d'achat sans le convertir.
   Le code fonctionne avant comme après — seuls les chiffres changent.

3. **`20260913_clients_multidevise.sql`**
   `v_customer_rankings` convertie, ventes annulées et remboursées exclues,
   `security_invoker` posé. **Dépend de l'étape 2** (`fn_to_business_currency`).

4. **`20260917_review_requests.sql`**
   `orders.delivered_at` et `orders.review_email_sent_at`. Sans elles, la relance
   « laissez un avis » du cron quotidien ne part jamais : la lecture échoue et
   le balayage s'arrête sans bruit (`lib/reviewRequestSweep.ts`).

## Refaire la vérification

```bash
# depuis la racine, avec .env.local chargé
curl -s -X POST "$NEXT_PUBLIC_SUPABASE_URL/rest/v1/rpc/fn_to_business_currency" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{"p_amount":10,"p_from_currency":"USD","p_to_currency":"HTG","p_rate":130}'
# 1300 → étape 2 appliquée ; PGRST202 → pas encore

curl -s -o /dev/null -w "%{http_code}\n" \
  "$NEXT_PUBLIC_SUPABASE_URL/rest/v1/orders?select=delivered_at&limit=0" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY"
# 200 → étape 4 appliquée ; 400 → pas encore
```

Pour `security_invoker`, seul le SQL Editor répond :

```sql
SELECT c.relname, c.reloptions
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
 WHERE n.nspname = 'public' AND c.relkind = 'v' AND c.relname LIKE 'v\_%'
 ORDER BY 1;
```
