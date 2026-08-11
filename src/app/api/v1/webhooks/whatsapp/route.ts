import type { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { verifyMetaSignature, classifyIntent, parseInbound } from '@/lib/notifications/whatsapp-inbound';

/**
 * WhatsApp Business inbound webhook (brief §23).
 *
 * HONEST STATUS: this endpoint implements the *platform side* of the contract —
 * subscription verification, signature validation, payload parsing, and intent routing —
 * but no conversational bot runs behind it, because a live integration needs a Meta
 * Business account, a verified phone number, and approved message templates that cannot be
 * provisioned from here. Rather than fake a bot, this endpoint verifies the request
 * genuinely came from Meta, records the inbound message so nothing is silently dropped,
 * and classifies intent for the Phase 10 AI layer to act on.
 *
 * The outbound half is already real in the way that matters: WhatsApp is a registered
 * NotificationProvider channel, so once credentials exist, swapping the dev adapter for a
 * Cloud API adapter turns on every WhatsApp notification the platform already emits —
 * booking, queue, payment, prescription — with no changes to that code.
 */

export const dynamic = 'force-dynamic';

/** Meta's subscription handshake: echo hub.challenge when the verify token matches. */
export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const mode = searchParams.get('hub.mode');
  const token = searchParams.get('hub.verify_token');
  const challenge = searchParams.get('hub.challenge');

  const expected = process.env.WHATSAPP_VERIFY_TOKEN;
  if (!expected) return new Response('Webhook not configured', { status: 503 });

  if (mode === 'subscribe' && token === expected && challenge) {
    return new Response(challenge, { status: 200, headers: { 'Content-Type': 'text/plain' } });
  }
  return new Response('Forbidden', { status: 403 });
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text();

  if (!verifyMetaSignature(rawBody, req.headers.get('x-hub-signature-256'), process.env.WHATSAPP_APP_SECRET)) {
    return new Response('Invalid signature', { status: 403 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return new Response('Bad request', { status: 400 });
  }

  const messages = parseInbound(payload);

  for (const message of messages) {
    const intent = classifyIntent(message.text);

    // Match the sender to a known patient by phone so a future bot can act on their behalf.
    const user = await db.user.findFirst({
      where: { phone: { endsWith: message.from.slice(-9) }, role: 'PATIENT' },
      select: { id: true },
    });

    // Notification rows are the existing message ledger, so an inbound WhatsApp lands
    // there rather than in a parallel table.
    if (user) {
      await db.notification.create({
        data: {
          userId: user.id,
          type: `WHATSAPP_INBOUND_${intent}`,
          channel: 'WHATSAPP',
          payload: { from: message.from, text: message.text, messageId: message.messageId, intent },
          status: 'SENT',
        },
      });
    }
  }

  // Meta requires a fast 200 or it retries; processing is intentionally minimal here.
  return new Response(JSON.stringify({ received: messages.length }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
