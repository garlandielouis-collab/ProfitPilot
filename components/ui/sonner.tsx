'use client';

import { CircleCheck, Info, LoaderCircle, OctagonX, TriangleAlert } from 'lucide-react';
import { Toaster as Sonner, type ToasterProps } from 'sonner';

/**
 * Thin wrapper around Sonner's Toaster that accepts an explicit `theme` prop
 * instead of pulling from next-themes (which we don't use in this project).
 * Use <ToastProvider /> in layout — it hooks into our ThemeProvider.
 */
const Toaster = ({ theme = 'dark', ...props }: ToasterProps) => (
  <Sonner
    theme={theme}
    className="toaster group"
    icons={{
      success: <CircleCheck className="h-4 w-4" />,
      info:    <Info className="h-4 w-4" />,
      warning: <TriangleAlert className="h-4 w-4" />,
      error:   <OctagonX className="h-4 w-4" />,
      loading: <LoaderCircle className="h-4 w-4 animate-spin" />,
    }}
    toastOptions={{
      classNames: {
        toast:
          'group toast group-[.toaster]:bg-slate-900 group-[.toaster]:text-slate-100 ' +
          'group-[.toaster]:border group-[.toaster]:border-white/10 group-[.toaster]:shadow-xl',
        description: 'group-[.toast]:text-slate-400',
        actionButton:
          'group-[.toast]:bg-emerald-500 group-[.toast]:text-white',
        cancelButton:
          'group-[.toast]:bg-slate-800 group-[.toast]:text-slate-300',
      },
    }}
    {...props}
  />
);

export { Toaster };
