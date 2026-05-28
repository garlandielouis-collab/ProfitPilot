# ProfitPilot — Moteur Comptable Complet
> Senior Financial Systems Architecture · IFRS-Inspired · SYSCOHADA Haiti · Double-Entry

---

## 1. PHILOSOPHIE DU MOTEUR COMPTABLE

### Principe fondamental
Chaque transaction dans ProfitPilot génère **automatiquement** des écritures comptables correctes.
L'entrepreneur n'a **jamais** besoin de connaître la comptabilité — le moteur s'en charge.

### Les 5 vérités comptables irréfutables
```
ACTIF = PASSIF + CAPITAUX PROPRES           ← L'équation du bilan (toujours vraie)
DÉBIT = CRÉDIT                              ← Chaque écriture doit s'équilibrer
RÉSULTAT = REVENUS − CHARGES                ← Le profit réel
CAPITAUX PROPRES = CAPITAL + RÉSULTATS     ← Ce que l'entrepreneur possède vraiment
FLUX DE TRÉSORERIE = ENTRÉES − SORTIES     ← Le cash réel
```

### Ce que voit l'entrepreneur vs ce que fait le moteur
| Action utilisateur | Ce que l'utilisateur voit | Ce que le moteur fait |
|---|---|---|
| Vente de 1 500 HTG cash | "Vente enregistrée ✅" | DR Caisse 1500 / CR Ventes 1500 + DR COGS / CR Stock |
| Achat stock 5 000 HTG crédit | "Achat enregistré ✅" | DR Stock 5000 / CR Fournisseurs 5000 |
| Paiement loyer 3 000 HTG | "Dépense enregistrée ✅" | DR Loyer 3000 / CR Caisse 3000 |
| Retrait 2 000 HTG personnel | "Prélèvement enregistré ✅" | DR Prélèvements 2000 / CR Caisse 2000 |

---

## 2. PLAN COMPTABLE GÉNÉRAL — HAÏTI (PCG-HT)

> Adapté de SYSCOHADA + contexte haïtien (HTG/USD, MonCash, Natcash)

### CLASSE 1 — RESSOURCES DURABLES (Capitaux & Dettes long terme)

| Code | Nom FR | Nom Kreyòl | Type | Sens normal |
|------|--------|------------|------|-------------|
| 1010 | Capital social | Kapital sosyal | Equity | Crédit |
| 1020 | Apports propriétaire | Apò pwopriyetè | Equity | Crédit |
| 1070 | Réserves légales | Rezèv legal | Equity | Crédit |
| 1080 | Report à nouveau | Rezilta ane anvan | Equity | Crédit |
| 1300 | Résultat de l'exercice | Pwofi/Pèt ane a | Equity | Crédit |
| 1610 | Emprunts bancaires | Prè bank | Liability | Crédit |
| 1620 | Prêts long terme | Prè alontèm | Liability | Crédit |
| 1630 | Dettes sur immobilisations | Det sou ekipman | Liability | Crédit |

### CLASSE 2 — IMMOBILISATIONS (Actifs non courants)

| Code | Nom FR | Nom Kreyòl | Type | Sens normal |
|------|--------|------------|------|-------------|
| 2100 | Terrains | Tèren | Asset | Débit |
| 2200 | Bâtiments | Bilding | Asset | Débit |
| 2300 | Installations techniques | Ekipman teknik | Asset | Débit |
| 2350 | Matériel et outillage | Zouti | Asset | Débit |
| 2410 | Mobilier de bureau | Mèb biwo | Asset | Débit |
| 2420 | Matériel informatique | Òdinatè | Asset | Débit |
| 2430 | Téléphones professionnels | Telefòn pwofesyonèl | Asset | Débit |
| 2500 | Véhicules | Machin | Asset | Débit |
| 2800 | Amortissements cumulés | Amotisman | Asset | Crédit (contra) |

### CLASSE 3 — STOCKS

