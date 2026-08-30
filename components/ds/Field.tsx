'use client';

// ─────────────────────────────────────────────────────────────────────────────
// Field — la quatrième brique (§5.4)
//
// « En dehors des menus et actions flottantes, toute interface mobile se
//   construit avec quatre briques : les cartes, le texte et les liens, les
//   images, les champs de saisie. Nommer ces quatre briques dans le code —
//   quatre composants de base, déclinés — est la traduction technique de la
//   cohérence exigée en 3.4. »
//
// Les trois autres existaient (`Card`, `Money`/`Stat`, `EmptyState`) ; le champ
// manquait, et chaque écran redessinait le sien. D'où les rayons, les hauteurs
// et les couleurs de bordure qui ne se ressemblaient pas d'un formulaire à
// l'autre.
//
// Ce que ce composant tient, pour tous les écrans à la fois :
//
//   §4.5  le libellé se distingue du texte indicatif par le CONTRASTE — marine
//         et gras contre gris — pas par un cadre de plus. Un libellé qu'on
//         confond avec un placeholder est un libellé qui disparaît dès qu'on
//         commence à taper.
//   §5.9  44 px de haut au minimum. Un champ que le pouce rate est un champ
//         qu'on remplit deux fois.
//   §5.2  texte saisi en 15 px, aide en 13 px. Rien en dessous : ce qui ne se
//         lit pas debout dans une boutique ne se livre pas.
//   §4.2  le rouge n'apparaît que si le champ est en erreur — jamais en décor.
//   §4.4  hauteurs et écarts sur la grille de 8.
//
// Le libellé est TOUJOURS associé au champ (`htmlFor`) : sans cela, toucher le
// libellé ne place pas le curseur, et un lecteur d'écran annonce un champ nu.
// ─────────────────────────────────────────────────────────────────────────────

