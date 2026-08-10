import type { NextAuthOptions, Session, User as NextAuthUser } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import bcrypt from 'bcryptjs';
import { db } from '@/lib/db';
import { recordAudit } from '@/lib/audit';
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
      },
      async authorize(credentials, req): Promise<NextAuthUser | null> {
        if (!credentials?.email || !credentials?.password) return null;

        const user = await db.user.findUnique({ where: { email: credentials.email } });

        // Constant-shape comparison even when the user doesn't exist, to avoid a
        // user-enumeration timing side-channel.
        const passwordHash = user?.passwordHash ?? '$2a$12$invalidinvalidinvalidinvalidinvalidinvalid';
        const valid = await bcrypt.compare(credentials.password, passwordHash);

        if (!user || !valid || user.status !== 'ACTIVE' || user.deletedAt) {
          await recordAudit({
            action: 'LOGIN_FAILED',
            entityType: 'User',
            entityId: user?.id ?? null,
            ipAddress: getIp(req),
          });
          return null;
        }

        await db.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
        await recordAudit({
          actorUserId: user.id,
          tenantId: user.tenantId,
          action: 'LOGIN_SUCCESS',
          entityType: 'User',
          entityId: user.id,
          ipAddress: getIp(req),
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
