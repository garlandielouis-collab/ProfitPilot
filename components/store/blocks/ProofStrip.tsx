// ─────────────────────────────────────────────────────────────────────────────
// La bande de preuves — sous la bannière, sur toutes les largeurs
//
// Elle remplace la grille de réassurance : quatre badges en cartes, qui sur un
// téléphone occupaient un demi-écran de promesses avant le premier produit. Ce
// qu'elle montre à la place est ce que le marchand peut prouver — les moyens de
// paiement qu'il accepte, ses marques, ses chiffres — puis ce qui reste de
// promesses. L'ordre est décidé dans `lib/storeProofs.ts`, qui est testé ; ce
// fichier ne fait que dessiner.
//
// ── Une bande qui défile toute seule ───────────────────────────────────────
//
// Une seule hauteur quoi qu'elle contienne, et aucun geste demandé : le
// visiteur voit passer les marques sans avoir à pousser quoi que ce soit. La
// liste est rendue deux fois dans une piste qui glisse de -50 % (voir
// `.st-marquee` dans app/globals.css) : la boucle ne se voit pas. Le survol et
// le focus la mettent en pause. Avec « réduire les animations », elle ne bouge
// plus et se pousse au doigt.
//
// ── Rien d'encadré ─────────────────────────────────────────────────────────
//
// Pas de cartes, pas de fond : des logos à la couleur de l'encre et des filets
// verticaux, posés sur le fond de la page. Ce sont les codes d'une bande de
// marques, et c'est ce qui la fait lire comme des références plutôt que comme
// des boutons.
// ─────────────────────────────────────────────────────────────────────────────

import type { CSSProperties } from 'react';
import {
  Truck, ShieldCheck, RefreshCw, Headset, CreditCard, Clock, Smartphone, Leaf,
} from 'lucide-react';

import {
  proofStripItems, type PaymentBrand, type ProofIcon, type ProofItem,
} from '../../../lib/storeProofs';
import type { StoreView } from '../types';
import { StoreImage } from './StoreImage';

const ICONS: Record<ProofIcon, typeof ShieldCheck> = {
  truck:   Truck,
  shield:  ShieldCheck,
  refresh: RefreshCw,
  // « On vous répond » : un casque dit « quelqu'un au bout » mieux qu'un
  // combiné, qui se lit comme « appelez-nous ».
  phone:   Headset,
  card:    CreditCard,
  clock:   Clock,
};

/**
 * Le nombre d'éléments en dessous duquel une copie de la liste est trop courte.
 *
 * La boucle ne tient que si UNE copie est plus large que l'écran. Trois
 * engagements sur un écran de 1 440 px laisseraient un trou avant le retour
 * de la seconde copie : on répète donc la liste jusqu'à ce seuil.
 */
const MIN_PER_COPY = 8;

/** Secondes par élément : assez lent pour lire un libellé en passant. */
const SECONDS_PER_ITEM = 3.5;

