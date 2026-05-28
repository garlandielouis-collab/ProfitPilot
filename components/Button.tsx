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
    'bg-[#001F3F] text-white shadow-sm ' +
    'hover:bg-[#002D5B] hover:-translate-y-px ' +
    'active:scale-[0.98] active:bg-[#001428] ' +
    'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#001F3F]/50',

  secondary:
    'bg-[#50C878] text-white shadow-sm ' +
    'hover:bg-[#3daa62] hover:-translate-y-px ' +
    'active:scale-[0.98] active:bg-[#2e8c50] ' +
    'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#50C878]/50',

  ghost:
    'bg-transparent text-[#001F3F] ' +
    'hover:bg-[#EAF1F8] hover:text-[#001F3F] ' +
    'active:scale-[0.98] ' +
    'dark:text-slate-300 dark:hover:bg-white/5',

  outline:
    'bg-transparent border border-[#001F3F] text-[#001F3F] ' +
    'hover:bg-[#EAF1F8] hover:-translate-y-px ' +
    'active:scale-[0.98] ' +
    'dark:border-slate-600 dark:text-slate-200 dark:hover:bg-white/5',

  danger:
    'bg-[#DC2626] text-white shadow-sm ' +
    'hover:bg-[#b91c1c] hover:-translate-y-px ' +
    'active:scale-[0.98] active:bg-[#991b1b] ' +
    'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#DC2626]/50',

  gradient:
    'bg-gradient-to-r from-[#001F3F] to-[#003B7A] text-white shadow-sm ' +
    'hover:-translate-y-px hover:shadow-md ' +
    'active:scale-[0.98] ' +
    'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#001F3F]/50',
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
