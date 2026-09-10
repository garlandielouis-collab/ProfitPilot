import type { ButtonHTMLAttributes, ReactNode } from 'react';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'outline' | 'danger' | 'gradient';
type ButtonSize    = 'sm' | 'md' | 'lg';

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  children:  ReactNode;
  variant?:  ButtonVariant;
  size?:     ButtonSize;
};

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    'bg-primary text-white shadow-sm ' +
    'hover:bg-primary-h hover:-translate-y-px ' +
    'active:scale-[0.98] active:bg-primary-a ' +
    'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary/50',

  secondary:
    'bg-accent text-accent-ink shadow-sm ' +
    'hover:bg-accent-h hover:-translate-y-px ' +
    'active:scale-[0.98] active:bg-accent-a ' +
    'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent/50',

  ghost:
    'bg-transparent text-primary ' +
    'hover:bg-nav-active hover:text-primary ' +
    'active:scale-[0.98] ' +
    'dark:text-slate-300 dark:hover:bg-white/5',

  outline:
    'bg-transparent border border-primary text-primary ' +
    'hover:bg-nav-active hover:-translate-y-px ' +
    'active:scale-[0.98] ' +
    'dark:border-slate-600 dark:text-slate-200 dark:hover:bg-white/5',

  danger:
    'bg-danger text-white shadow-sm ' +
    'hover:bg-danger hover:-translate-y-px ' +
    'active:scale-[0.98] active:bg-danger ' +
    'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-danger/50',

  // Le dégradé a disparu (§3.2). Deux boutons qui font la même chose doivent se
  // ressembler : celui-ci ne pouvait pas être « le même en dégradé » que le
  // bouton du système. `gradient` reste comme alias de `primary` — les écrans
  // qui l'appelaient encore n'ont rien à changer, ils cessent simplement de
  // diverger (§3.4, et §9 contrôle 6).
  gradient:
    'bg-primary text-white shadow-sm ' +
    'hover:bg-primary-h ' +
    'active:scale-[0.98] ' +
    'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary/50',
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: 'min-h-[36px] px-4 py-2 text-xs rounded-lg',
  md: 'min-h-[44px] px-5 py-2.5 text-sm rounded-xl',
  lg: 'min-h-[52px] px-7 py-3 text-base rounded-xl',
};

export function Button({
  children,
  className = '',
  variant = 'primary',
  size = 'md',
  ...props
}: ButtonProps) {
  return (
    <button
      {...props}
      className={[
        'inline-flex items-center justify-center font-semibold transition duration-150 ease-out',
        'disabled:opacity-50 disabled:pointer-events-none',
        variantClasses[variant],
        sizeClasses[size],
        className,
      ].join(' ')}
    >
      {children}
    </button>
  );
}