| Code | Nom FR | Nom Kreyòl | Type | Sens normal |
|------|--------|------------|------|-------------|
| 3100 | Matières premières | Matye premyè | Asset | Débit |
| 3200 | Emballages | Pakaj | Asset | Débit |
| 3700 | Marchandises | Machandiz | Asset | Débit |
| 3800 | Produits finis | Pwodui fini | Asset | Débit |
| 3900 | Dépréciation stocks | Depresiasyon stock | Asset | Crédit (contra) |

### CLASSE 4 — COMPTES DE TIERS (AR/AP)

| Code | Nom FR | Nom Kreyòl | Type | Sens normal |
|------|--------|------------|------|-------------|
| 4010 | Fournisseurs — Dettes AP | Founisè yo dwe | Liability | Crédit |
| 4020 | Fournisseurs — Effets à payer | Biye peyab founisè | Liability | Crédit |
| 4110 | Clients — Créances AR | Kliyan yo dwe nou | Asset | Débit |
| 4120 | Clients douteux | Kliyan doutè | Asset | Débit |
| 4190 | Avances reçues clients | Avans kliyan | Liability | Crédit |
| 4200 | Personnel — Salaires à payer | Salè pou peye | Liability | Crédit |
| 4300 | Org. sociaux (ONA/OFATMA) | ONA/OFATMA | Liability | Crédit |
| 4440 | État — Impôts à payer | Taks pou peye | Liability | Crédit |
| 4450 | TCA/TVA collectée | TVA kolekte | Liability | Crédit |
| 4460 | TCA/TVA déductible | TVA dediktib | Asset | Débit |
| 4580 | Prélèvements propriétaire | Prelèvman pwopriyetè | Equity | Débit (contra) |
| 4710 | Avances versées fournisseurs | Avans founisè | Asset | Débit |
| 4810 | Charges à payer | Chaj pou regle | Liability | Crédit |
| 4820 | Produits constatés d'avance | Revni avanse | Liability | Crédit |

### CLASSE 5 — TRÉSORERIE (Cash & Banking)

| Code | Nom FR | Nom Kreyòl | Type | Sens normal |
|------|--------|------------|------|-------------|
| 5110 | Banque HTG | Bank HTG | Asset | Débit |
| 5120 | Banque USD | Bank USD | Asset | Débit |
| 5121 | MonCash | MonCash | Asset | Débit |
| 5122 | Natcash | Natcash | Asset | Débit |
| 5123 | Carte bancaire | Kat bank | Asset | Débit |
| 5124 | Zelle / Wire USD | Zelle / Vire | Asset | Débit |
| 5310 | Caisse HTG | Kès HTG | Asset | Débit |
| 5320 | Caisse USD | Kès USD | Asset | Débit |
| 5330 | Petite caisse | Ti kès | Asset | Débit |
| 5900 | Virements internes | Transfè | Asset | Débit |

### CLASSE 6 — CHARGES (Expenses)

| Code | Nom FR | Nom Kreyòl | Catégorie |
|------|--------|------------|-----------|
| 6010 | Achats de marchandises | Acha machandiz | COGS |
| 6020 | Variation de stocks | Chanjman stock | COGS |
| 6030 | Achats matières premières | Acha matye premyè | COGS |
| 6100 | Frais de transport sur achats | Frè transpò acha | COGS |
| 6130 | Loyers | Lwaye | Operating |
| 6140 | Charges locatives | Chaj lokasyon | Operating |
| 6150 | Entretien et réparations | Antretyen | Operating |
| 6160 | Assurances | Asirans | Operating |
| 6220 | Fournitures de bureau | Founiti biwo | Operating |
| 6230 | Marketing et publicité | Maketing | Operating |
| 6240 | Transport et déplacements | Transpò | Operating |
| 6250 | Carburant | Gaz | Operating |
| 6260 | Téléphone et Internet | Telefòn/Entènèt | Operating |
| 6270 | Frais bancaires | Frè bank | Operating |
| 6280 | Commissions digitales | Komisyon dijital | Operating |
| 6290 | Charges diverses | Lòt depans | Operating |
| 6300 | Impôts et taxes | Taks | Tax |
| 6350 | Patente et licences | Patant | Tax |
| 6410 | Salaires et traitements | Salè | Payroll |
| 6420 | Rémunérations dirigeants | Salè dirigean | Payroll |
| 6430 | Charges sociales ONA/OFATMA | Chaj sosyal | Payroll |
| 6500 | Autres charges opérationnelles | Lòt depans operasyonèl | Operating |
| 6600 | Charges financières (intérêts) | Enterè prè | Financial |
| 6700 | Charges exceptionnelles | Depans eksepsyonèl | Other |
| 6810 | Dotations aux amortissements | Amotisman | Depreciation |
| 6900 | Coût des marchandises vendues | Koù machandiz vann | COGS |

