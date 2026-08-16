import { mkdir, writeFile, readFile, unlink } from 'node:fs/promises';
import path from 'node:path';
import type { StorageProvider, StoredObject } from '@/lib/storage/provider';
import { buildSignedDownloadUrl, verifyStorageSignature } from '@/lib/storage/url-signing';

/**
 * Development/self-hosted adapter. Files live outside the Next.js public directory, so
 * there is no route by which they can be served without going through the download route's
 * signature *and* permission checks.
 */
export class LocalStorageAdapter implements StorageProvider {
  readonly id = 'local';

  private root = process.env.STORAGE_LOCAL_PATH ?? './.storage';

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

  async getSignedUrl(key: string, expiresInSeconds: number): Promise<string> {
    return buildSignedDownloadUrl(key, expiresInSeconds);
  }

  verifySignedUrl(key: string, expires: number, signature: string): boolean {
    return verifyStorageSignature(key, expires, signature);
  }

  async delete(key: string): Promise<void> {
    await unlink(this.resolve(key)).catch(() => undefined);
  }
}
