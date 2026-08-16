import { createServer, type Server } from 'node:http';
import { createHmac } from 'node:crypto';
import type { AddressInfo } from 'node:net';

/**
 * A local HTTP server replicating the exact PayTabs contract PayTabsAdapter targets:
 * POST /payment/request (sale/refund/void) and POST /payment/query, with the same
 * request/response field names and the same HMAC-SHA256 IPN signature scheme. Used by
 * paytabs-adapter.test.ts (no real PayTabs account exists for this project — see the
 * adapter's own doc comment on what this does and doesn't prove).
 *
 * Outcome is controllable per-transaction via setNextOutcome(), called before the test
 * triggers authorize() — the mock stores the chosen outcome ('A' | 'D') against the cart_id
 * at creation time so query() returns it deterministically regardless of call order.
 */
export class MockPayTabsServer {
  private server: Server;
  private transactions = new Map<string, { status: string; amount: number; currency: string }>();
  private nextOutcome: string = 'A';
  private failNextRequest = false;
  /** Counts every /payment/request and /payment/query hit — lets a test prove the gateway
   *  was never contacted (e.g. for a manual/non-card method) without relying on a
   *  must-be-consumed flag that would silently corrupt a later, unrelated test if the call
   *  it was meant for never actually reaches the handler. */
  requestCount = 0;
  port = 0;

  constructor(private readonly serverKey: string) {
    this.server = createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on('data', (c) => chunks.push(c));
      req.on('end', () => {
        const raw = Buffer.concat(chunks).toString('utf8');
        void this.handle(req.url ?? '', raw, res);
      });
    });
  }

  async start(): Promise<void> {
    await new Promise<void>((resolve) => this.server.listen(0, '127.0.0.1', resolve));
    this.port = (this.server.address() as AddressInfo).port;
  }

  async stop(): Promise<void> {
    await new Promise<void>((resolve, reject) => this.server.close((err) => (err ? reject(err) : resolve())));
  }

  get baseUrl(): string {
    return `http://127.0.0.1:${this.port}`;
  }

  /** 'A' = the next sale's query() will report success, 'D' = declined. */
  setNextOutcome(outcome: 'A' | 'D'): void {
    this.nextOutcome = outcome;
  }

  /** Makes the next /payment/request call return a malformed response (no tran_ref). */
  setFailNextRequest(): void {
    this.failNextRequest = true;
  }

  /** Call between tests: clears per-test control state so one test can't leak into another. */
  resetForTest(): void {
    this.nextOutcome = 'A';
    this.failNextRequest = false;
    this.requestCount = 0;
  }

  private handle(url: string, raw: string, res: import('node:http').ServerResponse): void {
    this.requestCount += 1;
    let body: Record<string, unknown> = {};
    try {
      body = JSON.parse(raw || '{}');
    } catch {
      // fall through with empty body
    }

    const json = (payload: unknown, status = 200) => {
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(payload));
    };

    if (url === '/payment/request') {
      const tranType = body.tran_type as string;
      const cartId = body.cart_id as string;

      if (tranType === 'sale') {
        if (this.failNextRequest) {
          this.failNextRequest = false;
          return json({ code: 'E001', message: 'Mock failure' });
        }
        const tranRef = `MOCK_${cartId}`;
        this.transactions.set(tranRef, {
          status: this.nextOutcome,
          amount: body.cart_amount as number,
          currency: body.cart_currency as string,
        });
        return json({ tran_ref: tranRef, cart_id: cartId, redirect_url: `${this.baseUrl}/mock-hosted-page?tran_ref=${tranRef}` });
      }

      if (tranType === 'refund' || tranType === 'void') {
        const tranRef = body.tran_ref as string;
        const existing = this.transactions.get(tranRef);
        if (!existing) return json({ payment_result: { response_status: 'E', response_message: 'Unknown tran_ref' } });
        return json({
          tran_ref: `${tranRef}_${tranType}`,
          payment_result: { response_status: tranType === 'void' ? 'V' : 'A', response_message: 'OK' },
        });
      }

      return json({ code: 'E002', message: `Unhandled tran_type ${tranType}` }, 400);
    }

    if (url === '/payment/query') {
      const tranRef = body.tran_ref as string;
      const existing = this.transactions.get(tranRef);
      if (!existing) return json({ payment_result: { response_status: 'E', response_message: 'Unknown tran_ref' } });
      return json({
        tran_ref: tranRef,
        payment_result: {
          response_status: existing.status,
          response_message: existing.status === 'A' ? 'Authorised' : 'Declined by mock bank',
        },
      });
    }

    json({ message: 'Not found' }, 404);
  }

  /** Signs a payload exactly the way PayTabs signs a real IPN, for callback tests. */
  sign(rawBody: string): string {
    return createHmac('sha256', this.serverKey).update(rawBody, 'utf8').digest('hex');
  }
}
