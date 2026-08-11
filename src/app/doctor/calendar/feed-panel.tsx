'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';

export function CalendarFeedPanel({ initialUrl }: { initialUrl: string }) {
  const [url, setUrl] = useState(initialUrl);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  async function rotate() {
    if (!window.confirm('سيؤدي هذا إلى إيقاف أي تقويم مشترك حالياً. هل تريد المتابعة؟')) return;
    setBusy(true);
    const res = await fetch('/api/v1/doctor/calendar-feed', { method: 'POST' });
    setBusy(false);
    if (!res.ok) return;
    const body = await res.json();
    setUrl(body.data.url);
    setCopied(false);
  }

  async function copy() {
    await navigator.clipboard.writeText(url);
    setCopied(true);
  }

  return (
    <div className="flex flex-col gap-3">
      <code className="block overflow-x-auto rounded-md bg-neutral-100 px-3 py-2 text-xs" dir="ltr">
        {url}
      </code>
      <div className="flex gap-2">
        <Button type="button" variant="secondary" onClick={copy}>
          {copied ? 'تم النسخ ✓' : 'نسخ الرابط'}
        </Button>
        <Button type="button" variant="danger" onClick={rotate} disabled={busy}>
          {busy ? '...' : 'إبطال وإنشاء رابط جديد'}
        </Button>
      </div>
    </div>
  );
}
