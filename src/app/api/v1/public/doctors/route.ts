import type { NextRequest } from 'next/server';
import { paginatedResponse, parseCursorPagination } from '@/lib/api/respond';
import { searchDoctors } from '@/lib/services/marketplace';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const { cursor, limit } = parseCursorPagination(searchParams);

  const { items, nextCursor } = await searchDoctors({
    specialtySlug: searchParams.get('specialty') ?? undefined,
    cityId: searchParams.get('cityId') ?? undefined,
    gender: (searchParams.get('gender') as 'MALE' | 'FEMALE' | null) ?? undefined,
    query: searchParams.get('q') ?? undefined,
    cursor,
    limit,
  });

  return paginatedResponse(items, nextCursor);
}
