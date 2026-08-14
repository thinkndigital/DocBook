import { AsyncLocalStorage } from 'node:async_hooks';
import type { Prisma } from '@prisma/client';

export interface TenantContext {
  tenantId: string | null; // null only for SUPER_ADMIN or PATIENT-scoped (non-tenant) queries
  bypass: boolean; // true only for SUPER_ADMIN routes operating across tenants intentionally
}

const storage = new AsyncLocalStorage<TenantContext>();

/**
 * Wrap a request handler body in this so every Prisma query issued during the request
 * is automatically scoped to the caller's tenant — see ARCHITECTURE.md "Multi-tenancy."
 * Application code should not need to pass tenantId into `where` clauses manually.
 */
export function runWithTenant<T>(ctx: TenantContext, fn: () => Promise<T>): Promise<T> {
  // The `async` wrapper is load-bearing, not style. Prisma's client returns a *lazy*
  // PrismaPromise: the query — and therefore the middleware below, and therefore
  // `getTenantContext()` — only runs when the promise is awaited. Written as
  // `storage.run(ctx, fn)`, a caller passing a non-async arrow that returns a query
  // directly (`() => db.branch.findMany()`) has that query executed *outside* the
  // AsyncLocalStorage context, where the middleware sees no tenant and applies no filter.
  // The result is a silent cross-tenant read: no error, just other tenants' rows.
  //
  // Awaiting inside the context here makes the scoping hold no matter how the callback is
  // written. Found by the Phase 12 integration suite; every existing call site happened to
  // pass an async function and so was never affected, which is precisely why it could have
  // survived a refactor unnoticed.
  // `await fn()` rather than `return fn()`: the await invokes the lazy promise's `then`
  // synchronously inside this function body — that is, inside the context. A bare return
  // defers adoption of the promise by a tick, which is exactly long enough to lose it.
  return storage.run(ctx, async () => await fn());
}

export function getTenantContext(): TenantContext | undefined {
  return storage.getStore();
}

/** Models with a required (non-nullable) `tenantId` column — every row must belong to a tenant. */
const TENANT_REQUIRED_MODELS = new Set([
  'Branch',
  'Doctor',
  'Service',
  'Staff',
  'Appointment',
  'Subscription',
  'TenantInsurance',
  'Payment',
  'MedicalRecord',
  'Prescription',
  'Attachment',
  'Review',
]);

/** Models with a nullable `tenantId` — scoped when the caller has one, left alone (or explicitly null) otherwise. */
const TENANT_OPTIONAL_MODELS = new Set([
  'CommissionRule',
  'Commission',
  'Conversation',
  'Notification',
  'AuditLog',
  // Public symptom triage and patient-assistant calls have no tenant at all; a clinic
  // briefing does. Same shape as AuditLog, and for the same reason.
  'AiInteraction',
]);

const TENANT_SCOPED_MODELS = new Set([...TENANT_REQUIRED_MODELS, ...TENANT_OPTIONAL_MODELS]);

const MULTI_ROW_READS = new Set(['findMany', 'count', 'aggregate', 'groupBy']);
const MULTI_ROW_WRITES = new Set(['updateMany', 'deleteMany']);

/**
 * Registered once on the Prisma client in db.ts. This is the application-layer half of
 * tenant isolation; Postgres Row-Level Security (Phase 2 migration) is the backstop for
 * when this middleware is bypassed by a bug — see ARCHITECTURE.md.
 *
 * Deliberately does NOT touch `findUnique`/`findFirst` by primary key: Prisma's typed
 * `where` for those doesn't accept arbitrary extra filters pre-query. Route handlers that
 * fetch a single row by id MUST verify `row.tenantId === session.tenantId` themselves
 * (or use `findFirst({ where: { id, tenantId } })`, which this middleware does scope).
 */
export const tenantScopingMiddleware: Prisma.Middleware = async (params, next) => {
  const ctx = getTenantContext();

  const model = params.model ?? '';
  if (!ctx || ctx.bypass || !TENANT_SCOPED_MODELS.has(model)) {
    return next(params);
  }

  if (TENANT_REQUIRED_MODELS.has(model) && !ctx.tenantId) {
    throw new Error(`Tenant-scoped query on ${model} with no tenantId in context`);
  }

  // Optional-tenant models (e.g. AuditLog for a PATIENT/SUPER_ADMIN action) legitimately
  // scope to `null` — only required models must always have a concrete tenantId.
  const tenantId = ctx.tenantId;

  if (params.action === 'findFirst' || MULTI_ROW_READS.has(params.action)) {
    params.args = params.args ?? {};
    params.args.where = { ...params.args.where, tenantId };
  }

  if (params.action === 'create') {
    params.args.data = { ...params.args.data, tenantId };
  }

  if (params.action === 'update' || params.action === 'delete' || MULTI_ROW_WRITES.has(params.action)) {
    params.args.where = { ...params.args.where, tenantId };
  }

  return next(params);
};
