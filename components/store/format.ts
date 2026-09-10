// Le formatage des montants de vitrine, en un seul endroit.
//
// `lib/utils.ts` a déjà `formatCurrency`, mais il impose deux décimales : c'est
// ce qu'il faut dans un journal comptable, pas sur une étiquette de prix.
// « 1 250 HTG » se lit, « 1 250,00 HTG » se déchiffre.

export function storeMoney(amount: number, currency = 'HTG'): string {
  const value = Number.isFinite(amount) ? amount : 0;
  // Les centimes ne s'affichent que s'il y en a — un prix rond reste rond.
  const hasCents = Math.abs(value % 1) > 0.004;
  return (
    new Intl.NumberFormat('fr-HT', {
      minimumFractionDigits: hasCents ? 2 : 0,
      maximumFractionDigits: hasCents ? 2 : 0,
    }).format(value) + ` ${currency}`
  );
}