### CLASSE 7 — PRODUITS (Revenue)

| Code | Nom FR | Nom Kreyòl | Catégorie |
|------|--------|------------|-----------|
| 7010 | Ventes de marchandises | Vant machandiz | Operating |
| 7020 | Prestations de services | Sèvis | Operating |
| 7030 | Revenus de livraison | Revni livrezon | Operating |
| 7040 | Commissions et honoraires | Komisyon | Operating |
| 7050 | Ventes en ligne | Vant anliy | Operating |
| 7090 | Autres revenus d'exploitation | Lòt revni | Operating |
| 7091 | Revenus financiers (intérêts) | Enterè | Financial |
| 7600 | Produits exceptionnels | Revni eksepsyonèl | Other |
| 7090R| Retours et remises sur ventes | Retou vant | Contra Revenue |

---

## 3. RÈGLES D'ÉCRITURES AUTOMATIQUES

### RÈGLE 1 — VENTE CASH

```
Action: Client achète produit, paye cash
────────────────────────────────────────────
ÉCRITURE 1: Reconnaissance du revenu
  DR  5310  Caisse HTG              +montant_vente
  CR  7010  Ventes marchandises     +montant_vente

ÉCRITURE 2: Coût des marchandises vendues
  DR  6900  COGS                    +coût_stock
  CR  3700  Stock marchandises      −coût_stock
────────────────────────────────────────────
Impact bilan: Caisse↑  Stock↓  (actif neutre si marge=0)
Impact résultat: Revenus↑  COGS↑  →  Marge brute
```

### RÈGLE 2 — VENTE À CRÉDIT

```
Action: Client achète, paiera plus tard
────────────────────────────────────────────
ÉCRITURE 1: Créance client
  DR  4110  Clients AR              +montant_vente
  CR  7010  Ventes marchandises     +montant_vente

ÉCRITURE 2: COGS
  DR  6900  COGS                    +coût_stock
  CR  3700  Stock                   −coût_stock
────────────────────────────────────────────
Impact: Créances↑  Stock↓  Revenus↑
```

### RÈGLE 3 — PAIEMENT CLIENT (Règlement créance)

```
Action: Client paie sa dette
────────────────────────────────────────────
  DR  5310/5110  Caisse ou Banque   +montant_payé
  CR  4110       Clients AR         −montant_payé
────────────────────────────────────────────
Impact: Caisse↑  Créances↓  (bilan neutre)
```

### RÈGLE 4 — ACHAT STOCK CASH

```
Action: Achète marchandises, paie cash
────────────────────────────────────────────
  DR  3700  Stock marchandises      +montant_achat
  CR  5310  Caisse                  −montant_achat
────────────────────────────────────────────
Impact: Stock↑  Caisse↓  (actif neutre)
```

### RÈGLE 5 — ACHAT STOCK À CRÉDIT

```
Action: Achète marchandises, paiera plus tard
────────────────────────────────────────────
  DR  3700  Stock marchandises      +montant_achat
  CR  4010  Fournisseurs AP         +montant_achat
────────────────────────────────────────────
Impact: Stock↑  Dettes fournisseurs↑
```

### RÈGLE 6 — PAIEMENT FOURNISSEUR

```
Action: Paie la dette fournisseur
────────────────────────────────────────────
  DR  4010  Fournisseurs AP         −montant_payé
  CR  5310/5110  Caisse ou Banque   −montant_payé
────────────────────────────────────────────
Impact: Dettes↓  Caisse↓  (passif et actif ↓)
```

### RÈGLE 7 — DÉPENSE CASH (Loyer, Électricité, Marketing...)

