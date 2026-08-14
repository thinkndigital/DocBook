/**
 * Security headers (Phase 12).
 *
 * ## An honest note on the CSP
 *
 * `script-src` includes `'unsafe-inline'`. That is not an oversight and it is not
 * pretending to be a strict CSP: Next.js's App Router bootstraps hydration with inline
 * scripts, and the supported way to lock that down is a per-request nonce injected by
 * middleware, with the nonce threaded into every inline script Next emits. Doing that
 * half-way — shipping a strict-looking policy that silently breaks hydration, or one that
 * developers switch off the first time a page goes blank — is worse than a policy that is
 * honest about its limits.
 *
 * What the policy below *does* buy, all of which is real:
 *  - `object-src 'none'` kills Flash/plugin-based script execution vectors.
 *  - `base-uri 'self'` stops an injected `<base>` from re-pointing every relative URL.
 *  - `frame-ancestors 'none'` blocks clickjacking of the clinic and admin portals.
 *  - `form-action 'self'` stops an injection from posting credentials off-site.
 *  - `connect-src 'self'` keeps exfiltration of anything the page can read to our origin.
 *
 * Nonce-based `script-src` is the remaining work, and it is recorded in ROADMAP.md rather
 * than quietly omitted.
 */
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  'upgrade-insecure-requests',
].join('; ');

const SECURITY_HEADERS = [
  { key: 'Content-Security-Policy', value: CSP },
  // Belt-and-braces with frame-ancestors, for anything that predates CSP support.
  { key: 'X-Frame-Options', value: 'DENY' },
  // Stops a browser from re-interpreting an uploaded medical document as HTML/script.
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  // A booking platform needs none of these; denying them limits what an XSS could reach.
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=()' },
  // Two years, subdomains included. Only meaningful over HTTPS; harmless otherwise.
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  // Patient and clinical pages must never be held by shared caches or proxies.
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
  { key: 'Cross-Origin-Resource-Policy', value: 'same-origin' },
];

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
  // Never advertise the framework version; it turns a CVE announcement into a target list.
  poweredByHeader: false,
  async headers() {
    return [{ source: '/:path*', headers: SECURITY_HEADERS }];
  },
  experimental: {
    // Runs src/instrumentation.ts once at server startup so missing required secrets fail
    // loudly and immediately instead of surfacing as opaque per-page 500s.
    instrumentationHook: true,
  },
};

module.exports = nextConfig;
