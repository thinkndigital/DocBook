import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Parsing/classification for inbound WhatsApp Cloud API messages. Kept out of the route
 * file because Next.js route modules may only export HTTP handlers and route config.
 */

export type Intent = 'BOOK' | 'CANCEL' | 'RESCHEDULE' | 'QUEUE_STATUS' | 'UNKNOWN';

export interface InboundMessage {
  from: string;
  text: string;
  messageId: string;
}

export function verifyMetaSignature(rawBody: string, header: string | null, secret: string | undefined): boolean {
  if (!secret || !header) return false;
  const expected = 'sha256=' + createHmac('sha256', secret).update(rawBody).digest('hex');
  const a = Buffer.from(expected);
  const b = Buffer.from(header);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * Deliberately simple bilingual keyword routing. Natural-language understanding belongs to
 * the Phase 10 AI layer — this establishes the seam so that swap stays contained.
 */
export function classifyIntent(text: string): Intent {
  const t = text.trim().toLowerCase();
  if (/(book|appointment|احجز|حجز|موعد)/.test(t)) return 'BOOK';
  if (/(cancel|إلغاء|الغاء)/.test(t)) return 'CANCEL';
  if (/(reschedule|change|تأجيل|تغيير)/.test(t)) return 'RESCHEDULE';
  if (/(queue|status|دور|حالة)/.test(t)) return 'QUEUE_STATUS';
  return 'UNKNOWN';
}

/** Reduces Meta's nested envelope to the fields we act on. */
export function parseInbound(payload: unknown): InboundMessage[] {
  const messages: InboundMessage[] = [];
  const entries = (payload as { entry?: unknown[] })?.entry;
  if (!Array.isArray(entries)) return messages;

  for (const entry of entries) {
    const changes = (entry as { changes?: unknown[] })?.changes;
    if (!Array.isArray(changes)) continue;
    for (const change of changes) {
      const value = (change as { value?: { messages?: unknown[] } })?.value;
      if (!Array.isArray(value?.messages)) continue;
      for (const msg of value.messages) {
        const m = msg as { from?: string; id?: string; text?: { body?: string } };
        if (m.from && m.id) {
          messages.push({ from: m.from, text: m.text?.body ?? '', messageId: m.id });
        }
      }
    }
  }
  return messages;
}
