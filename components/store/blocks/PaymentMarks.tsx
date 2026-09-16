// ─────────────────────────────────────────────────────────────────────────────
// Les marques de paiement, sous le bouton d'achat
//
// La rangée de logos que toute boutique en ligne pose à cet endroit précis :
// juste après « Ajouter au panier », au moment où l'acheteur se demande
// comment il va payer. Une phrase l'a longtemps remplacée — « Paiement à la
// livraison · MonCash · NatCash » — et une phrase se lit, là où une rangée de
// marques se reconnaît sans lecture.
//
// ── Ce que ce bloc ne fait pas ─────────────────────────────────────────────
//
// Il ne dessine pas les logos officiels : nous n'avons pas les fichiers, et
// une imitation approximative d'une marque connue inspire moins confiance
// qu'un mot écrit proprement. Chaque moyen est donc une GRAPHIE — le mot dans
// la couleur de l'opérateur, sur une pastille bordée.
//
// Il n'affiche que ce que la caisse encaisse : la liste vient de
// `offeredPayments`, qui écarte les valeurs mortes (`card`, `visa`) restées
// dans les réglages d'anciennes boutiques. Une marque affichée ici est une
// marque que l'acheteur retrouvera au moment de payer.
// ─────────────────────────────────────────────────────────────────────────────

import { Banknote } from 'lucide-react';
import { offeredPayments, PAYMENT_LABEL, PAYMENT_MARK } from '../../../lib/storePayments';

export function PaymentMarks({
  methods, className = '',
}: {
  methods:    readonly string[];
  className?: string;
}) {
  const offered = offeredPayments(methods);
  if (offered.length === 0) return null;

  return (
    <ul
      className={`flex flex-wrap items-center gap-2 ${className}`}
      aria-label="Moyens de paiement acceptés"
    >
      {offered.map((method) => {
        const { short, color } = PAYMENT_MARK[method];
        return (
          <li
            key={method}
            title={PAYMENT_LABEL[method]}
            className="flex h-8 items-center gap-1.5 px-2.5"
            style={{
              border:       '1px solid var(--st-border)',
              borderRadius: 'var(--st-radius-btn)',
              background:   'var(--st-surface)',
            }}
          >
            {method === 'cash' && (
              <Banknote className="h-4 w-4 flex-shrink-0" strokeWidth={1.8} style={{ color }} aria-hidden />
            )}
            <span
              className="text-[12px] font-bold leading-none"
              style={{ color, letterSpacing: '-0.01em' }}
            >
              {short}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