```
Action: Paie une dépense opérationnelle
────────────────────────────────────────────
  DR  6xxx  Compte de charge        +montant
  CR  5310/5110  Caisse ou Banque   −montant
────────────────────────────────────────────
Impact: Caisse↓  Charges↑  →  Profit↓
```

### RÈGLE 8 — DÉPENSE À CRÉDIT (Non encore payée)

```
Action: Reçoit facture, n'a pas encore payé
────────────────────────────────────────────
  DR  6xxx  Compte de charge        +montant
  CR  4810  Charges à payer         +montant
────────────────────────────────────────────
Impact: Charges↑  Dettes court terme↑
```

### RÈGLE 9 — PRÊT BANCAIRE REÇU

```
Action: Reçoit prêt de la banque
────────────────────────────────────────────
  DR  5110  Banque HTG              +montant_prêt
  CR  1610  Emprunts bancaires      +montant_prêt
────────────────────────────────────────────
Impact: Banque↑  Dettes long terme↑
```

### RÈGLE 10 — REMBOURSEMENT PRÊT

```
Action: Paie mensualité prêt (capital + intérêts)
────────────────────────────────────────────
  DR  1610  Emprunts bancaires      −capital
  DR  6600  Charges financières     +intérêts
  CR  5110  Banque                  −(capital + intérêts)
────────────────────────────────────────────
Impact: Dettes↓  Caisse↓  Charges financières↑
```

### RÈGLE 11 — PRÉLÈVEMENT PROPRIÉTAIRE

```
Action: Propriétaire retire argent pour usage personnel
────────────────────────────────────────────
  DR  4580  Prélèvements propriétaire  +montant
  CR  5310  Caisse                     −montant
────────────────────────────────────────────
Impact: Caisse↓  Capitaux propres↓
⚠️  Ce n'est PAS une dépense — c'est une réduction des capitaux propres
```

### RÈGLE 12 — APPORT PROPRIÉTAIRE

```
Action: Propriétaire met argent dans l'entreprise
────────────────────────────────────────────
  DR  5310  Caisse                  +montant
  CR  1020  Apports propriétaire   +montant
────────────────────────────────────────────
Impact: Caisse↑  Capitaux propres↑
```

### RÈGLE 13 — ACHAT IMMOBILISATION

```
Action: Achète ordinateur, véhicule, équipement
────────────────────────────────────────────
  DR  24xx  Immobilisation (catégorie)  +valeur
  CR  5110/5310  Banque ou Caisse       −valeur
────────────────────────────────────────────
Impact: Actif fixe↑  Caisse↓
Note: Ce n'est PAS une charge — c'est un actif amorti sur sa durée de vie
```

### RÈGLE 14 — AMORTISSEMENT MENSUEL

```
Action: Calcul mensuel de la dépréciation des immobilisations
────────────────────────────────────────────
  DR  6810  Dotation amortissements    +montant_amortissement
  CR  2800  Amortissements cumulés     +montant_amortissement
────────────────────────────────────────────
Formule: Valeur_achat ÷ Durée_vie_mois = Amortissement_mensuel
Durées standards:
  Ordinateurs/Téléphones: 3 ans (36 mois)
  Mobilier/Équipements:   5 ans (60 mois)
  Véhicules:              5 ans (60 mois)
  Bâtiments:             20 ans (240 mois)
```

### RÈGLE 15 — PAIEMENT SALAIRE

```
Action: Verse les salaires aux employés
────────────────────────────────────────────
ÉCRITURE 1: Constatation de la charge
  DR  6410  Salaires bruts          +salaire_brut
  CR  4200  Salaires à payer        +salaire_net
  CR  4300  ONA/OFATMA à payer      +charges_sociales

ÉCRITURE 2: Paiement effectif
  DR  4200  Salaires à payer        −salaire_net
  CR  5310/5110  Caisse ou Banque   −salaire_net
────────────────────────────────────────────
Taux ONA Haïti: 6% employeur + 4% employé = 10% sur salaire brut
```

### RÈGLE 16 — RETOUR CLIENT

