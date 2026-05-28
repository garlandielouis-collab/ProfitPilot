import type { Config } from 'tailwindcss';
import { themeColors } from './theme.config';

const config: Config = {
  darkMode: 'class',
  content: ['./app/**/*.{js,ts,jsx,tsx}', './components/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: themeColors,
      fontFamily: {
        sans:    ['var(--font-inter)', 'Inter', 'system-ui', 'sans-serif'],
        display: ['var(--font-jakarta)', 'Plus Jakarta Sans', 'Inter', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        card:        '0 1px 3px rgba(0,0,0,0.04), 0 4px 12px rgba(0,0,0,0.06)',
        'card-hover':'0 4px 6px rgba(0,0,0,0.06), 0 12px 28px rgba(0,0,0,0.10)',
        nav:         '1px 0 0 0 #E2E8F0',
      },
    },
  },
  plugins: [],
};

export default config;
