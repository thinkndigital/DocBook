import { createHmac, createHash } from 'node:crypto';
import type { StorageProvider, StoredObject } from '@/lib/storage/provider';
import { buildSignedDownloadUrl, verifyStorageSignature } from '@/lib/storage/url-signing';

/**
 * S3 (or any S3-compatible object store — R2, Spaces, MinIO, via S3_ENDPOINT) adapter,
 * signed with AWS Signature Version 4 against the documented algorithm
 * (https://docs.aws.amazon.com/general/latest/gr/sigv4-signing-process.html): a canonical
 * request, a string-to-sign, and a derived signing key from four chained HMAC-SHA256
 * steps (date -> region -> service -> "aws4_request"). No AWS SDK — same fetch-only,
 * zero-dependency style as PayTabsAdapter, applied to the one general-purpose signing
 * scheme every S3-compatible provider already speaks, rather than a vendor-specific REST
 * shape like the payment/notification adapters target.
 *
 * `getSignedUrl`/`verifySignedUrl` deliberately do NOT generate an S3 presigned URL — they
 * reuse the same HMAC scheme as LocalStorageAdapter (`url-signing.ts`) so a link always
 * points back through our own `/api/v1/files/download` route. That route re-checks session
 * and per-patient clinical permission on every request (see its doc comment); a raw S3
 * presigned URL handed to the browser would let anyone holding that URL bypass that check
 * entirely, which is exactly the `calendarFeedToken` class of leak the marketplace `select`
 * allowlist elsewhere in this codebase exists to prevent.
 */
export class S3StorageAdapter implements StorageProvider {
  readonly id = 's3';

  /** True when a custom endpoint was given: path-style (`{endpoint}/{bucket}/{key}`), the
   *  convention R2/Spaces/MinIO expect, versus AWS's own virtual-hosted-style
   *  (`{bucket}.s3.{region}.amazonaws.com/{key}`) when talking to real S3. */
  private readonly pathStyle: boolean;
  private readonly endpoint: string;

  constructor(
    private readonly bucket: string,
    private readonly region: string,
    private readonly accessKeyId: string,
    private readonly secretAccessKey: string,
    customEndpoint?: string
  ) {
    this.pathStyle = Boolean(customEndpoint);
    this.endpoint = customEndpoint ? customEndpoint.replace(/\/+$/, '') : `https://${bucket}.s3.${region}.amazonaws.com`;
  }

  private hmac(key: Buffer, data: string): Buffer {
    return createHmac('sha256', key).update(data, 'utf8').digest();
  }

  private sha256Hex(data: Buffer | string): string {
    return createHash('sha256').update(data).digest('hex');
  }

  /** The four-step signing-key derivation AWS documents as "chained HMACs". */
  private signingKey(dateStamp: string): Buffer {
    const kDate = this.hmac(Buffer.from(`AWS4${this.secretAccessKey}`, 'utf8'), dateStamp);
    const kRegion = this.hmac(kDate, this.region);
    const kService = this.hmac(kRegion, 's3');
    return this.hmac(kService, 'aws4_request');
  }

  private canonicalUri(key: string): string {
    // Each path segment percent-encoded, slashes preserved — S3's documented requirement.
    const encodedKey = key.split('/').map((segment) => encodeURIComponent(segment)).join('/');
    const prefix = this.pathStyle ? `/${this.bucket}` : '';
    return `${prefix}/${encodedKey}`;
  }

  private async request(method: 'PUT' | 'GET' | 'DELETE', key: string, body?: Buffer, contentType?: string): Promise<Response> {
    const now = new Date();
    const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, ''); // YYYYMMDDTHHMMSSZ
    const dateStamp = amzDate.slice(0, 8);
    const payloadHash = this.sha256Hex(body ?? Buffer.alloc(0));

    const url = new URL(this.canonicalUri(key), this.endpoint);
    const host = url.host;

    const headerEntries: Array<[string, string]> = [
      ['host', host],
      ['x-amz-content-sha256', payloadHash],
      ['x-amz-date', amzDate],
    ];
    if (contentType) headerEntries.push(['content-type', contentType]);
    headerEntries.sort(([a], [b]) => a.localeCompare(b));

    const canonicalHeaders = headerEntries.map(([k, v]) => `${k}:${v}\n`).join('');
    const signedHeaders = headerEntries.map(([k]) => k).join(';');

    const canonicalRequest = [
      method,
      url.pathname,
      '', // no query string on these requests
      canonicalHeaders,
      signedHeaders,
      payloadHash,
    ].join('\n');

    const credentialScope = `${dateStamp}/${this.region}/s3/aws4_request`;
    const stringToSign = [
      'AWS4-HMAC-SHA256',
      amzDate,
      credentialScope,
      this.sha256Hex(Buffer.from(canonicalRequest, 'utf8')),
    ].join('\n');

    const signature = this.hmac(this.signingKey(dateStamp), stringToSign).toString('hex');
    const authorization =
      `AWS4-HMAC-SHA256 Credential=${this.accessKeyId}/${credentialScope}, ` +
      `SignedHeaders=${signedHeaders}, Signature=${signature}`;

    const headers: Record<string, string> = {
      Host: host,
      'x-amz-content-sha256': payloadHash,
      'x-amz-date': amzDate,
      Authorization: authorization,
    };
    if (contentType) headers['Content-Type'] = contentType;

    return fetch(url.toString(), { method, headers, body: body ? new Uint8Array(body) : undefined });
  }

  async put(key: string, data: Buffer, contentType: string): Promise<StoredObject> {
    const res = await this.request('PUT', key, data, contentType || 'application/octet-stream');
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`S3 PUT failed for "${key}": HTTP ${res.status} ${text.slice(0, 300)}`);
    }
    return { storageKey: key, sizeBytes: data.byteLength };
  }

  async get(key: string): Promise<Buffer> {
    const res = await this.request('GET', key);
    if (!res.ok) {
      throw new Error(`S3 GET failed for "${key}": HTTP ${res.status}`);
    }
    return Buffer.from(await res.arrayBuffer());
  }

  async getSignedUrl(key: string, expiresInSeconds: number): Promise<string> {
    return buildSignedDownloadUrl(key, expiresInSeconds);
  }

  verifySignedUrl(key: string, expires: number, signature: string): boolean {
    return verifyStorageSignature(key, expires, signature);
  }

  async delete(key: string): Promise<void> {
    const res = await this.request('DELETE', key);
    if (!res.ok && res.status !== 404) {
      const text = await res.text().catch(() => '');
      throw new Error(`S3 DELETE failed for "${key}": HTTP ${res.status} ${text.slice(0, 300)}`);
    }
  }
}