```
Action: Client retourne une marchandise
────────────────────────────────────────────
ÉCRITURE 1: Annulation revenu
  DR  7090R Retours sur ventes      +montant_retour
  CR  4110  Clients AR              −montant_retour (ou Caisse)

ÉCRITURE 2: Remise en stock
  DR  3700  Stock                   +coût_retour
  CR  6900  COGS                    −coût_retour
────────────────────────────────────────────
```

### RÈGLE 17 — TRANSFERT INTERNE (Caisse → Banque)

```
Action: Dépose l'argent de la caisse à la banque
────────────────────────────────────────────
  DR  5110  Banque                  +montant
  CR  5310  Caisse                  −montant
────────────────────────────────────────────
Note: Utiliser compte 5900 Virements internes comme compte de passage
```

---

## 4. ÉTATS FINANCIERS AUTOMATIQUES

### 4.1 ÉTAT DES RÉSULTATS (Compte de résultat / P&L)

```
ÉTAT DES RÉSULTATS
Période: du [date_début] au [date_fin]
═══════════════════════════════════════════════

REVENUS
  Ventes marchandises (7010)           XXX,XXX HTG
  Prestations de services (7020)           X,XXX HTG
  Revenus livraison (7030)                   XXX HTG
  Autres revenus (7090)                      XXX HTG
  (−) Retours sur ventes (7090R)           −XXX HTG
                                        ───────────
REVENUS NETS                             XXX,XXX HTG

COÛT DES MARCHANDISES VENDUES (COGS)
  Achats marchandises (6010)           XXX,XXX HTG
  Variation de stocks (6020)            ±XX,XXX HTG
  Coût marchandises vendues (6900)      XX,XXX HTG
                                        ───────────
TOTAL COGS                              XXX,XXX HTG

MARGE BRUTE                             XXX,XXX HTG
Taux de marge brute: XX.X%

CHARGES D'EXPLOITATION
  Salaires (6410)                        XX,XXX HTG
  Loyer (6130)                           XX,XXX HTG
  Électricité/Eau (6140)                  X,XXX HTG
  Téléphone/Internet (6260)              X,XXX HTG
  Marketing (6230)                        X,XXX HTG
  Transport (6240)                        X,XXX HTG
  Frais bancaires (6270)                    XXX HTG
  Assurances (6160)                         XXX HTG
  Autres charges (6500)                  X,XXX HTG
                                        ───────────
TOTAL CHARGES EXPLOITATION              XXX,XXX HTG

RÉSULTAT D'EXPLOITATION (EBIT)          XXX,XXX HTG
Taux de marge opérationnelle: XX.X%

CHARGES FINANCIÈRES (6600)               −X,XXX HTG
PRODUITS FINANCIERS (7091)               +X,XXX HTG

RÉSULTAT AVANT IMPÔTS                   XXX,XXX HTG
IMPÔTS (6300)                            −X,XXX HTG

RÉSULTAT NET                            XXX,XXX HTG  ✅
Taux de marge nette: XX.X%
═══════════════════════════════════════════════
```

### 4.2 BILAN (Balance Sheet)

```
BILAN AU [DATE]
═══════════════════════════════════════════════

ACTIF                          │ PASSIF & CAPITAUX PROPRES
────────────────────────────── │ ──────────────────────────────
ACTIF COURANT                  │ PASSIF COURANT
  Caisse HTG (5310)    XX,XXX  │   Fournisseurs AP (4010) XX,XXX
  Caisse USD (5320)     X,XXX  │   Salaires à payer (4200) X,XXX
  MonCash (5121)        X,XXX  │   Taxes à payer (4440)    X,XXX
  Banque HTG (5110)   XX,XXX   │   Charges à payer (4810)  X,XXX
  Clients AR (4110)   XX,XXX   │ TOTAL PASSIF COURANT     XX,XXX
  Stock (3700)        XX,XXX   │
  Avances (4710)       X,XXX   │ PASSIF LONG TERME
TOTAL ACTIF COURANT  XXX,XXX   │   Emprunts (1610)        XX,XXX
                               │ TOTAL PASSIF LONG TERME  XX,XXX
ACTIF IMMOBILISÉ               │
  Équipements (24xx)  XX,XXX   │ TOTAL PASSIF            XXX,XXX
  (−) Amort. (2800)  −XX,XXX  │
TOTAL ACTIF IMMOB.   XX,XXX    │ CAPITAUX PROPRES
                               │   Capital (1010)         XX,XXX
                               │   Apports (1020)         XX,XXX
                               │   Résultats ant. (1080)  XX,XXX
                               │   Résultat net (1300)    XX,XXX
                               │   (−) Prélèv. (4580)    −X,XXX
                               │ TOTAL CAPITAUX PROPRES  XXX,XXX
────────────────────────────── │ ──────────────────────────────
TOTAL ACTIF         XXX,XXX    │ TOTAL PASSIF + CP       XXX,XXX
═══════════════════════════════════════════════
✅ ÉQUILIBRE: ACTIF = PASSIF + CAPITAUX PROPRES
```

