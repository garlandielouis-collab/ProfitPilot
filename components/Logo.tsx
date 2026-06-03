'use client';

/**
 * Logo ProfitPilot — utilise /logo.png (à placer dans le dossier public/).
 * Si l'image est absente, affiche un fallback "PP" bleu marine.
 */

import { useState } from 'react';

interface LogoProps {
  /** Taille Tailwind appliquée au conteneur, ex: "h-9 w-9" */
  size?: string;
  className?: string;
}

export function Logo({ size = 'h-9 w-9', className = '' }: LogoProps) {
  const [errored, setErrored] = useState(false);

  if (errored) {
    return (
      <div
        className={`${size} flex items-center justify-center rounded-xl bg-[#001F3F] text-xs font-bold text-white ${className}`}
      >
        PP
      </div>
    );
  }

  return (
    <img
      src="/logo.png"
      alt="ProfitPilot"
      className={`${size} rounded-xl object-contain ${className}`}
      onError={() => setErrored(true)}
    />
  );
}
