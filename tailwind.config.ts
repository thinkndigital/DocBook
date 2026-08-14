import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // A three-stop scale left gaps that were already being referenced:
        // `hover:border-brand-400` on the doctor cards and `border-brand-200` on the
        // symptom-check callout generate no class at all when the shade is undefined, so
        // the hover state simply never appeared and nobody saw an error. Filled in around
        // the existing values, which are unchanged.
        brand: {
          50: '#eff9f6',
          100: '#d7f0e7',
          200: '#aee0d0',
          300: '#7dcbb3',
          400: '#45b394',
          500: '#0f9d78',
          600: '#0c7e60',
          700: '#0a6650',
          800: '#084f3e',
          900: '#06382c',
        },
      },
    },
  },
  plugins: [],
};

export default config;
