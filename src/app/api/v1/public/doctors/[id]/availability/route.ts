import type { NextRequest } from 'next/server';
import { errorResponse, okResponse } from '@/lib/api/respond';
import { getPublicDoctor } from '@/lib/services/marketplace';
import { getAvailableSlots } from '@/lib/services/availability';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const branchId = req.nextUrl.searchParams.get('branchId');
  const date = req.nextUrl.searchParams.get('date');
  if (!branchId || !date) {
    return errorResponse('MISSING_PARAMS', 'branchId and date query params are required.', 400);
  }

  const doctor = await getPublicDoctor(params.id);
  if (!doctor) return errorResponse('DOCTOR_NOT_FOUND', 'No doctor with that id.', 404);

  const slots = await getAvailableSlots(params.id, branchId, date);
  return okResponse({ date, branchId, slots });
}
