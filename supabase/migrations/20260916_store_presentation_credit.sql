-- ─────────────────────────────────────────────────────────────────────────────
-- Le tarif de la rédaction de présentation (§36)
--
-- La section « Présentation & services » se rédige à l'IA depuis l'éditeur de
-- vitrine, à partir des faits réels de la boutique. C'est un aller-retour chez
-- le fournisseur, donc un crédit — le même prix qu'une fiche produit.
--
-- La grille vit en base (20260906) pour qu'un tarif se change sans
-- redéploiement ; c'est aussi pour cela que le code ne la connaît pas.
--
-- Sans cette ligne, rien ne casse : `ai_credit_spend` ne trouve pas l'action et
-- `spendCredits` laisse passer sans débiter. La rédaction serait donc GRATUITE
-- jusqu'à ce que cette migration soit jouée — c'est le bon sens de l'erreur,
-- mais ce n'est pas l'intention.
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO ai_credit_costs (action, credits, label) VALUES
  ('store_presentation', 1, 'Rédaction de la présentation de la boutique')
ON CONFLICT (action) DO UPDATE
  SET credits = EXCLUDED.credits, label = EXCLUDED.label;
