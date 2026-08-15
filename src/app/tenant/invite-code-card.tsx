'use client';

import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

export function InviteCodeCard() {
  const [code, setCode] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetch('/api/v1/tenant/invite-code')
      .then((res) => res.json())
      .then((body) => setCode(body.data.inviteCode));
  }, []);

  async function rotate() {
    if (!window.confirm('سيتوقف الكود الحالي عن العمل فوراً. أي طبيب لديه الكود القديم لن يستطيع استخدامه بعد الآن. متابعة؟')) return;
    setBusy(true);
    const res = await fetch('/api/v1/tenant/invite-code', { method: 'POST' });
    setBusy(false);
    if (!res.ok) return;
    const body = await res.json();
    setCode(body.data.inviteCode);
    setCopied(false);
  }

  async function copy() {
    if (!code) return;
    await navigator.clipboard.writeText(code);
    setCopied(true);
  }

  return (
    <Card className="mt-6">
      <h2 className="mb-2 font-semibold text-neutral-900">كود دعوة العيادة</h2>
      <p className="mb-3 text-sm text-neutral-600">
        شارك هذا الكود مع أي طبيب تريده أن ينضم لعيادتك — يدخله عند إنشاء حسابه في صفحة التسجيل
        (اختيار &ldquo;طبيب&rdquo; ثم &ldquo;لدي عيادة مسجّلة بالفعل&rdquo;).
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <code className="rounded-md bg-neutral-100 px-4 py-2 text-lg font-bold tracking-widest" dir="ltr">
          {code ?? '········'}
        </code>
        <Button type="button" variant="secondary" onClick={copy} disabled={!code}>
          {copied ? 'تم النسخ ✓' : 'نسخ'}
        </Button>
        <Button type="button" variant="danger" onClick={rotate} disabled={busy || !code}>
          {busy ? '...' : 'إبطال وإنشاء كود جديد'}
        </Button>
      </div>
    </Card>
  );
}