### 4.3 ÉTAT DES FLUX DE TRÉSORERIE

```
TABLEAU DES FLUX DE TRÉSORERIE
Période: du [date_début] au [date_fin]
═══════════════════════════════════════════════

A. ACTIVITÉS D'EXPLOITATION
   Résultat net                              +XXX,XXX
   Ajustements non-cash:
     Amortissements                           +XX,XXX
   Variation du fonds de roulement:
     (Augment.) Diminution créances clients   ±XX,XXX
     (Augment.) Diminution stocks             ±XX,XXX
     Augment. (Diminution) dettes fourniss.   ±XX,XXX
                                             ─────────
   FLUX NET EXPLOITATION                     +XXX,XXX ✅

B. ACTIVITÉS D'INVESTISSEMENT
   Achats d'immobilisations                  −XX,XXX
   Cessions d'immobilisations                +XX,XXX
                                             ─────────
   FLUX NET INVESTISSEMENT                   −XX,XXX

C. ACTIVITÉS DE FINANCEMENT
   Prêts reçus                               +XX,XXX
   Remboursements prêts                      −XX,XXX
   Apports propriétaire                      +XX,XXX
   Prélèvements propriétaire                 −XX,XXX
                                             ─────────
   FLUX NET FINANCEMENT                      ±XX,XXX

VARIATION NETTE DE TRÉSORERIE                ±XX,XXX
Trésorerie ouverture                         +XX,XXX
TRÉSORERIE CLÔTURE                           +XXX,XXX ✅
═══════════════════════════════════════════════
```

### 4.4 ÉTAT DES CAPITAUX PROPRES

```
ÉTAT DES VARIATIONS DES CAPITAUX PROPRES
═══════════════════════════════════════════════════════════════
                    Capital   Réserves  Résultats  Prélèv.   TOTAL
                    ───────   ────────  ─────────  ───────   ─────
Solde au 01/01      XX,XXX    X,XXX     XX,XXX    −X,XXX   XX,XXX
Résultat période       —         —      +XX,XXX      —     +XX,XXX
Apports période     +X,XXX       —          —        —     +X,XXX
Prélèvements           —         —          —     −X,XXX   −X,XXX
                    ───────   ────────  ─────────  ───────   ─────
Solde au 31/12      XX,XXX    X,XXX     XX,XXX    −X,XXX   XX,XXX
═══════════════════════════════════════════════════════════════
```

---

## 5. COMPTABILITÉ DES STOCKS (Inventory Accounting)

### Méthode de valorisation: CMUP (Coût Moyen Unitaire Pondéré)

```
Formule CMUP:
CMUP = (Valeur stock existant + Valeur entrée) ÷ (Quantité existante + Quantité entrée)

Exemple:
  Stock actuel: 10 unités × 100 HTG = 1 000 HTG
  Nouvelle entrée: 20 unités × 120 HTG = 2 400 HTG
  CMUP = (1 000 + 2 400) ÷ (10 + 20) = 3 400 ÷ 30 = 113,33 HTG/unité

Lors de la vente de 5 unités:
  COGS = 5 × 113,33 = 566,67 HTG  → DR 6900 / CR 3700
```

### KPIs Stocks essentiels

