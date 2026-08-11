/** @type {import('next').NextConfig} */
const nextConfig = {
  // `standalone` is ONLY for the Docker image, which runs `.next/standalone/server.js`
  // directly. It must not be on for a normal `npm run build && npm start`: with
  // standalone output, `next start` serves a half-wired app where most dynamic
  // server-component pages return "Application error: a server-side exception has
  // occurred". Next.js warns about this at startup, but the failure looks like an app bug
  // rather than a config mismatch — hence gating it behind an explicit build flag that
  // only the Dockerfile sets.
  ...(process.env.BUILD_STANDALONE === '1' ? { output: 'standalone' } : {}),
  reactStrictMode: true,
  experimental: {
    // Runs src/instrumentation.ts once at server startup so missing required secrets fail
    // loudly and immediately instead of surfacing as opaque per-page 500s.
    instrumentationHook: true,
  },
};

module.exports = nextConfig;
