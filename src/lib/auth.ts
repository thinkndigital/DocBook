import type { NextAuthOptions, Session, User as NextAuthUser } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import bcrypt from 'bcryptjs';
import { db } from '@/lib/db';
import { recordAudit } from '@/lib/audit';
import { RATE_LIMITS, checkLimit, clearFailures, recordAttempt, subjectKey } from '@/lib/security/rate-limit';
import { verifySecondFactor, TwoFactorRateLimitedError } from '@/lib/services/two-factor';
import type { UserRole } from '@prisma/client';

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  tenantId: string | null;
  locale: string;
}

declare module 'next-auth' {
  interface Session {
    user: SessionUser;
  }
}
declare module 'next-auth/jwt' {
  interface JWT {
    role: UserRole;
    tenantId: string | null;
    locale: string;
    uid: string;
  }
}

export const authOptions: NextAuthOptions = {
  session: {
    strategy: 'jwt',
    maxAge: 15 * 60, // access token lifetime; refresh handled by NextAuth's JWT rotation
  },
  providers: [
    CredentialsProvider({
      name: 'Credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
        // Supplied on the second step of login, once the account is known to require it.
        totpCode: { label: 'Authentication code', type: 'text' },
      },
      async authorize(credentials, req): Promise<NextAuthUser | null> {
        if (!credentials?.email || !credentials?.password) return null;

        // Lockout subject is email+IP together, not either alone. Email-only lets anyone
        // lock a known user out of their own account by failing on purpose; IP-only lets a
        // shared clinic connection be exhausted by one careless typist.
        const ip = getIp(req);
        const limitKey = subjectKey('login', credentials.email.toLowerCase(), ip);

        const verdict = await checkLimit(RATE_LIMITS.login, limitKey);
        if (!verdict.allowed) {
          await recordAudit({
            action: 'LOGIN_RATE_LIMITED',
            entityType: 'User',
            entityId: null,
            ipAddress: ip,
          });
          // Deliberately indistinguishable from a wrong password: telling an attacker
          // "this account is locked" confirms the account exists.
          return null;
        }

        const user = await db.user.findUnique({ where: { email: credentials.email } });

        // Constant-shape comparison even when the user doesn't exist, to avoid a
        // user-enumeration timing side-channel.
        const passwordHash = user?.passwordHash ?? '$2a$12$invalidinvalidinvalidinvalidinvalidinvalid';
        const valid = await bcrypt.compare(credentials.password, passwordHash);

        if (!user || !valid || user.status !== 'ACTIVE' || user.deletedAt) {
          await recordAttempt(RATE_LIMITS.login, limitKey, false);
          await recordAudit({
            action: 'LOGIN_FAILED',
            entityType: 'User',
            entityId: user?.id ?? null,
            ipAddress: ip,
          });
          return null;
        }

        // Second factor, when the account has one. Checked after the password so an
        // attacker cannot use the 2FA prompt itself to discover which accounts exist.
        if (user.twoFactorEnabled) {
          const code = credentials.totpCode?.trim();
          if (!code) {
            // A distinct signal so the login form can show the code field. It reveals
            // nothing an attacker who already has the correct password doesn't have.
            throw new Error('TWO_FACTOR_REQUIRED');
          }

          let secondFactorOk = false;
          try {
            secondFactorOk = await verifySecondFactor(user.id, code);
          } catch (err) {
            if (err instanceof TwoFactorRateLimitedError) throw new Error('TWO_FACTOR_RATE_LIMITED');
            throw err;
          }

          if (!secondFactorOk) {
            await recordAttempt(RATE_LIMITS.login, limitKey, false);
            await recordAudit({
              actorUserId: user.id,
              tenantId: user.tenantId,
              action: 'TWO_FACTOR_FAILED',
              entityType: 'User',
              entityId: user.id,
              ipAddress: ip,
            });
            return null;
          }
        }

        // A suspended tenant's staff/doctors/receptionists lose access immediately —
        // this is what makes the admin "suspend tenant" action a real enforcement point
        // rather than just a status flag nobody checks. Patients and SUPER_ADMIN have no
        // tenantId and are unaffected.
        if (user.tenantId) {
          const tenant = await db.tenant.findUnique({ where: { id: user.tenantId }, select: { status: true } });
          if (tenant?.status === 'SUSPENDED') {
            await recordAudit({
              actorUserId: user.id,
              tenantId: user.tenantId,
              action: 'LOGIN_BLOCKED_TENANT_SUSPENDED',
              entityType: 'User',
              entityId: user.id,
              ipAddress: getIp(req),
            });
            return null;
          }
        }

        // A user who mistyped four times then succeeded shouldn't stay one slip away from
        // a lockout for the rest of the window.
        await clearFailures(RATE_LIMITS.login, limitKey);
        await db.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
        await recordAudit({
          actorUserId: user.id,
          tenantId: user.tenantId,
          action: 'LOGIN_SUCCESS',
          entityType: 'User',
          entityId: user.id,
          ipAddress: ip,
        });

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          tenantId: user.tenantId,
          locale: user.locale,
        } as NextAuthUser;
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        const u = user as unknown as SessionUser;
        token.uid = u.id;
        token.role = u.role;
        token.tenantId = u.tenantId;
        token.locale = u.locale;
      }
      return token;
    },
    async session({ session, token }): Promise<Session> {
      session.user = {
        id: token.uid,
        email: session.user.email ?? '',
        name: session.user.name ?? '',
        role: token.role,
        tenantId: token.tenantId,
        locale: token.locale,
      };
      return session;
    },
  },
  pages: {
    signIn: '/login',
  },
  secret: process.env.NEXTAUTH_SECRET,
};

function getIp(req: { headers?: Record<string, string | string[] | undefined> } | undefined): string | null {
  const forwarded = req?.headers?.['x-forwarded-for'];
  if (!forwarded) return null;
  return Array.isArray(forwarded) ? forwarded[0] ?? null : forwarded.split(',')[0]?.trim() ?? null;
}
