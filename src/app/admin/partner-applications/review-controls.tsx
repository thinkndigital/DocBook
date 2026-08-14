'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

const NEXT_STATUSES = ['CONTACTED', 'APPROVED', 'REJECTED'] as const;
const LABEL: Record<(typeof NEXT_STATUSES)[number], string> = {
  CONTACTED: 'تم التواصل',
  APPROVED: 'قبول',
  REJECTED: 'رفض',
};

export function ReviewControls({ id, status }: { id: string; status: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState(false);

  async function set(next: string) {
    setBusy(next);
    setError(false);
    const res = await fetch(`/api/v1/admin/partner-applications/${id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ status: next }),
    });
    setBusy(null);
    if (!res.ok) {
      setError(true);
      return;
    }
    // Server component page — refresh re-runs the query rather than mutating local state,
    // so what is on screen is what is in the database.
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap gap-1">
        {NEXT_STATUSES.filter((s) => s !== status).map((s) => (
          <button
            key={s}
            type="button"
            disabled={busy !== null}
            onClick={() => set(s)}
            className="whitespace-nowrap rounded-md border border-neutral-300 px-2 py-1 text-xs text-neutral-700 hover:bg-neutral-50 disabled:opacity-50"
          >
            {busy === s ? '…' : LABEL[s]}
          </button>
        ))}
      </div>
      {error && <span className="text-xs text-red-600">تعذّر الحفظ</span>}
    </div>
  );
}