```
Taux de rotation = COGS ÷ Stock moyen
→ Plus élevé = stock qui tourne bien

Jours de stock = 365 ÷ Taux de rotation
→ Combien de jours avant rupture

Valeur stock morte = Produits non vendus depuis 90+ jours
→ Capital immobilisé = risque de perte

Taux de marge brute par produit = (Prix vente − COGS) ÷ Prix vente × 100
→ Quels produits sont les plus rentables
```

---

## 6. INTELLIGENCE ARTIFICIELLE COMPTABLE (Pilot AI)

### 6.1 Détection d'anomalies automatique

| Signal détecté | Seuil | Message Pilot AI |
|---|---|---|
| Dépenses > 30% vs mois précédent | +30% | "Vos dépenses ont augmenté de X% ce mois. Catégorie principale: Marketing." |
| Marge brute < 20% | < 20% | "Votre marge brute est faible. Vérifiez vos prix de vente ou coûts d'achat." |
| Caisse < 5% du CA mensuel | < 5% | "⚠️ Trésorerie critique. Vous avez moins de X jours de cash disponible." |
| Stock dormant > 60 jours | > 60j | "Le produit [X] n'a pas bougé depuis 2 mois. Valeur immobilisée: X HTG." |
| Créances > 30 jours impayées | > 30j | "3 clients doivent encore payer. Total: X HTG depuis plus d'un mois." |
| Prélèvements > 50% du résultat | > 50% | "Vos retraits représentent X% de vos bénéfices. Attention à votre trésorerie." |
| Ratio dettes/actifs > 70% | > 70% | "Votre niveau d'endettement est élevé. Ratio actuel: X%." |

### 6.2 Recommandations proactives

```
Scénario: Marge brute faible sur produit X
→ "Le produit [Crème Nivea] vous coûte 250 HTG mais se vend à 280 HTG.
   Marge brute: 10,7%. Vos concurrents vendent à 350 HTG.
   Recommandation: Augmentez le prix à 330-350 HTG."

Scénario: Cash insuffisant pour payer fournisseurs
→ "Dans 12 jours, vous devrez payer [Fournisseur X]: 45,000 HTG.
   Votre caisse actuelle: 32,000 HTG. Déficit prévu: 13,000 HTG.
   Recommandation: Accélérez la collecte de 3 créances clients."

Scénario: Meilleur mois détecté
→ "🎉 Avril est votre meilleur mois! CA: 125,000 HTG (+23% vs mars).
   Top produit: Gel Douche Dove (3,200 HTG de marge brute).
   Point faible: Dépenses électricité en hausse de 40%."
```

### 6.3 Explications en langage simple

```
TERMINOLOGIE SIMPLIFÉE:
─────────────────────────────────────────────────
"Actifs courants"       → "Ce que vous avez en cash et stock maintenant"
"Accounts Receivable"   → "Clients qui vous doivent de l'argent"
"Accounts Payable"      → "Fournisseurs que vous devez payer"
"COGS"                  → "Ce que vous avez payé pour les produits vendus"
"Marge brute"           → "Profit avant les frais généraux"
"EBIT"                  → "Profit de votre activité principale"
"Résultat net"          → "Ce qu'il vous reste vraiment après tout"
"Amortissement"         → "La perte de valeur de vos équipements chaque mois"
"Fonds de roulement"    → "L'argent disponible pour faire tourner l'entreprise"
"Ratio de liquidité"    → "Pouvez-vous payer vos dettes avec ce que vous avez?"
─────────────────────────────────────────────────
```

---

## 7. TABLEAU DE BORD FINANCIER — KPIs temps réel

```
┌─────────────────────────────────────────────────────────┐
│  💰 CA Ce Mois        📈 Marge Brute    💸 Dépenses     │
│   125,000 HTG          42.3%             73,500 HTG      │
│   ↑ +23% vs mois-1     ↑ +2.1 pts       ↑ +8% vs m-1   │
├─────────────────────────────────────────────────────────┤
│  🏦 Trésorerie        📦 Valeur Stock   👥 Créances     │
│   32,400 HTG           89,200 HTG        18,750 HTG      │
│   ✅ Saine              ⚠️ Élevé          3 clients       │
├─────────────────────────────────────────────────────────┤
│  📊 Résultat Net      🔄 Rotation Stock  ⏰ Dettes      │
│   21,750 HTG           8.2x/an           45,000 HTG      │
│   Marge: 17.4%         ✅ Bon             ⚠️ Dû dans 12j │
└─────────────────────────────────────────────────────────┘
```

