import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

/** Shared base — the `@/` alias must match tsconfig's paths or every import fails. */
export default defineConfig({
  resolve: {
    alias: { '@': resolve(__dirname, './src') },
  },
  test: {
    globals: true,
    environment: 'node',
  },
});
