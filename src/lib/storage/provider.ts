export interface StoredObject {
  storageKey: string;
  sizeBytes: number;
}

/**
 * Storage contract for medical attachments and generated prescription PDFs.
 *
 * `getSignedUrl` returns a short-lived, signature-bearing URL — never a public path.
 * Swapping in S3/GCS means writing one adapter; no service or route changes.
 */
export interface StorageProvider {
  readonly id: string;
  put(key: string, data: Buffer, contentType: string): Promise<StoredObject>;
  get(key: string): Promise<Buffer>;
  getSignedUrl(key: string, expiresInSeconds: number): Promise<string>;
  verifySignedUrl(key: string, expires: number, signature: string): boolean;
  delete(key: string): Promise<void>;
}
