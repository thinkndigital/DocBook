import type { StorageProvider } from '@/lib/storage/provider';
import { LocalStorageAdapter } from '@/lib/storage/local-adapter';
import { S3StorageAdapter } from '@/lib/storage/s3-adapter';

let cached: StorageProvider | undefined;

/**
 * Mirrors the payments factory: unknown provider throws rather than silently degrading —
 * unlike a notification channel, a storage backend that failed to configure has nowhere
 * safe to "degrade" to (there's no honest "documents disabled" state once code is already
 * calling `put`/`get`), so failing loudly at resolution time is the same call
 * `getPaymentProvider()` already makes for the same reason.
 */
export function getStorageProvider(): StorageProvider {
  if (cached) return cached;
  const configured = process.env.STORAGE_PROVIDER ?? 'local';
  switch (configured) {
    case 'local':
      cached = new LocalStorageAdapter();
      return cached;
    case 's3': {
      const bucket = process.env.S3_BUCKET;
      const region = process.env.S3_REGION;
      const accessKeyId = process.env.S3_ACCESS_KEY_ID;
      const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY;
      if (!bucket || !region || !accessKeyId || !secretAccessKey) {
        throw new Error(
          'STORAGE_PROVIDER=s3 requires S3_BUCKET, S3_REGION, S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY to be set.'
        );
      }
      cached = new S3StorageAdapter(bucket, region, accessKeyId, secretAccessKey, process.env.S3_ENDPOINT || undefined);
      return cached;
    }
    default:
      throw new Error(`Unknown STORAGE_PROVIDER "${configured}". Implement a StorageProvider adapter and register it here.`);
  }
}

export type { StorageProvider } from '@/lib/storage/provider';
