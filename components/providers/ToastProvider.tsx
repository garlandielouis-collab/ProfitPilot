'use client';

import { useTheme } from './ThemeProvider';
import { Toaster } from '../ui/sonner';

/**
 * Renders Sonner's Toaster with the current app theme.
 * Mount once at the top of the tree (inside ThemeProvider).
 */
export function ToastProvider() {
  const { isDark } = useTheme();
  return <Toaster theme={isDark ? 'dark' : 'light'} position="top-right" richColors />;
}
