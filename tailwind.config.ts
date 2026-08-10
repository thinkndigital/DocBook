import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#eff9f6',
          500: '#0f9d78',
          600: '#0c7e60',
          700: '#0a6650',
        },
      },
    },
  },
  plugins: [],
};

export default config;
