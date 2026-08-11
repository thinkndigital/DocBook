import { createHmac, timingSafeEqual, createHash } from 'node:crypto';
import { mkdir, writeFile, readFile, unlink } from 'node:fs/promises';
import path from 'node:path';
import type { StorageProvider, StoredObject } from '@/lib/storage/provider';

/**
 * Development/self-hosted adapter. Files live outside the Next.js public directory, so
 * there is no route by which they can be served without going through the download route's
 * signature *and* permission checks.
 */
export class LocalStorageAdapter implements StorageProvider {
  readonly id = 'local';

  private root = process.env.STORAGE_LOCAL_PATH ?? './.storage';

  private secret(): Buffer {
    const raw = process.env.NEXTAUTH_SECRET;
    if (!raw) {
      if (process.env.NODE_ENV === 'production') {
        throw new Error('NEXTAUTH_SECRET is required to sign storage URLs.');
      }
      return createHash('sha256').update('docbook-insecure-development-url-signing').digest();
    }
    return createHash('sha256').update(raw).digest();
  }

  /** Keys are namespaced and sanitised so a crafted key can't escape the storage root. */
  private resolve(key: string): string {
    const safe = key.replace(/\.\./g, '').replace(/^\/+/, '');
    const full = path.resolve(this.root, safe);
    const rootAbs = path.resolve(this.root);
    if (!full.startsWith(rootAbs)) throw new Error('Invalid storage key.');
    return full;
  }

  async put(key: string, data: Buffer, _contentType: string): Promise<StoredObject> {
    const full = this.resolve(key);
    await mkdir(path.dirname(full), { recursive: true });
    await writeFile(full, data);
    return { storageKey: key, sizeBytes: data.byteLength };
  }

  async get(key: string): Promise<Buffer> {
    return readFile(this.resolve(key));
  }

  private sign(key: string, expires: number): string {
    return createHmac('sha256', this.secret()).update(`${key}:${expires}`).digest('hex');
  }

  async getSignedUrl(key: string, expiresInSeconds: number): Promise<string> {
    const expires = Math.floor(Date.now() / 1000) + expiresInSeconds;
    const signature = this.sign(key, expires);
    const params = new URLSearchParams({ key, expires: String(expires), signature });
    return `/api/v1/files/download?${params.toString()}`;
  }

  verifySignedUrl(key: string, expires: number, signature: string): boolean {
    if (!Number.isFinite(expires) || expires < Math.floor(Date.now() / 1000)) return false;
    const expected = this.sign(key, expires);
    const a = Buffer.from(expected, 'hex');
    const b = Buffer.from(signature, 'hex');
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  }

  async delete(key: string): Promise<void> {
    await unlink(this.resolve(key)).catch(() => undefined);
  }
}