export function ProofStrip({ store }: { store: StoreView }) {
  const items = proofStripItems(store.theme);
  if (items.length === 0) return null;

  const repeats = Math.ceil(MIN_PER_COPY / items.length);
  const copy = Array.from({ length: repeats }, () => items).flat();

  return (
    <section aria-label="Nos références" className="py-6 md:py-8">
      <div
        className="st-marquee"
        style={{ '--st-marquee-duration': `${copy.length * SECONDS_PER_ITEM}s` } as CSSProperties}
      >
        <div className="st-marquee-track">
          {/* La première copie est lue, une seule fois : ses répétitions et la
              seconde copie n'existent que pour l'œil. */}
          <ul className="flex items-center">
            {copy.map((item, i) => (
              <Cell key={`${item.key}-${i}`} item={item} hidden={i >= items.length} />
            ))}
          </ul>
          <ul className="st-marquee-copy flex items-center" aria-hidden>
            {copy.map((item, i) => (
              <Cell key={`${item.key}-${i}`} item={item} hidden />
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

function Cell({ item, hidden }: { item: ProofItem; hidden: boolean }) {
  // Une cellule qui n'existe que pour l'œil porte `st-marquee-copy` : avec
  // « réduire les animations », la bande ne boucle plus, et les répétitions de
  // la première copie se liraient comme des doublons.
  return (
    <li
      className={`flex flex-shrink-0 items-center${hidden ? ' st-marquee-copy' : ''}`}
      aria-hidden={hidden || undefined}
    >
      <div className="flex h-14 items-center justify-center px-6 text-[var(--st-ink)] md:px-9">
        <Proof item={item} />
      </div>
      <span className="h-10 w-px" style={{ background: 'var(--st-border)' }} aria-hidden />
    </li>
  );
}

/** Une petite capitale espacée : le libellé des engagements et des chiffres. */
const CAPTION = 'whitespace-nowrap text-[10px] font-semibold uppercase leading-none tracking-[0.14em]';

function Proof({ item }: { item: ProofItem }) {
  // Un logo fourni par le marchand passe en niveaux de gris : un logo rouge
  // à côté d'un logo bleu casserait la bande, qui ne parle qu'en encre.
  if (item.logoUrl) {
    return (
      <span className="relative block h-8 w-24 opacity-80 grayscale">
        <StoreImage src={item.logoUrl} alt={item.label} sizes="96px" className="object-contain" />
      </span>
    );
  }

  if (item.brand) return <BrandMark brand={item.brand} />;

  if (item.kind === 'partner') {
    return <span className="whitespace-nowrap text-[17px] font-bold tracking-tight">{item.label}</span>;
  }

  if (item.kind === 'stat') {
    return (
      <span className="flex flex-col items-center gap-1.5">
        <span className="whitespace-nowrap text-[20px] font-semibold leading-none" style={{ fontFamily: 'var(--st-font-heading)' }}>
          {item.label}
        </span>
        {item.note && <span className={CAPTION}>{item.note}</span>}
      </span>
    );
  }

  const Icon = item.icon ? ICONS[item.icon] : ShieldCheck;
  return (
    <span className="flex flex-col items-center gap-2">
      <Icon className="h-6 w-6" strokeWidth={1.4} aria-hidden />
      <span className={CAPTION}>{item.label}</span>
    </span>
  );
}

/**
 * Les quatre moyens de paiement du préréglage, dessinés à l'encre.
 *
 * Des évocations, pas les logos officiels : un monogramme et le nom, dans la
 * couleur du gabarit. Un marchand qui veut le vrai logo le dépose dans
 * « Ils nous font confiance », et c'est son image qui s'affiche à la place.
 */
function BrandMark({ brand }: { brand: PaymentBrand }) {
  const word = 'whitespace-nowrap text-[17px] font-bold tracking-tight';

  switch (brand) {
    case 'visa':
      return (
        <span className="text-[24px] font-black italic leading-none tracking-tight">
          VISA
        </span>
      );

    case 'mastercard':
      return (
        <span className="flex flex-col items-center gap-0.5">
          <svg viewBox="0 0 38 24" className="h-6 w-[38px]" aria-hidden>
            <circle cx="12" cy="12" r="11" fill="currentColor" />
            <circle cx="26" cy="12" r="11" fill="currentColor" fillOpacity="0.55" />
          </svg>
          <span className="text-[8px] font-semibold leading-none">mastercard</span>
        </span>
      );

    case 'moncash':
      return (
        <span className="flex items-center gap-1.5">
          <Smartphone className="h-7 w-7" strokeWidth={1.5} aria-hidden />
          <span className={word}>MonCash</span>
        </span>
      );

    case 'natcash':
      return (
        <span className="flex items-center gap-1.5">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-current" aria-hidden>
            <Leaf className="h-3.5 w-3.5 text-[var(--st-surface)]" strokeWidth={2.2} />
          </span>
          <span className={word}>NatCash</span>
        </span>
      );
  }
}

