import { z } from 'zod';

/**
 * `payload` is deliberately untyped (`z.any()`, wrapped in a size cap): it's a browser's
 * RTCSessionDescriptionInit or RTCIceCandidateInit, whose shape isn't ours to pin down, and
 * this is a relay — the server never reads its contents, only stores and forwards it to the
 * other participant. The record-size cap is the actual defense against abuse.
 */
export const postVideoSignalSchema = z.object({
  kind: z.enum(['offer', 'answer', 'ice-candidate']),
  payload: z.any().refine((v) => JSON.stringify(v).length <= 8000, 'Signal payload too large.'),
});
