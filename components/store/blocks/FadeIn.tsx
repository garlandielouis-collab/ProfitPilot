'use client';

// ─────────────────────────────────────────────────────────────────────────────
// L'apparition au défilement
//
// Utilisée par le gabarit Luxe, et par lui seul : c'est ce qui donne le rythme
// d'une page de marque. Deux limites strictes.
//
//   `prefers-reduced-motion` est respecté — mouvement désactivé, contenu
//   présent. Une animation qui masque le contenu tant qu'elle n'a pas joué
//   rendrait la boutique vide pour qui a coupé les animations.
//
//   `once`. Un élément qui rejoue son apparition à chaque passage transforme le
//   défilement en clignotement.
//
// L'opacité de départ n'est pas 0 mais 0,001 : à zéro strict, un navigateur qui
// n'exécute pas le JavaScript — connexion coupée en cours de chargement — laisse
// la page définitivement blanche.
// ─────────────────────────────────────────────────────────────────────────────

import { motion, useReducedMotion } from 'framer-motion';
import type { ReactNode } from 'react';

export function FadeIn({
  children,
  delay = 0,
  className,
}: {
  children:  ReactNode;
  delay?:    number;
  className?: string;
}) {
  const reduced = useReducedMotion();

  if (reduced) return <div className={className}>{children}</div>;

  return (
    <motion.div
      className={className}
      initial={{ opacity: 0.001, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-64px' }}
      transition={{ duration: 0.5, delay, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  );
}
