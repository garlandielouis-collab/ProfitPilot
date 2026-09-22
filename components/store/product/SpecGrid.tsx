'use client';

// ─────────────────────────────────────────────────────────────────────────────
// Les caractéristiques en tuiles (§16, §34)
//
// Le rayon technique est le seul où l'on compare AVANT de regarder. La colonne
// d'achat portait donc déjà les caractéristiques, en tableau — et c'était le
// bon endroit tant qu'il y en avait quatre. Au-delà, le tableau pousse le
// bouton d'achat sous la ligne de flottaison : sur un appareil bien renseigné,
// douze lignes de `dl` séparaient le prix du panier.
//
// La maquette les sort de la colonne et en fait une bande de tuiles, en pleine
// largeur, sous la zone d'achat. Ce que ça change :
//
//   le bouton remonte      la colonne ne porte plus que ce qui décide —
//                          le prix, les points forts, la quantité, l'achat
//   la lecture change      on BALAIE des carreaux au lieu de lire des lignes,
//                          et le pictogramme sert de repère (`storeSpecs.ts`)
//   la largeur sert        une caractéristique tient en trois mots ; en
//                          colonne étroite elle passait sur deux lignes
//
// ── Ce qui n'est pas dupliqué ──────────────────────────────────────────────
//
// Le gabarit qui reçoit cette bande perd son onglet « Caractéristiques » : la
// même donnée deux fois sur la même page ferait douter de la deuxième. C'est
// la règle de `TAB_SECTION`, appliquée à un bloc plutôt qu'à une section.
//
// ── Rien n'est inventé ─────────────────────────────────────────────────────
//
// Les tuiles sont les attributs SAISIS, dans l'ordre de saisie. Une fiche sans
// attributs n'a pas de bande — et le marchand, lui, voit dans son aperçu
// l'encart gris qui lui dit où les écrire.
// ─────────────────────────────────────────────────────────────────────────────

import {
  Monitor, Cpu, MemoryStick, HardDrive, Camera, BatteryCharging, Ruler, Weight,
  ShieldCheck, Layers, Palette, Cable, Zap, Gauge, Smartphone, Calendar, MapPin, Info,
} from 'lucide-react';
import { MerchantHint, useMerchantPreview } from './MerchantHint';
import { specRows, type SpecIcon } from '../../../lib/storeSpecs';

const ICONS: Record<SpecIcon, typeof Monitor> = {
  screen:   Monitor,
  chip:     Cpu,
  memory:   MemoryStick,
  storage:  HardDrive,
  camera:   Camera,
  battery:  BatteryCharging,
  size:     Ruler,
  weight:   Weight,
  warranty: ShieldCheck,
  material: Layers,
  color:    Palette,
  port:     Cable,
  power:    Zap,
  speed:    Gauge,
  device:   Smartphone,
  date:     Calendar,
  origin:   MapPin,
  other:    Info,
};

export function SpecGrid({ attributes, title }: {
  attributes: Record<string, string> | null | undefined;
  /** Le mot du gabarit : « Caractéristiques techniques », « Fiche technique ». */
  title: string;
}) {
  const preview = useMerchantPreview();
  const rows = specRows(attributes);

  if (rows.length === 0) {
    // Pas d'attributs : rien du tout pour le visiteur, et l'emplacement gris
    // pour le marchand. Une section vide laisserait sa marge sans motif.
    if (!preview) return null;
    return (
      <section className="mt-12">
        <MerchantHint title={title} where="Produits → cette fiche → Attributs">
          <p className="text-[14px] text-[var(--st-ink-2)]">
            Écran · Processeur · Mémoire · Stockage · Batterie · Garantie
          </p>
        </MerchantHint>
      </section>
    );
  }

  return (
    <section className="mt-12">
      <h2
        className="mb-4 text-[var(--st-ink)]"
        style={{ fontFamily: 'var(--st-font-heading)', fontSize: 'var(--st-h3)', fontWeight: 600 }}
      >
        {title}
      </h2>

      {/* `auto-fit` plutôt qu'un nombre de colonnes : une fiche en porte trois,
          une autre onze, et une grille à six laisserait la onzième seule sur sa
          ligne. La tuile garde sa largeur minimale, la grille compte elle-même. */}
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-[repeat(auto-fit,minmax(160px,1fr))]">
        {rows.map(({ label, value, icon }) => {
          const Icon = ICONS[icon];
          return (
            <div
              key={label}
              className="flex flex-col border px-3.5 py-3.5"
              style={{ borderColor: 'var(--st-border)', borderRadius: 'var(--st-radius-card)' }}
            >
              <span
                className="mb-2.5 flex h-8 w-8 items-center justify-center"
                style={{ background: 'var(--st-surface-2)', borderRadius: 'var(--st-radius-btn)' }}
                aria-hidden
              >
                <Icon className="h-[17px] w-[17px] text-[var(--st-ink-2)]" strokeWidth={1.7} />
              </span>
              <dt className="text-[12px] leading-snug text-[var(--st-ink-3)]">{label}</dt>
              <dd className="mt-0.5 text-[14px] font-semibold leading-snug text-[var(--st-ink)]">
                {value}
              </dd>
            </div>
          );
        })}
      </dl>
    </section>
  );
}
