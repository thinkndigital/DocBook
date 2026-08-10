import type { NextRequest } from 'next/server';
import type { ZodType, ZodTypeDef } from 'zod';
import { errorResponse } from '@/lib/api/respond';

export class ValidationError extends Error {
  constructor(public issues: unknown) {
    super('VALIDATION_ERROR');
  }
}

// Input left as `any` deliberately: schemas using `.default()` have an Output type
// (post-default, what we actually want T to be) that differs from Input. Pinning
// ZodSchema<T> here would force Input===Output===T and silently widen T back to the
// pre-default shape — see the fix note in the Phase 2 commit.
export async function parseBody<T>(req: NextRequest, schema: ZodType<T, ZodTypeDef, any>): Promise<T> {
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    throw new ValidationError([{ message: 'Request body must be valid JSON.' }]);
  }
  const result = schema.safeParse(json);
  if (!result.success) {
    throw new ValidationError(result.error.issues);
  }
  return result.data;
}

export function validationErrorResponse(err: ValidationError) {
  return errorResponse('VALIDATION_ERROR', 'Request failed validation.', 400, err.issues);
}
