import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        logo: ['var(--font-boldonse)', 'sans-serif'],
      },
      boxShadow: {
        'zi-fab': '0 8px 20px -6px rgba(14,165,233,.45)',
        'zi-ai':  '0 6px 18px -8px rgba(45,212,191,.35)',
        'zi-pop': '0 20px 40px -12px rgba(0,0,0,.25)',
        // keep legacy names used by old spinner/loading states
        sky: '0 4px 24px -4px rgba(14,165,233,0.18)',
        'sky-sm': '0 2px 10px -2px rgba(14,165,233,0.12)',
      },
    },
  },
  plugins: [],
};

export default config;
