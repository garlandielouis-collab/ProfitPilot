'use client';

interface LogoProps {
  size?: string;
  className?: string;
}

export function Logo({ size = 'h-9 w-9', className = '' }: LogoProps) {
  return (
    <img
      src="/profitpilot-logo.png"
      alt="ProfitPilot"
      width={36}
      height={36}
      className={`${size} rounded-xl object-contain ${className}`}
    />
  );
}
