import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createHmac, createHash } from 'node:crypto';
import { S3StorageAdapter } from '@/lib/storage/s3-adapter';

const ACCESS_KEY_ID = 'AKIAMOCKTESTKEY';
const SECRET_ACCESS_KEY = 'mock-secret-access-key-for-testing-only';
const REGION = 'eu-west-1';
const BUCKET = 'docbook-test-bucket';

/**
 * Independently recomputes the AWS Signature Version 4 the request *should* carry, from
 * the raw request the mock server actually received — written separately from
 * S3StorageAdapter's own implementation of the same public algorithm
 * (https://docs.aws.amazon.com/general/latest/gr/sigv4-signing-process.html), so this test
 * proves the adapter's signature is byte-correct rather than merely "a request was sent and
 * a 200 came back". A copy-paste of the adapter's own signing code would only prove it
 * agrees with itself.
 *
 * The adapter is pointed at the mock via its documented custom-endpoint (path-style)
 * constructor param — the same code path a real MinIO/R2/Spaces deployment uses — rather
 * than by intercepting `fetch`: Node's fetch implementation overwrites any caller-supplied
 * `Host` header with the real connection target, so redirecting the URL post-signing would
 * make the wire `Host` disagree with the `Host` that was actually signed and fail every
 * request with SignatureDoesNotMatch — an artifact of the test rig, not of production
 * usage, where the signed URL and the connected URL are always the same host.
 */
