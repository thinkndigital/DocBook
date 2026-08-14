import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getToken } from 'next-auth/jwt';

const PUBLIC_PATHS = ['/login', '/api/auth', '/_next', '/favicon.ico'];

/**
 * Reachable while an account is still on the admin-assigned password.
 *
 * The change-password screen and the endpoint it posts to, obviously — locking someone out
 * of the only page that can unlock them is a loop. `/api/auth` is included so sign-out
 * still works: someone who cannot or will not change the password must be able to leave.
 */
const PASSWORD_CHANGE_ALLOWED = ['/account/password', '/api/v1/account/password', '/api/auth'];

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

  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });

  // Only guards page routes for now — API route handlers verify the session themselves
  // via getServerSession + authorize() (see rbac.ts), which is the source of truth.
  if (!token && (pathname.startsWith('/dashboard') || pathname.startsWith('/admin'))) {
    const loginUrl = new URL('/login', req.url);
    loginUrl.searchParams.set('callbackUrl', pathname);
    return NextResponse.redirect(loginUrl);
  }

  /**
   * An account still on the assigned password reaches nothing but the change screen.
   *
   * This is enforced here rather than per-page because the flag protects *every* surface,
   * and a per-page check is a list that a new page can be added to without noticing. The
   * flag rides in the JWT, so this costs no database read.
   *
   * Non-page requests (RSC payloads, API calls) are refused with 403 rather than redirected
   * — a fetch following a redirect to an HTML page produces a parse error rather than a
   * usable message.
   */
  if (token?.mustChangePassword && !PASSWORD_CHANGE_ALLOWED.some((p) => pathname.startsWith(p))) {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json(
        { error: { code: 'PASSWORD_CHANGE_REQUIRED', message: 'Change your password to continue.' } },
        { status: 403 }
      );
    }
    return NextResponse.redirect(new URL('/account/password', req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
