import type { StorageProvider } from '@/lib/storage/provider';
import { LocalStorageAdapter } from '@/lib/storage/local-adapter';

let cached: StorageProvider | undefined;

/** Mirrors the payments factory: unknown provider throws rather than silently degrading. */
export function getStorageProvider(): StorageProvider {
  if (cached) return cached;
  const configured = process.env.STORAGE_PROVIDER ?? 'local';
  switch (configured) {
    case 'local':
      cached = new LocalStorageAdapter();
      return cached;
    default:
      throw new Error(`Unknown STORAGE_PROVIDER "${configured}". Implement a StorageProvider adapter and register it here.`);
  }
}

export type { StorageProvider } from '@/lib/storage/provider';
