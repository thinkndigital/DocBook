'use client';

import { useState, type ChangeEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';

export function PrescriptionDownload({ prescriptionId, label }: { prescriptionId: string; label: string }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function download() {
    setLoading(true);
    setError(null);
    const res = await fetch(`/api/v1/patient/prescriptions/${prescriptionId}/pdf`);
    setLoading(false);
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      setError(body?.error?.message ?? 'تعذر تحميل الوصفة.');
      return;
    }
    const body = await res.json();
    window.open(body.data.url, '_blank');
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button type="button" onClick={download} disabled={loading} className="text-sm text-brand-700 underline hover:no-underline">
        {loading ? '...' : label}
      </button>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}

export function DocumentUpload({ label }: { label: string }) {
  const router = useRouter();
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError(null);

    const form = new FormData();
    form.append('file', file);
    const res = await fetch('/api/v1/patient/documents', { method: 'POST', body: form });
    setUploading(false);
    e.target.value = '';

    if (!res.ok) {
      const body = await res.json().catch(() => null);
      setError(body?.error?.message ?? 'تعذر رفع الملف.');
      return;
    }
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-1">
      <label className="w-fit">
        <span className="sr-only">{label}</span>
        <input type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={handleChange} disabled={uploading} className="text-sm" />
      </label>
      {uploading && <p className="text-xs text-neutral-500">...جارٍ الرفع</p>}
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