---

## 8. ARCHITECTURE TECHNIQUE

```
┌─────────────────────────────────────────────────────────────┐
│                    PROFITPILOT ACCOUNTING ENGINE             │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  USER ACTION          TRANSACTION LAYER        ACCOUNTING   │
│  ──────────           ─────────────────        ─────────── │
│  Sale recorded    →   fn_auto_journal_sale  →  journal_    │
│  Purchase added   →   fn_auto_journal_purch    entries     │
│  Expense paid     →   fn_auto_journal_exp      + lines     │
│  Payment received →   fn_auto_journal_pay                  │
│                                                             │
│                        LEDGER LAYER                         │
│                        ────────────                         │
│                   →    ledgers (balance par compte)         │
│                   →    account_period_balances              │
│                                                             │
│                        REPORTING LAYER                      │
│                        ───────────────                      │
│                   →    fn_income_statement()               │
│                   →    fn_balance_sheet()                   │
│                   →    fn_cashflow()                        │
│                   →    fn_equity_statement()                │
│                                                             │
│                        AI LAYER                             │
│                        ────────                             │
│                   →    fn_detect_anomalies()                │
│                   →    fn_business_health_score()           │
│                   →    Claude API (explanations)            │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## 9. SCORE DE SANTÉ FINANCIÈRE

```
PROFITPILOT HEALTH SCORE: 0-100

Composantes:
──────────────────────────────────────────────
Liquidité (20pts)    Caisse > 1 mois de charges  → vert
                     Caisse 15-30j charges        → orange
                     Caisse < 15j charges         → rouge

Rentabilité (20pts)  Marge nette > 20%            → vert
                     Marge nette 10-20%           → orange
                     Marge nette < 10%            → rouge

Endettement (20pts)  Dettes/Actifs < 40%          → vert
                     40-60%                       → orange
                     > 60%                        → rouge

Collecte AR (20pts)  DSO < 15 jours               → vert
                     15-30 jours                  → orange
                     > 30 jours                   → rouge

Stocks (20pts)       Rotation > 6x/an             → vert
                     3-6x/an                      → orange
                     < 3x/an                      → rouge
──────────────────────────────────────────────
Score 80-100: 🟢 Entreprise saine
Score 60-79:  🟡 Attention requise
Score 0-59:   🔴 Intervention urgente
```

---

## 10. FLUX DE DONNÉES — DE LA VENTE AU RAPPORT

```
1. Vendeur enregistre vente: 5 x Crème Nivea @ 280 HTG = 1,400 HTG

2. sale_items → trigger → inventory_movements (sale_out, qty=-5)
                        → warehouse_stock (quantity -= 5)

3. sales → trigger → fn_auto_journal_sale()
                    → INSERT journal_entries (VTE-2026-100001)
                      DR 5310 Caisse        1,400 HTG
                      CR 7010 Ventes        1,400 HTG
                    → INSERT journal_entry_lines (2 lignes)
                    → INSERT journal_entries (COGS-2026-100001)
                      DR 6900 COGS          ¿ × 5 = coût_stock
                      CR 3700 Stock         coût_stock

4. ledgers → UPDATE balance
             5310 Caisse:   +1,400
             7010 Ventes:   +1,400
             6900 COGS:     +coût
             3700 Stock:    −coût

5. v_income_statement → recalcule automatiquement
   CA Mois ↑ 1,400 HTG
   COGS ↑ coût_stock
   Marge brute ↑ (1,400 − coût)

6. Dashboard → met à jour KPIs en temps réel
7. Pilot AI → vérifie anomalies, génère insights si nécessaire
```

---

*Architecture conçue pour ProfitPilot — moteur comptable grade institutionnel pour entrepreneurs haïtiens*
*Standards: SYSCOHADA · IFRS PME · Double-entry accounting · Automated journal generation*
