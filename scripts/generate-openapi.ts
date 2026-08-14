import { readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { ROUTES, type RouteMeta } from '../src/lib/openapi/registry';

/**
 * Generates `public/openapi.json` from the filesystem plus `src/lib/openapi/registry.ts`.
 *
 * The generator **fails** in two directions rather than emitting a plausible-looking
 * document:
 *
 * - A handler on disk with no registry entry → error. An API document that silently omits
 *   a route is worse than none, because integrators trust it.
 * - A registry entry with no handler on disk → error. That is a route someone deleted or
 *   renamed, and documenting an endpoint that returns 404 wastes an integrator's afternoon.
 *
 * Request bodies come from the real Zod schemas the handlers validate with, so a schema
 * change cannot drift from the spec — that is the whole reason API.md deferred writing this
 * by hand.
 *
 * Run: npx tsx scripts/generate-openapi.ts
 */

const API_ROOT = join(process.cwd(), 'src', 'app', 'api');
const OUTPUT = join(process.cwd(), 'public', 'openapi.json');

const HTTP_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] as const;

/** Walks the App Router tree and returns `METHOD /path` keys for every exported handler. */
function discoverRoutes(): string[] {
  const found: string[] = [];

  function walk(dir: string) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
        continue;
      }
      if (entry.name !== 'route.ts' && entry.name !== 'route.tsx') continue;

      // "src/app/api/v1/tenant/branches/[id]/route.ts" -> "/api/v1/tenant/branches/{id}"
      const urlPath =
        '/' +
        relative(join(process.cwd(), 'src', 'app'), dir)
          .split(/[\\/]/)
          .map((segment) => segment.replace(/^\[\.{3}(.+)\]$/, '{$1}').replace(/^\[(.+)\]$/, '{$1}'))
          .join('/');

      const source = readFileSync(full, 'utf8');
      for (const method of HTTP_METHODS) {
        // Two shapes count as a handler:
        //   export async function GET(...)   — the ordinary route
        //   export { handler as GET, ... }   — NextAuth's catch-all, which would otherwise
        //                                      be silently missing from the document
        const declared = new RegExp(`export\\s+(async\\s+)?function\\s+${method}\\s*\\(`).test(source);
        const reExported = new RegExp(`export\\s*\\{[^}]*\\bas\\s+${method}\\b[^}]*\\}`, 's').test(source);
        if (declared || reExported) found.push(`${method} ${urlPath}`);
      }
    }
  }

  walk(API_ROOT);
  return found.sort();
}

function pathParameters(urlPath: string) {
  return [...urlPath.matchAll(/\{([^}]+)\}/g)].map((match) => ({
    name: match[1]!,
    in: 'path',
    required: true,
    schema: { type: 'string' },
  }));
}

function operationFor(key: string, meta: RouteMeta) {
  const [, urlPath] = key.split(' ') as [string, string];

  const parameters = [
    ...pathParameters(urlPath),
    ...(meta.query ?? []).map((q) => ({
      name: q.name,
      in: 'query',
      required: q.required ?? false,
      description: q.description,
      schema: { type: 'string' },
    })),
  ];

  const responses: Record<string, unknown> = {
    '200': {
      description: 'Success.',
      content: {
        [meta.produces ?? 'application/json']:
          meta.produces && meta.produces !== 'application/json'
            ? { schema: { type: 'string', format: 'binary' } }
            : { schema: { $ref: '#/components/schemas/SuccessEnvelope' } },
      },
    },
    '400': { description: 'Validation failed.', content: jsonError() },
  };

  if (meta.auth !== 'public') {
    responses['401'] = { description: 'Not authenticated.', content: jsonError() };
    responses['403'] = { description: 'Permission denied. An audit row is written.', content: jsonError() };
  }
  if (urlPath.includes('{')) {
    responses['404'] = { description: 'Not found, or not visible to the caller.', content: jsonError() };
  }
  if (meta.tag === 'AI') {
    responses['429'] = { description: 'Rate limited. Carries a Retry-After header.', content: jsonError() };
  }

  const description = [
    meta.auth === 'public'
      ? 'Public — no authentication.'
      : meta.auth === 'session'
        ? 'Requires an authenticated session; the handler performs its own ownership check.'
        : `Requires the \`${meta.auth}\` permission.`,
  ].join(' ');

  return {
    summary: meta.summary,
    description,
    tags: [meta.tag],
    ...(parameters.length > 0 ? { parameters } : {}),
    ...(meta.body
      ? {
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: zodToJsonSchema(meta.body, { target: 'openApi3', $refStrategy: 'none' }),
              },
            },
          },
        }
      : {}),
    responses,
    ...(meta.auth === 'public' ? {} : { security: [{ sessionCookie: [] }] }),
  };
}

