# ProfitPilot — Architecture UI Comptable
> Design des écrans financiers · Labels simplifiés · Mobile-first

---

## PRINCIPE FONDAMENTAL

Le système comptable est invisible pour l'utilisateur.
Il voit des **actions métier**, pas des **écritures comptables**.

```
CE QUE L'UTILISATEUR FAIT     CE QUE LE MOTEUR FAIT (invisible)
──────────────────────────    ─────────────────────────────────
"Enregistrer une vente"    →  DR Caisse / CR Ventes + DR COGS / CR Stock
"Payer un fournisseur"     →  DR Fournisseurs AP / CR Caisse
"Retirer de l'argent"      →  DR Prélèvements / CR Caisse
"Enregistrer un prêt"      →  DR Banque / CR Emprunt LT
"Payer les salaires"       →  DR Salaires / CR Caisse
```

---

## LEXIQUE UI — Traduction Comptable → Français Simple

| Terme comptable               | Label UI ProfitPilot              | Kreyòl                     |
|-------------------------------|-----------------------------------|---------------------------|
| Accounts Receivable (AR)      | Clients qui vous doivent          | Kliyan ki dwe ou           |
| Accounts Payable (AP)         | Fournisseurs à payer              | Founisè ou dwe             |
| Chart of Accounts             | Plan de comptes                   | Plan kont                  |
| Journal Entry                 | Écriture comptable                | Ekri kontab                |
| Debit                         | (masqué de l'UI)                  | —                          |
| Credit                        | (masqué de l'UI)                  | —                          |
| Cost of Goods Sold (COGS)     | Coût des marchandises vendues     | Koù machandiz yo           |
| Gross Margin                  | Marge brute                       | Majan benefis brit         |
| Net Income                    | Bénéfice net                      | Pwofi nèt                  |
| Cash & Equivalents            | Argent disponible                 | Kòb disponib               |
| Equity                        | Ce que vous possédez vraiment     | Sa ou posede vre           |
| Retained Earnings             | Bénéfices conservés               | Pwofi kenbe                |
| Owner's Withdrawal            | Retrait personnel                 | Retire kòb pèsonèl         |
| Depreciation                  | Amortissement équipements         | Deteryorasyon ekipman      |
| Accounts Aging                | Retards de paiement               | Peman an reta              |
| Trial Balance                 | Vérification des comptes          | Verifye kont yo            |
| Fiscal Year                   | Année comptable                   | Ane kontab                 |
| Accounting Period             | Mois en cours                     | Mwa ki an kous             |

---

## ARCHITECTURE DES ÉCRANS FINANCIERS

### 1. TABLEAU DE BORD (/)

```
┌─────────────────────────────────────────────────┐
│  🏠 Tableau de bord                             │
├──────────┬──────────┬──────────┬────────────────┤
│  Cash    │  Ventes  │  Dépenses│  Bénéfice net  │
│  45,200  │  128,500 │  62,300  │  66,200 HTG    │
│  HTG     │  ce mois │  ce mois │  ▲ +12%        │
├──────────┴──────────┴──────────┴────────────────┤
│  Score Santé: 78/100 🟡 Correct                 │
│  ████████████████░░░░  3 alertes                │
├─────────────────────────────────────────────────┤
│  📊 Revenus vs Dépenses (graphique 6 mois)      │
├─────────────────────────────────────────────────┤
│  ⚡ Alertes Pilot AI                            │
│  ⚠️ Trésorerie: 12 jours restants               │
│  📉 Marge brute: 18% (seuil 20%)                │
└─────────────────────────────────────────────────┘

Source: v_dashboard_kpis + fn_detect_anomalies() + fn_health_score()
```

---

### 2. RAPPORTS FINANCIERS (/reports)

#### 2a — État des Résultats (P&L)

```
┌─────────────────────────────────────────────────┐
│  📈 Résultats du mois                           │
│  Janvier 2026                                   │
├─────────────────────────────────────────────────┤
│  REVENUS                                        │
│    Ventes de produits              128,500      │
│    Services                          8,200      │
│    Livraisons                        3,100      │
│    − Retours                        (1,200)     │
│    ─────────────────────────────────────────    │
│  TOTAL REVENUS                     138,600      │
│                                                 │
│  COÛT DES MARCHANDISES              (58,400)    │
│    ─────────────────────────────────────────    │
│  MARGE BRUTE                        80,200      │
│  Marge: 57.9% 🟢                               │
│                                                 │
│  DÉPENSES OPÉRATIONNELLES                       │
│    Loyer                             (8,500)    │
│    Salaires                         (18,000)    │
│    Marketing                         (3,200)    │
│    Transport                         (2,100)    │
│    Électricité/Internet              (1,800)    │
│    Autres dépenses                   (2,400)    │
│    ─────────────────────────────────────────    │
│  TOTAL DÉPENSES                     (36,000)    │
│                                                 │
│  ══════════════════════════════════════════     │
│  BÉNÉFICE NET                        44,200 HTG │
│  Marge nette: 31.9% 🟢                          │
└─────────────────────────────────────────────────┘

Source: fn_income_statement(business_id, from_date, to_date)
```

#### 2b — Bilan

```
┌─────────────────────────────────────────────────┐
│  📋 Ce que vous possédez (Bilan)                │
│  Au 31 janvier 2026                             │
├───────────────────┬─────────────────────────────┤
│  CE QUE VOUS AVEZ │  CE QUE VOUS DEVEZ          │
│  (Actif)          │  (Passif)                   │
├───────────────────┼─────────────────────────────┤
│  ARGENT           │  FOURNISSEURS               │
│  Caisse  45,200   │  À payer     28,500         │
│  Banque  82,400   │                             │
│  MonCash 12,100   │  EMPRUNTS                   │
│                   │  Prêt banque 150,000        │
│  CLIENTS DÉBITEURS│                             │
│  Impayés 38,900   │  SALAIRES À PAYER           │
│                   │  Ce mois     18,000         │
│  STOCK            │                             │
│  Valeur  156,300  │  ─────────────────────────  │
│                   │  TOTAL DETTES   196,500     │
│  ÉQUIPEMENTS      │                             │
│  Valeur net35,000 │  CE QUE VOUS POSSÉDEZ VRAI  │
│                   │  Capital       100,000      │
│                   │  Bénéfices      73,400      │
│                   │  ─────────────────────────  │
│                   │  TOTAL PROPRE   173,400     │
├───────────────────┼─────────────────────────────┤
│  TOTAL  369,900   │  TOTAL         369,900      │
└───────────────────┴─────────────────────────────┘

✅ Bilan équilibré (Actif = Passif + Capitaux)

Source: fn_balance_sheet(business_id, as_of_date)
```

#### 2c — Cashflow

```
┌─────────────────────────────────────────────────┐
│  💸 Mouvements de trésorerie                    │
│  Janvier 2026                                   │
├─────────────────────────────────────────────────┤
│  ENCAISSEMENTS                                  │
│    Ventes cash              +128,500            │
│    Recouvrement clients      +22,400            │
│    ─────────────────────────────────────────    │
│  TOTAL ENTRÉ               +150,900             │
│                                                 │
│  DÉCAISSEMENTS                                  │
│    Achats fournisseurs       (48,200)           │
│    Salaires payés            (18,000)           │
│    Loyer                      (8,500)           │
│    Autres dépenses            (8,100)           │
│    ─────────────────────────────────────────    │
│  TOTAL SORTI               (82,800)             │
│                                                 │
│  ══════════════════════════════════════════     │
│  VARIATION NETTE TRÉSORERIE   +68,100 HTG       │
│  SOLDE DÉBUT                   71,600           │
│  SOLDE FIN                    139,700           │
└─────────────────────────────────────────────────┘

Source: v_dashboard_kpis + journal_entry_lines (class 5xxx)
```

---

### 3. SCORE DE SANTÉ (/health)

```
┌─────────────────────────────────────────────────┐
│  🏥 Santé Financière de votre business          │
├─────────────────────────────────────────────────┤
│           78 / 100 🟡 CORRECT                   │
│  ████████████████████░░░░░░░░░                  │
├─────────────────────────────────────────────────┤
│  LIQUIDITÉ               ████████████ 16/20    │
│  "Vous avez 12 jours de cash disponible"       │
│                                                 │
│  RENTABILITÉ             ████████████████ 18/20│
│  "Marge nette de 31.9% — excellent!"           │
│                                                 │
│  ENDETTEMENT             ████████ 12/20        │
│  "Vos dettes = 53% de vos actifs"             │
│                                                 │
│  RECOUVREMENT            ████████████ 16/20    │
│  "Vos clients paient en 22 jours en moyenne"  │
│                                                 │
│  ROTATION STOCK          ██████████████ 16/20  │
│  "Votre stock tourne 8.4 fois par an — bon!"  │
├─────────────────────────────────────────────────┤
│  💡 Conseil Pilot AI                           │
│  "Augmentez votre cash de réserve à 30 jours  │
│   pour passer de 🟡 à 🟢."                    │
└─────────────────────────────────────────────────┘

Source: fn_health_score(business_id)
```

---

### 4. ALERTES PILOT AI (/ai)

```
┌─────────────────────────────────────────────────┐
│  🤖 Pilot AI — Vos alertes                     │
├─────────────────────────────────────────────────┤
│  🔴 CRITIQUE — Trésorerie                       │
│  "Il vous reste 12 jours de trésorerie.         │
│   Si vos dépenses continuent à ce rythme,       │
│   votre caisse sera vide dans 12 jours.          │
│   → Cobrez vos créances: 38,900 HTG à collecter"│
│  [Voir les clients débiteurs]                   │
├─────────────────────────────────────────────────┤
│  🟡 ATTENTION — Marge brute                     │
│  "Votre marge brute est de 18%.                 │
│   Objectif recommandé: 25%.                     │
│   → Augmentez vos prix ou réduisez vos coûts."  │
│  [Analyser les produits]                        │
├─────────────────────────────────────────────────┤
│  🟠 INFO — Clients débiteurs                    │
│  "3 clients vous doivent plus de 30 jours:      │
│   Jean Pierre: 12,400 HTG (45 jours)            │
│   Marie Luxe: 8,200 HTG (38 jours)              │
│   → Envoyez un rappel WhatsApp"                 │
│  [Envoyer rappels]                              │
└─────────────────────────────────────────────────┘

Source: fn_detect_anomalies(business_id) + v_ar_aging
```

---

### 5. CRÉANCES CLIENTS (/customers/receivables)

```
┌─────────────────────────────────────────────────┐
│  👥 Clients qui vous doivent                    │
│  Total: 38,900 HTG                              │
├────────────────┬──────┬──────┬──────┬───────────┤
│  Client        │ 0-30j│31-60j│61-90j│  >90j    │
├────────────────┼──────┼──────┼──────┼───────────┤
│  Jean Pierre   │  —   │12,400│  —   │    —     │
│  Marie Luxe    │  —   │ 8,200│  —   │    —     │
│  Boutique Chic │4,500 │  —   │  —   │    —     │
│  Resto Soleil  │  —   │  —   │  —   │  5,300   │
├────────────────┼──────┼──────┼──────┼───────────┤
│  TOTAL         │4,500 │20,600│  0   │  5,300   │
└────────────────┴──────┴──────┴──────┴───────────┘

⚠️ 5,300 HTG impayés depuis plus de 90 jours!
   Envisagez une provision pour créance douteuse.

Source: v_ar_aging
```

---

## ROUTING API — Appels aux fonctions comptables

```typescript
// Tableau de bord
GET /api/dashboard → SELECT * FROM v_dashboard_kpis WHERE business_id = $biz

// État des résultats
GET /api/reports/income?from=2026-01-01&to=2026-01-31
  → SELECT * FROM fn_income_statement($biz, $from, $to)

// Bilan
GET /api/reports/balance-sheet?as_of=2026-01-31
  → SELECT fn_balance_sheet($biz, $as_of)

// Score santé
GET /api/reports/health
  → SELECT * FROM fn_health_score($biz)

// Alertes AI
GET /api/ai/anomalies
  → SELECT * FROM fn_detect_anomalies($biz)

// Créances clients
GET /api/customers/receivables
  → SELECT * FROM v_ar_aging WHERE business_id = $biz

// Dettes fournisseurs
GET /api/suppliers/payables
  → SELECT * FROM v_ap_aging WHERE business_id = $biz

// Position trésorerie
GET /api/cashflow/position
  → SELECT * FROM v_cash_position WHERE business_id = $biz

// P&L mensuel (graphique)
GET /api/reports/monthly-pnl
  → SELECT * FROM v_monthly_pnl WHERE business_id = $biz

// Top produits
GET /api/reports/top-products
  → SELECT * FROM v_top_products_margin WHERE business_id = $biz

// Actions manuelles (POST)
POST /api/accounting/owner-withdrawal  → fn_journal_owner_withdrawal(...)
POST /api/accounting/loan-received     → fn_journal_loan_received(...)
POST /api/accounting/loan-repayment    → fn_journal_loan_repayment(...)
POST /api/accounting/asset-purchase    → fn_journal_asset_purchase(...)
POST /api/accounting/payroll           → fn_journal_payroll_provision(...)
POST /api/accounting/transfer          → fn_journal_transfer(...)
POST /api/accounting/capital           → fn_journal_capital_contribution(...)
```

---

## RÈGLES PDF REPORTS

### Génération PDF: Stack recommandé

```
Next.js API Route → @react-pdf/renderer → Supabase Storage

Rapports PDF disponibles:
1. État des Résultats  (P&L)          → fn_income_statement()
2. Bilan               (Balance Sheet) → fn_balance_sheet()
3. Relevé de compte client             → customer_transactions
4. Relevé fournisseur                  → supplier_transactions
5. Journal comptable                   → journal_entries + lines
6. Balance de vérification             → v_trial_balance
7. Rapport de stock                    → v_stock_valuation

Header PDF standard:
  Logo ProfitPilot | Nom du business | Période
  
Footer PDF standard:
  Généré par ProfitPilot | Date | Page X/Y
```

---

## ONBOARDING COMPTABLE — Checklist par nouveau business

```
1. ✅ fn_seed_chart_of_accounts(business_id)  → Plan comptable PCG-HT
2. ✅ fn_open_accounting_period(business_id)  → Période mois courant
3. ✅ fn_journal_capital_contribution(...)    → Apport initial capital
4. ⬜ Importer soldes initiaux (si migration) → Écritures d'ouverture manuelles
5. ✅ Premier vente enregistrée               → Moteur comptable activé
```

---

*Architecture UI · ProfitPilot v4.1 · Double-entry invisible · Entrepreneur-first*
