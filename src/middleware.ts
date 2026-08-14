import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getToken } from 'next-auth/jwt';

const PUBLIC_PATHS = ['/login', '/api/auth', '/_next', '/favicon.ico'];

/**
 * Warns once per process if the host being served disagrees with NEXTAUTH_URL.
 *
 * This mismatch has no symptom of its own. NextAuth builds callback URLs and scopes the
 * session cookie from NEXTAUTH_URL, so when it names a different host — a wrong region in
 * the hostname is the easy way to get there — credentials are accepted and the cookie is
 * set for somewhere nobody is browsing. The user is returned to the site still signed out,
 * which is indistinguishable from a wrong password and gets reported as "my account doesn't
 * work". Nothing logs, nothing 500s, and health checks stay green.
 *
 * A warning, not a redirect or a failure: the deployment is serving traffic and a
 * misconfigured base URL must not take it down. Once per process keeps it out of the
 * per-request log.
 */
let baseUrlMismatchWarned = false;

function warnOnBaseUrlMismatch(req: NextRequest) {
  if (baseUrlMismatchWarned) return;

  const configured = process.env.NEXTAUTH_URL;
  if (!configured) return;

  const actualHost = req.headers.get('host');
  if (!actualHost) return;

  let configuredHost: string;
  try {
    configuredHost = new URL(configured).host;
  } catch {
    return;
  }

  if (configuredHost !== actualHost) {
    baseUrlMismatchWarned = true;
    console.error(
      JSON.stringify({
        severity: 'ERROR',
        message:
          'NEXTAUTH_URL does not match the host being served. Sign-in will appear to succeed and leave the user signed out.',
        configuredHost,
        actualHost,
        where: 'middleware',
        code: 'NEXTAUTH_URL_HOST_MISMATCH',
      })
    );
  }
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  warnOnBaseUrlMismatch(req);

  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  // Only guards page routes for now — API route handlers verify the session themselves
  // via getServerSession + authorize() (see rbac.ts), which is the source of truth.
  if (pathname.startsWith('/dashboard') || pathname.startsWith('/admin')) {
    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
    if (!token) {
      const loginUrl = new URL('/login', req.url);
      loginUrl.searchParams.set('callbackUrl', pathname);
      return NextResponse.redirect(loginUrl);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