import {
  useId,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '../../lib/utils';

type Common = {
  /** Ce que le champ attend. Court, en clair : « Nom du client », pas « Client ». */
  label: string;
  /** Une ligne d'aide sous le champ. Elle n'est pas le libellé répété (§3.6). */
  hint?: string;
  /** Le message d'erreur remplace l'aide : deux lignes rouges ne valent pas mieux. */
  error?: string;
  className?: string;
};

/** Préfixe et suffixe n'ont de sens que dans un champ d'une ligne : une zone
 *  de texte ne porte ni « +509 » ni « HTG ». */
type Affixes = {
  /** À gauche dans le champ : un préfixe fixe — « +509 », « HTG ». */
  prefix?: ReactNode;
  /** À droite : une unité, un bouton œil, une action courte. */
  suffix?: ReactNode;
};

const SHELL = [
  // Le contraste fait le champ : un fond légèrement en retrait et une bordure
  // discrète. Pas d'ombre — une ombre pour détacher un champ trahit un manque
  // de contraste (§3.2).
  'flex items-center gap-2 rounded-surface border bg-surface',
  'transition-[border-color,box-shadow] duration-press ease-pp',
  'dark:bg-dark-surface2',
].join(' ');

const INPUT = [
  'min-h-touch w-full bg-transparent px-4 py-3 text-body text-text outline-none',
  'placeholder:text-muted dark:text-dark-text dark:placeholder:text-dark-muted',
].join(' ');

export type FieldProps = Common & Affixes & Omit<InputHTMLAttributes<HTMLInputElement>, 'className' | 'prefix'>;

export function Field({ label, hint, error, prefix, suffix, className, id, ...input }: FieldProps) {
  const auto = useId();
  const fieldId = id ?? auto;
  const helpId = `${fieldId}-help`;

  return (
    <div className={cn('w-full', className)}>
      <Label htmlFor={fieldId}>{label}</Label>

      <div className={cn(SHELL, borderFor(error))}>
        {prefix && <span className="pl-4 text-body text-text2 dark:text-dark-text2">{prefix}</span>}
        <input
          id={fieldId}
          aria-invalid={error ? true : undefined}
          aria-describedby={hint || error ? helpId : undefined}
          className={cn(INPUT, prefix && 'pl-0')}
          {...input}
        />
        {suffix && <span className="flex items-center pr-2">{suffix}</span>}
      </div>

      <Help id={helpId} hint={hint} error={error} />
    </div>
  );
}

export type TextFieldProps = Common & Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'className'>;

/** Même champ, plusieurs lignes. Une note de vente, une adresse, un commentaire. */
export function TextField({ label, hint, error, className, id, rows = 3, ...area }: TextFieldProps) {
  const auto = useId();
  const fieldId = id ?? auto;
  const helpId = `${fieldId}-help`;

  return (
    <div className={cn('w-full', className)}>
      <Label htmlFor={fieldId}>{label}</Label>
      <div className={cn(SHELL, borderFor(error))}>
        <textarea
          id={fieldId}
          rows={rows}
          aria-invalid={error ? true : undefined}
          aria-describedby={hint || error ? helpId : undefined}
          className={cn(INPUT, 'resize-y')}
          {...area}
        />
      </div>
      <Help id={helpId} hint={hint} error={error} />
    </div>
  );
}

/**
 * Le champ « montant » : chasse fixe, clavier numérique, devise en suffixe.
 * Un marchand saisit des chiffres toute la journée — il ne doit jamais tomber
 * sur un clavier alphabétique pour taper 4 250 (§4.3).
 */
export function AmountField({ currency = 'HTG', ...props }: FieldProps & { currency?: string }) {
  return (
    <Field
      inputMode="decimal"
      // `text` et non `number` : le champ numérique natif avale les virgules
      // selon la locale, et fait apparaître des flèches inutiles au pouce.
      type="text"
      suffix={<span className="pr-2 text-note font-bold text-muted dark:text-dark-muted">{currency}</span>}
      {...props}
      className={cn('[&_input]:amount [&_input]:font-bold', props.className)}
    />
  );
}

/**
 * Le champ « téléphone » : indicatif +509 posé d'avance, clavier numérique.
 * Le marchand haïtien vit sur WhatsApp ; son numéro est son identité (§6.1).
 */
export function PhoneField(props: FieldProps) {
  return (
    <Field
      type="tel"
      inputMode="tel"
      autoComplete="tel"
      prefix={<span className="amount font-bold">+509</span>}
      placeholder="3712 4521"
      {...props}
    />
  );
}

export type SelectOption = { value: string; label: string };
export type SelectFieldProps = Common & {
  options: SelectOption[];
  /** L'option neutre, en tête : « Toutes les actions ». */
  placeholder?: string;
} & Omit<SelectHTMLAttributes<HTMLSelectElement>, 'className' | 'children'>;

/**
 * Le champ « choisir dans une liste ». Il ferme la porte par laquelle chaque
 * écran redessinait son `<select>` : cinq hauteurs, quatre bordures, et un
 * chevron dessiné en SVG une fois sur deux.
 *
 * Le menu reste NATIF. Un menu déroulant réécrit en HTML paraît plus soigné sur
 * une maquette et se comporte moins bien dans une boutique : le sélecteur du
 * téléphone occupe le bas de l'écran, se manipule au pouce, connaît la langue
 * de l'appareil et ne se referme pas au premier défilement. On ne remplace pas
 * un composant du système d'exploitation pour un chevron plus joli.
 */
export function SelectField({
  label, hint, error, className, id, options, placeholder, ...select
}: SelectFieldProps) {
  const auto = useId();
  const fieldId = id ?? auto;
  const helpId = `${fieldId}-help`;

  return (
    <div className={cn('w-full', className)}>
      <Label htmlFor={fieldId}>{label}</Label>

      <div className={cn(SHELL, borderFor(error), 'relative')}>
        <select
          id={fieldId}
          aria-invalid={error ? true : undefined}
          aria-describedby={hint || error ? helpId : undefined}
          className={cn(INPUT, 'cursor-pointer appearance-none pr-10')}
          {...select}
        >
          {placeholder !== undefined && <option value="">{placeholder}</option>}
          {options.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>

        {/* Le chevron est décoratif : le champ s'annonce déjà comme une liste. */}
        <ChevronDown
          className="pointer-events-none absolute right-4 h-4 w-4 text-muted dark:text-dark-muted"
          strokeWidth={1.8}
          aria-hidden
        />
      </div>

      <Help id={helpId} hint={hint} error={error} />
    </div>
  );
}

// ── Pièces communes ─────────────────────────────────────────────────────────

/** Marine et gras contre le gris du placeholder : le contraste suffit (§4.5). */
function Label({ htmlFor, children }: { htmlFor: string; children: ReactNode }) {
  return (
    <label htmlFor={htmlFor} className="mb-2 block text-note font-bold text-primary dark:text-dark-text">
      {children}
    </label>
  );
}

function Help({ id, hint, error }: { id: string; hint?: string; error?: string }) {
  if (!error && !hint) return null;
  return (
    <p id={id} className={cn('mt-2 text-note', error ? 'text-danger' : 'text-muted dark:text-dark-muted')}>
      {error ?? hint}
    </p>
  );
}

function borderFor(error?: string) {
  return error
    ? 'border-danger focus-within:border-danger'
    : 'border-border focus-within:border-accent dark:border-dark-border';
}
