'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface Props {
  productId: string;
  initial: {
    name: string;
    nameAr: string;
    category: string;
    priceMinor: number;
    stockQty: number;
    description: string | null;
    imageUrl: string | null;
  };
}

export function EditProductForm({ productId, initial }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    const form = new FormData(e.currentTarget);
    const res = await fetch(`/api/v1/supplier/products/${productId}`, {
      method: 'PATCH',
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
      setError(body?.error?.message ?? 'تعذر حفظ التعديلات.');
      return;
    }

    setOpen(false);
    router.refresh();
  }

  if (!open) {
    return (
      <Button type="button" variant="secondary" onClick={() => setOpen(true)}>
        تعديل
      </Button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="mt-3 grid grid-cols-1 gap-3 rounded-lg border border-neutral-200 bg-neutral-50 p-4">
      <Input name="name" defaultValue={initial.name} placeholder="اسم المنتج (إنجليزي)" required minLength={2} maxLength={200} />
      <Input name="nameAr" defaultValue={initial.nameAr} placeholder="اسم المنتج (عربي)" required minLength={2} maxLength={200} />
      <Input name="category" defaultValue={initial.category} placeholder="الفئة" required minLength={2} maxLength={100} />
      <Input name="price" type="number" step="0.01" min="0" defaultValue={(initial.priceMinor / 100).toFixed(2)} placeholder="السعر (JOD)" required />
      <Input name="stockQty" type="number" min="0" defaultValue={initial.stockQty} placeholder="الكمية المتوفرة" />
      <Input name="imageUrl" type="url" defaultValue={initial.imageUrl ?? ''} placeholder="رابط صورة (اختياري)" />
      <textarea
        name="description"
        rows={3}
        maxLength={4000}
        defaultValue={initial.description ?? ''}
        placeholder="وصف المنتج (اختياري)"
        className="col-span-1 rounded-md border border-neutral-300 px-3 py-2 text-sm sm:col-span-2"
      />
      {error && <p className="col-span-1 text-sm text-red-600 sm:col-span-2">{error}</p>}
      <div className="col-span-1 flex gap-2 sm:col-span-2">
        <Button type="submit" disabled={submitting}>
          {submitting ? '...جارٍ الحفظ' : 'حفظ'}
        </Button>
        <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
          إلغاء
        </Button>
      </div>
    </form>
  );
}
