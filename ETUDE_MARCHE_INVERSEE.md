# Étude de marché inversée — suivi d'exécution

Source : *ProfitPilot — Étude de marché inversée* (21 octobre 2026). Ce fichier
dit, section par section, ce qui est fait dans le code, où, et ce qui reste à
faire hors du code. Le chantier tient en une branche et une migration.

## Avant de déployer — trois actions manuelles

| Action | Pourquoi | Sans elle |
|---|---|---|
| Coller `supabase/migrations/20261025_etude_marche_inversee.sql` dans le SQL Editor | Tables `cash_days`, `sol_groups`, `sol_payments`, `work_orders`, `service_consumables`, `appointments` ; colonnes `payments.billing_months`, `business_members.pay_mode/pay_rate` ; déclencheur de vente qui ignore les produits non stockés | Caisse, sòl, fiches de travail, rendez-vous, coût des services et paie des aides répondent « pas encore ouvert sur ce compte » ; l'option 6 mois est refusée au paiement. Le reste marche. |
| Poser `OPENAI_API_KEY` sur Vercel | Transcription Whisper du kreyòl (F02) | Le bouton micro n'apparaît nulle part (vérifié : `/api/voice` répond `available: false`). La page de prix promet pourtant la voix : ne pas déployer la page de prix sans la clé. |
| `ANTHROPIC_API_KEY` (déjà posée en local) | Compréhension de la phrase dite (F02) et lecture du cahier en photo (F10), modèle `claude-opus-5-5`, repli serveur `fallbacks: "default"` activé | La photo du cahier répond « pas encore activée » ; la voix retombe sur un lecteur de montant sans IA. |

## §13 — Les offres

| Demande | Fait | Où |
|---|---|---|
| KONNEN / KONTWOLE / GRANDI, promesse, « pour qui » par métier, limites, signal de passage | ✓ | `lib/plans.ts` |
| Prix affiché par jour (≈ 33 / 83 / 250) | ✓ | `pricePerDay()`, page de prix, paiement, FAQ, accueil |
| Option 6 mois payés d'avance (sans remise) | ✓ | `/checkout`, `app/actions/payments.ts`, approbation (`billing_months`) |
| Tableau comparatif §13.4 | ✓ | `PLAN_COMPARISON`, `/pricing` (lignes filtrées par métier) |
| Registre réaligné (taux du jour, alerte stock, inventaire, photo de reçu, bilan → Esansyel ; Elit = patron + 10 aides) | ✓ | `lib/planFeatures.ts`, tests |
| Garantie « première semaine » et paiement en espèces auprès d'un ajan | **non retenu** (décision du 25/10) | — |

## §12.1 — Ce qui est retiré des offres

Caché du menu, code et pages conservés, un seul interrupteur :
`RETIRED_MODULES_HIDDEN` dans `components/nav.tsx`. Comptabilité en partie
double, boutique en ligne (5 entrées), API, automatisations, rôles, analyses
avancées, module RH complet (`/employes`, remplacé par `/aides`). Le module
boutique du tableau Elit ne s'affiche encore que si le marchand a déjà une
vitrine.

## §11 — La meilleure solution

| Règle | État |
|---|---|
| 1. Trois gros boutons VANN/SÈVIS, DEPANS, KREDI | ✓ `components/dashboard/KayeHome.tsx` (les tableaux par offre restent derrière « Wè plis detay ») |
| 2. Saisie en moins de 5 s, montant seul accepté | ✓ `QuickSaleForm` (« Montan sèlman », fiche système `Vant` non stockée) |
| 3. La voix d'abord | ✓ sous condition de `OPENAI_API_KEY` — `VoiceButton`, `/api/voice` |
| 4. Kreyòl par défaut | ✓ `DEFAULT_LANGUAGE = 'ht'` ; **reste** : écrans anciens écrits en français en dur (produits, inventaire, créances, widgets des tableaux) |
| 5. Hors ligne par défaut | partiel, comme avant : la vente (produit ou montant) part en file ; dépenses et caisse demandent le réseau |
| 6. Numéro + code PIN | **non fait** : touche à la sécurité des comptes (Supabase, SMS) — à décider à part |
| 7. Toujours un bouton « Retounen » | non traité écran par écran |
| 8. Aucun jargon | ✓ menu, offres, FAQ, accueil ; test `aucun mot de comptable` |
| 9. L'app vient au client (bilan du soir) | ✓ voir F06 |
| 10. « Ekri nou » à un tap | ✓ en-tête de l'application, FAQ (`lib/support.ts`) |
| 11. Un métier, un écran | ✓ `lib/kaye.ts` + `moreSectionsFor()` |
| 12. Léger | photos compressées avant envoi (`lib/imageCompress.ts`) |

