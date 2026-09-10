// Le guide de style ProfitPilot, en composants.
// Tout écran neuf part d'ici ; aucun écran ne redéfinit une ombre, un rayon,
// une taille de texte ou une couleur de son côté (§3.4).

export { Card, Section, Stack, ScreenHeader } from './Surface';
export { Money, Delta, formatAmount } from './Money';
export { Button, type ButtonProps } from './Button';
export { Badge, FilterPill, type BadgeTone } from './Badge';
export { FirstRun, NoResult, closestMatch } from './EmptyState';
export { BottomSheet } from './BottomSheet';
export { PaymentPicker, PAYMENT_METHODS, type PaymentKey } from './PaymentPicker';
export { PeriodBars, type BarPoint } from './PeriodBars';
// L'écart entre les barres et l'espacement des libellés : les mêmes décisions
// pour tous les graphiques, sinon deux d'un même écran ne se ressemblent plus.
export { barGap, labelStep, showsLabel } from './chartScale';
export { Stat, StatRow } from './Stat';
// L'interrupteur : deux écrans le redessinaient, avec deux cibles trop petites.
export { Switch } from './Switch';
// La quatrième brique (§5.4) : plus aucun écran ne redessine son champ.
export {
  Field, TextField, AmountField, PhoneField, SelectField,
  type FieldProps, type SelectOption,
} from './Field';