function expectedAuthorization(method: string, path: string, host: string, amzDate: string, payloadHash: string, contentType?: string): string {
  const dateStamp = amzDate.slice(0, 8);
  const headerEntries: Array<[string, string]> = [
    ['host', host],
    ['x-amz-content-sha256', payloadHash],
    ['x-amz-date', amzDate],
  ];
  if (contentType) headerEntries.push(['content-type', contentType]);
  headerEntries.sort(([a], [b]) => a.localeCompare(b));
  const canonicalHeaders = headerEntries.map(([k, v]) => `${k}:${v}\n`).join('');
  const signedHeaders = headerEntries.map(([k]) => k).join(';');

  const canonicalRequest = [method, path, '', canonicalHeaders, signedHeaders, payloadHash].join('\n');
  const credentialScope = `${dateStamp}/${REGION}/s3/aws4_request`;
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    credentialScope,
    createHash('sha256').update(canonicalRequest, 'utf8').digest('hex'),
  ].join('\n');

  const hmac = (key: Buffer | string, data: string) => createHmac('sha256', key).update(data, 'utf8').digest();
  const kDate = hmac(`AWS4${SECRET_ACCESS_KEY}`, dateStamp);
  const kRegion = hmac(kDate, REGION);
  const kService = hmac(kRegion, 's3');
  const kSigning = hmac(kService, 'aws4_request');
  const signature = hmac(kSigning, stringToSign).toString('hex');

  return `AWS4-HMAC-SHA256 Credential=${ACCESS_KEY_ID}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
}

describe('S3StorageAdapter', () => {
  let server: Server;
  let baseUrl: string;
  let host: string;
  const store = new Map<string, Buffer>();

  beforeAll(async () => {
    server = createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on('data', (c) => chunks.push(c));
      req.on('end', () => {
        const body = Buffer.concat(chunks);
        const amzDate = req.headers['x-amz-date'] as string;
        const payloadHash = req.headers['x-amz-content-sha256'] as string;
        const contentType = req.headers['content-type'] as string | undefined;

        const expected = expectedAuthorization(req.method ?? '', req.url ?? '', req.headers.host ?? '', amzDate, payloadHash, contentType);
        if (req.headers.authorization !== expected) {
          res.writeHead(403, { 'Content-Type': 'application/xml' });
          res.end('<Error><Code>SignatureDoesNotMatch</Code></Error>');
          return;
        }

        // Path-style: /{bucket}/{key}
        const key = decodeURIComponent((req.url ?? '').replace(new RegExp(`^/${BUCKET}/`), ''));

        if (req.method === 'PUT') {
          store.set(key, body);
          res.writeHead(200);
          res.end();
        } else if (req.method === 'GET') {
          const stored = store.get(key);
          if (!stored) {
            res.writeHead(404, { 'Content-Type': 'application/xml' });
            res.end('<Error><Code>NoSuchKey</Code></Error>');
            return;
          }
          res.writeHead(200);
          res.end(stored);
        } else if (req.method === 'DELETE') {
          store.delete(key);
          res.writeHead(204);
          res.end();
        } else {
          res.writeHead(405);
          res.end();
        }
      });
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const port = (server.address() as AddressInfo).port;
    baseUrl = `http://127.0.0.1:${port}`;
    host = `127.0.0.1:${port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
  });

  beforeEach(() => {
    store.clear();
  });

  function freshAdapter() {
    return new S3StorageAdapter(BUCKET, REGION, ACCESS_KEY_ID, SECRET_ACCESS_KEY, baseUrl);
  }

  it('puts an object with a correctly SigV4-signed request', async () => {
    const adapter = freshAdapter();
    const data = Buffer.from('%PDF-1.4 mock prescription bytes', 'utf8');
    const result = await adapter.put('prescriptions/abc123.pdf', data, 'application/pdf');

    expect(result.storageKey).toBe('prescriptions/abc123.pdf');
    expect(result.sizeBytes).toBe(data.byteLength);
    expect(store.get('prescriptions/abc123.pdf')?.toString('utf8')).toBe(data.toString('utf8'));
  });

  it('rejects with a mismatched signature if the request is tampered with (sanity check on the mock itself)', async () => {
    const res = await fetch(`${baseUrl}/${BUCKET}/tamper-test.txt`, {
      method: 'PUT',
      headers: {
        Host: host,
        'x-amz-date': '20260101T000000Z',
        'x-amz-content-sha256': createHash('sha256').update('x').digest('hex'),
        Authorization: 'AWS4-HMAC-SHA256 Credential=wrong, SignedHeaders=host, Signature=deadbeef',
      },
      body: 'x',
    });
    expect(res.status).toBe(403);
  });

  it('gets back exactly the bytes that were put, via an independently-verified signature', async () => {
    const adapter = freshAdapter();
    const data = Buffer.from('attachment content', 'utf8');
    await adapter.put('attachments/xyz.bin', data, 'application/octet-stream');

    const fetched = await adapter.get('attachments/xyz.bin');
    expect(fetched.toString('utf8')).toBe('attachment content');
  });

  it('throws a descriptive error when the object does not exist', async () => {
    const adapter = freshAdapter();
    await expect(adapter.get('does/not/exist.pdf')).rejects.toThrow(/S3 GET failed/);
  });

  it('deletes an object', async () => {
    const adapter = freshAdapter();
    await adapter.put('to-delete.txt', Buffer.from('x'), 'text/plain');
    expect(store.has('to-delete.txt')).toBe(true);

    await adapter.delete('to-delete.txt');
    expect(store.has('to-delete.txt')).toBe(false);
  });

  it('getSignedUrl always points at our own download route, never a raw S3 URL', async () => {
    const adapter = freshAdapter();
    const url = await adapter.getSignedUrl('prescriptions/abc123.pdf', 300);

    expect(url.startsWith('/api/v1/files/download?')).toBe(true);
    expect(url).not.toContain('amazonaws.com');
    expect(url).not.toContain(ACCESS_KEY_ID);
    expect(url).not.toContain(SECRET_ACCESS_KEY);
  });

  it('verifySignedUrl accepts a signature it generated and rejects a tampered one', async () => {
    const adapter = freshAdapter();
    const url = await adapter.getSignedUrl('prescriptions/abc123.pdf', 300);
    const params = new URLSearchParams(url.split('?')[1]);
    const key = params.get('key')!;
    const expires = Number(params.get('expires'));
    const signature = params.get('signature')!;

    expect(adapter.verifySignedUrl(key, expires, signature)).toBe(true);
    expect(adapter.verifySignedUrl(key, expires, `${signature.slice(0, -2)}00`)).toBe(false);
    expect(adapter.verifySignedUrl('a-different-key.pdf', expires, signature)).toBe(false);
  });
});
