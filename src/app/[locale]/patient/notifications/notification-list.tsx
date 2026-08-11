'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

interface Item {
  id: string;
  type: string;
  createdAt: string;
  readAt: string | null;
  payload: { subject?: string; body?: string } | null;
}

export function NotificationList({
  initial,
  labels,
}: {
  initial: Item[];
  labels: { markAllRead: string; none: string; unread: string };
}) {
  const router = useRouter();
  const [items, setItems] = useState(initial);
  const [busy, setBusy] = useState(false);

  async function markAll() {
    setBusy(true);
    await fetch('/api/v1/notifications', { method: 'PATCH' });
    setBusy(false);
    setItems(items.map((i) => ({ ...i, readAt: i.readAt ?? new Date().toISOString() })));
    router.refresh();
  }

  async function markOne(id: string) {
    await fetch(`/api/v1/notifications/${id}/read`, { method: 'PATCH' });
    setItems(items.map((i) => (i.id === id ? { ...i, readAt: new Date().toISOString() } : i)));
    router.refresh();
  }

  const unread = items.filter((i) => !i.readAt).length;

  if (items.length === 0) {
    return <p className="text-sm text-neutral-500">{labels.none}</p>;
  }

  return (
    <div>
      {unread > 0 && (
        <div className="mb-4 flex items-center justify-between">
          <span className="text-sm text-neutral-600">
            {unread} {labels.unread}
          </span>
          <button
            type="button"
            onClick={markAll}
            disabled={busy}
            className="text-sm text-brand-700 underline hover:no-underline disabled:opacity-50"
          >
            {labels.markAllRead}
          </button>
        </div>
      )}
      <ul className="flex flex-col gap-2">
        {items.map((n) => (
          <li
            key={n.id}
            onClick={() => !n.readAt && markOne(n.id)}
            className={`cursor-pointer rounded-lg border p-4 ${
              n.readAt ? 'border-neutral-200 bg-white' : 'border-brand-200 bg-brand-50'
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-neutral-900">{n.payload?.subject ?? n.type}</p>
                <p className="mt-1 text-sm text-neutral-700">{n.payload?.body}</p>
              </div>
              <span className="shrink-0 text-xs text-neutral-400">{n.createdAt.slice(0, 10)}</span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