function jsonError() {
  return { 'application/json': { schema: { $ref: '#/components/schemas/ErrorEnvelope' } } };
}

function main() {
  const discovered = discoverRoutes();
  const registered = Object.keys(ROUTES);

  const undocumented = discovered.filter((key) => !ROUTES[key]);
  const stale = registered.filter((key) => !discovered.includes(key));

  if (undocumented.length > 0 || stale.length > 0) {
    const lines: string[] = ['OpenAPI generation failed — the registry and the routes disagree.\n'];
    if (undocumented.length > 0) {
      lines.push('Handlers with no entry in src/lib/openapi/registry.ts:');
      lines.push(...undocumented.map((key) => `  - ${key}`));
      lines.push('');
    }
    if (stale.length > 0) {
      lines.push('Registry entries with no handler on disk (deleted or renamed?):');
      lines.push(...stale.map((key) => `  - ${key}`));
    }
    // eslint-disable-next-line no-console
    console.error(lines.join('\n'));
    process.exit(1);
  }

  const paths: Record<string, Record<string, unknown>> = {};
  for (const key of discovered) {
    const [method, urlPath] = key.split(' ') as [string, string];
    paths[urlPath] = paths[urlPath] ?? {};
    paths[urlPath]![method.toLowerCase()] = operationFor(key, ROUTES[key]!);
  }

  const spec = {
    openapi: '3.0.3',
    info: {
      title: 'DocBook API',
      version: '1.0.0',
      description: [
        'Multi-tenant healthcare booking platform.',
        '',
        'Generated from the route handlers and their Zod validation schemas',
        '(`npx tsx scripts/generate-openapi.ts`) — not hand-written, so it cannot drift from',
        'what the code actually validates. Generation fails if a handler has no registry entry.',
        '',
        'Response bodies are described by status code and the standard envelope rather than by',
        'per-field schemas: handlers return Prisma rows, no response Zod schemas exist, and',
        'inventing approximations would produce a document that lies in a way nobody can check.',
      ].join('\n'),
    },
    servers: [{ url: '/', description: 'Same origin' }],
    tags: [...new Set(Object.values(ROUTES).map((meta) => meta.tag))].sort().map((name) => ({ name })),
    paths,
    components: {
      securitySchemes: {
        sessionCookie: {
          type: 'apiKey',
          in: 'cookie',
          name: 'next-auth.session-token',
          description:
            'NextAuth session cookie. Obtained via POST /api/auth/callback/credentials. No route trusts a client-supplied tenantId or role — both come from the verified session.',
        },
      },
      schemas: {
        SuccessEnvelope: {
          type: 'object',
          properties: { data: {}, nextCursor: { type: 'string', nullable: true } },
          required: ['data'],
        },
        ErrorEnvelope: {
          type: 'object',
          properties: {
            error: {
              type: 'object',
              properties: {
                code: { type: 'string', example: 'SLOT_TAKEN' },
                message: { type: 'string' },
                details: {},
              },
              required: ['code', 'message'],
            },
          },
          required: ['error'],
        },
      },
    },
  };

  mkdirSync(join(process.cwd(), 'public'), { recursive: true });
  writeFileSync(OUTPUT, JSON.stringify(spec, null, 2) + '\n');

  // eslint-disable-next-line no-console
  console.log(`Wrote ${relative(process.cwd(), OUTPUT)} — ${discovered.length} operations across ${Object.keys(paths).length} paths.`);
}

main();
