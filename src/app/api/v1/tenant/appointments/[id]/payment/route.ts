import type { NextRequest } from 'next/server';
import { getSessionUser } from '@/lib/api/session';
import { withTenantAuthorizationAny } from '@/lib/api/tenant-scope';
import { errorResponse, okResponse } from '@/lib/api/respond';
import { parseBody, ValidationError, validationErrorResponse } from '@/lib/api/validate';
import { collectPaymentSchema } from '@/lib/validation/billing';
import {
  collectAppointmentPayment,
  getAppointmentPayment,
  PaymentNotFoundError,
  PaymentGatewayError,
  InvalidPaymentStateError,
  AppointmentNotPayableError,
} from '@/lib/services/payments';
import { CommissionOverAllocationError } from '@/lib/services/commissions';

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSessionUser();
  return withTenantAuthorizationAny(session, ['payment:collect', 'billing:manage_tenant'], async () =>
    okResponse(await getAppointmentPayment(params.id))
  );
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSessionUser();
  return withTenantAuthorizationAny(session, ['payment:collect', 'billing:manage_tenant'], async (user) => {
    try {
      const body = await parseBody(req, collectPaymentSchema);
      const { payment, redirectUrl } = await collectAppointmentPayment(params.id, body, user);
      return okResponse({ payment, redirectUrl }, 201);
    } catch (err) {
      if (err instanceof ValidationError) return validationErrorResponse(err);
      if (err instanceof PaymentNotFoundError) return errorResponse('APPOINTMENT_NOT_FOUND', err.message, 404);
      if (err instanceof AppointmentNotPayableError) return errorResponse('APPOINTMENT_NOT_PAYABLE', err.message, 409);
      if (err instanceof InvalidPaymentStateError) return errorResponse('PAYMENT_ALREADY_EXISTS', err.message, 409);
      if (err instanceof CommissionOverAllocationError) {
        return errorResponse('COMMISSION_MISCONFIGURED', err.message, 409);
      }
      if (err instanceof PaymentGatewayError) return errorResponse('PAYMENT_FAILED', err.message, 402);
      throw err;
    }
  });
}
