import { PrismaClient } from '@prisma/client';
import { tenantScopingMiddleware } from '@/lib/tenant';

declare global {
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined;
}

function createClient(): PrismaClient {
  const client = new PrismaClient();
  client.$use(tenantScopingMiddleware);
  return client;
}

/**
 * Singleton across hot reloads in dev (Next.js re-evaluates modules on every change;
 * without this each reload opens a new connection pool against Postgres).
 */
export const db = global.__prisma ?? createClient();

if (process.env.NODE_ENV !== 'production') {
  global.__prisma = db;
}
