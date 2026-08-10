import { NextResponse } from 'next/server';

/** Standard error envelope — see API.md. */
export function errorResponse(code: string, message: string, status: number, details?: unknown) {
  return NextResponse.json({ error: { code, message, ...(details ? { details } : {}) } }, { status });
}

export function okResponse<T>(data: T, status = 200) {
  return NextResponse.json({ data }, { status });
}

export function paginatedResponse<T>(items: T[], nextCursor: string | null) {
  return NextResponse.json({ data: items, nextCursor });
}

/** Cursor pagination per API.md: ?cursor=<id>&limit=20. */
export function parseCursorPagination(searchParams: URLSearchParams) {
  const cursor = searchParams.get('cursor') ?? undefined;
  const limitParam = Number(searchParams.get('limit'));
  const limit = Number.isFinite(limitParam) && limitParam > 0 ? Math.min(limitParam, 100) : 20;
  return { cursor, limit };
}
