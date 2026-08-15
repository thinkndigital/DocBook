import type { UserRole } from '@prisma/client';
import { defaultLocale, type Locale } from '@/lib/i18n/dictionaries';

/**
 * Where a user belongs immediately after signing in.
 *
 * Both login forms previously hardcoded a single destination — `/login` sent everyone to
 * `/admin` and `/[locale]/login` sent everyone to `/{locale}/patient`. Since the marketplace
 * header only ever links to the locale form, a clinic admin, doctor or representative who
 * signed in through the public site landed on the patient dashboard: authenticated, in the
 * wrong portal, with no route back. It reads as "my account doesn't work", which is the
 * worst possible presentation of a working login.
 *
 * Roles are exhaustively mapped rather than defaulted, so adding a role to the enum without
 * deciding where it lands is a type error rather than a silent trip to the patient area.
 */
export function postLoginDestination(role: UserRole | undefined, locale: Locale = defaultLocale): string {
  switch (role) {
    case 'SUPER_ADMIN':
      return '/admin';
    case 'TENANT_ADMIN':
    case 'RECEPTIONIST':
      return '/tenant';
    case 'DOCTOR':
      return '/doctor';
    case 'REPRESENTATIVE':
      return '/rep';
    case 'SUPPLIER':
      return '/supplier';
    case 'PATIENT':
      return `/${locale}/patient`;
    case undefined:
      // Sign-in succeeded but the session had not materialised yet. The marketplace home
      // is the one destination no role is refused, so this degrades to a usable page
      // rather than a portal the user may not be allowed into.
      return `/${locale}`;
  }
}
