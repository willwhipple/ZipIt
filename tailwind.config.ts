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
        sky: '0 4px 24px -4px rgba(14,165,233,0.18)',
        'sky-sm': '0 2px 10px -2px rgba(14,165,233,0.12)',
        teal: '0 4px 24px -4px rgba(45,212,191,0.2)',
      },
    },
  },
  plugins: [],
};

export default config;
