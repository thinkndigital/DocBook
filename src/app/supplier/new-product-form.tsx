'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export function NewProductForm() {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    const form = new FormData(e.currentTarget);
    const res = await fetch('/api/v1/supplier/products', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: form.get('name'),
        nameAr: form.get('nameAr'),
        category: form.get('category'),
        priceMinor: Math.round(Number(form.get('price')) * 100),
        stockQty: Number(form.get('stockQty') || 0),
        description: form.get('description') || undefined,
        imageUrl: form.get('imageUrl') || undefined,
      }),
    });

    setSubmitting(false);

    if (!res.ok) {
      const body = await res.json().catch(() => null);
      setError(body?.error?.message ?? 'تعذر إضافة المنتج.');
      return;
    }

    setOpen(false);
    router.refresh();
  }

  if (!open) {
    return (
      <Button onClick={() => setOpen(true)} className="mb-4">
        + إضافة منتج
      </Button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="mb-6 grid grid-cols-1 gap-3 rounded-lg border border-neutral-200 bg-white p-4 sm:grid-cols-2">
      <Input name="name" placeholder="اسم المنتج (إنجليزي)" required minLength={2} maxLength={200} />
      <Input name="nameAr" placeholder="اسم المنتج (عربي)" required minLength={2} maxLength={200} />
      <Input name="category" placeholder="الفئة (مثال: أجهزة تشخيص)" required minLength={2} maxLength={100} />
      <Input name="price" type="number" step="0.01" min="0" placeholder="السعر (JOD)" required />
      <Input name="stockQty" type="number" min="0" placeholder="الكمية المتوفرة" />
      <Input name="imageUrl" type="url" placeholder="رابط صورة (اختياري)" />
      <textarea
        name="description"
        rows={3}
        maxLength={4000}
        placeholder="وصف المنتج (اختياري)"
        className="col-span-1 rounded-md border border-neutral-300 px-3 py-2 text-sm sm:col-span-2"
      />
      {error && <p className="col-span-1 text-sm text-red-600 sm:col-span-2">{error}</p>}
      <div className="col-span-1 flex gap-2 sm:col-span-2">
        <Button type="submit" disabled={submitting}>
          {submitting ? '...جارٍ الإضافة' : 'إضافة'}
        </Button>
        <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
          إلغاء
        </Button>
      </div>
    </form>
  );
}