§11.3 — l'installation guidée en 5 étapes : `/demarrage` (métier, 10 favoris
sans prix inventé, fond de caisse, photo du cahier, heure du bilan + WhatsApp).

## §12 — Les fonctionnalités

| # | État | Où |
|---|---|---|
| F01 Saisie rapide | ✓ | `components/sales/QuickSaleForm.tsx` |
| F02 Voix kreyòl | ✓ (clé OpenAI requise) | `app/api/voice`, `lib/voice/`, `components/voice/`, `lib/ai/claude.ts` |
| F03 Dépense + photo de reçu | ✓ | `components/expenses/QuickExpenseForm.tsx` (bucket `business-documents`) |
| F04 Salè mèt la | ✓ | catégorie « Kay » (scope `personal`), salaire hebdo dans `/caisse`, alerte dans le conseil du soir |
| F05 Cahier de crédit | existant | `/creances` |
| F06 Bilan du soir | ✓ | `lib/eveningReport.ts` (testé), `app/actions/evening.ts`, accueil, notification à l'heure choisie, filet du cron de 7 h |
| F07 Goud / dola ayisyen / dollar | ✓ | `components/sales/AmountInput.tsx` (dola × 5) |
| F08 Kès atandi / kès reyèl | ✓ | `/caisse` |
| F09 Hors ligne | existant (vente) | `lib/offlineQueue.ts` |
| F10 Photo du cahier | ✓ (relecture obligatoire avant import) | `/kaye`, `app/actions/notebook.ts` |
| F11 Rappels de crédit | existant | `/creances` |
| F12 Stock simple | existant + « prèske fini » dans la vente rapide | |
| F13 Fiches de travail | ✓ | `/travaux` (vente à crédit + avance + « li pare ») |
| F14 Coût d'une prestation | ✓ | `/prestations` (somme des consommables → prix d'achat du service) |
| F15 Rendez-vous | ✓ | `/rendez-vous` (rappel WhatsApp en un tap) |
| F16 Comptes des aides | ✓ | invités en `cashier` ; paie jour/% dans `/aides` |
| F17 Sòl ak sabotaj | ✓ | `/sol` ; compte dans la caisse, pas dans le profit |
| F18 Assistant | existant + alerte « dépenses anormales » | `lib/insights.ts` |
| F19 Rapport du mois / dossier | existant | `/rapports`, `/rapports/credit` (6/12/24 mois) |
| F20 Plusieurs points | existant | |
| F21 Prix d'achat suivis | ✓ | `/prix-achat` |
| F22 Écarts de caisse par aide | ✓ | `/caisse` (Elit) |
| F23 Comparaison anonyme | **phase 2** (annoncé « talè ») | — |
| F24 Revue mensuelle | ✓ (demande de rendez-vous WhatsApp ; la revue est humaine) | accueil Elit |
| F25 Support WhatsApp | ✓ (marqué « priyorite » en Elit) | en-tête |

## Limites connues, à garder en tête

- **Le bilan du soir ne part pas tout seul sur WhatsApp** : notification dans
  l'app + message prêt en un tap. L'envoi automatique demande l'API WhatsApp
  Business (compte Meta).
- **Un crédit recopié du cahier est une vente à crédit** (`metadata.source =
  notebook_import`) : il est exclu du bilan du jour, mais les rapports mensuels
  et le journal comptable le voient comme une vente de sa date.
- **Une fiche de travail est une vente à crédit dès sa création** : le prix
  compte comme vendu le jour où le travail est accepté.
- **Pas d'annulation de fiche** dans l'interface : l'application n'a pas
  d'annulation de vente.
- **Les témoignages de la page d'accueil** (`TestimonialsSection`, « +22 % de
  marge en 3 mois »…) ne sont pas vérifiés. Les « 250+ commerçants » ont été
  retirés ; les témoignages restent, à remplacer par les phrases réelles des
  entretiens du §14.1.
- Le §14 (hypothèses à valider sur le terrain) reste à mener : la voix et la
  photo du cahier sont livrées, mais leurs seuils (90 % / 80 %) ne sont pas
  mesurés.
