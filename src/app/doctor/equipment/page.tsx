'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface Product {
  id: string;
  name: string;
  nameAr: string;
  category: string;
  priceMinor: number;
  currency: string;
  stockQty: number;
  imageUrl: string | null;
  supplier: { name: string; nameAr: string };
}

export default function DoctorEquipmentPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [search, setSearch] = useState('');
  const [shippingAddress, setShippingAddress] = useState('');
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [ordering, setOrdering] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams();
    if (search) params.set('search', search);
    fetch(`/api/v1/equipment/products?${params.toString()}`)
      .then((res) => res.json())
      .then((body) => setProducts(body.data ?? []));
  }, [search]);

  async function order(productId: string) {
    setMessage(null);
    if (!shippingAddress.trim()) {
      setMessage('أدخل عنوان الشحن أولاً.');
      return;
    }
    const quantity = quantities[productId] ?? 1;
    setOrdering(productId);
    const res = await fetch('/api/v1/doctor/equipment-orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items: [{ productId, quantity }], shippingAddress }),
    });
    setOrdering(null);
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      setMessage(body?.error?.message ?? 'تعذر إتمام الطلب.');
      return;
    }
    setMessage('تم إرسال الطلب بنجاح.');
  }

  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold text-neutral-900">تجهيزات ومستلزمات طبية</h1>
      <p className="mb-4 text-sm text-neutral-600">تصفّح منتجات الموردين واطلب مباشرة.</p>

      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Input placeholder="بحث..." value={search} onChange={(e) => setSearch(e.target.value)} />
        <Input
          placeholder="عنوان الشحن (يُستخدم لكل طلب)"
          value={shippingAddress}
          onChange={(e) => setShippingAddress(e.target.value)}
        />
      </div>

      {message && <p className="mb-4 text-sm text-brand-700">{message}</p>}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {products.length === 0 && <p className="text-sm text-neutral-500">لا توجد منتجات متاحة حالياً.</p>}
        {products.map((product) => (
          <div key={product.id} className="rounded-lg border border-neutral-200 bg-white p-5">
            {product.imageUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={product.imageUrl} alt={product.nameAr} className="mb-3 h-32 w-full rounded-md object-cover" />
            )}
            <h2 className="font-semibold text-neutral-900">{product.nameAr}</h2>
            <p className="mt-1 text-xs text-neutral-500">المورد: {product.supplier.nameAr}</p>
            <p className="mt-1 text-sm text-neutral-500">{product.category}</p>
            <p className="mt-1 text-lg font-bold text-brand-700">
              {(product.priceMinor / 100).toFixed(2)} {product.currency}
            </p>
            <p className="mt-1 text-xs text-neutral-500">المتوفر: {product.stockQty}</p>
            <div className="mt-3 flex items-center gap-2">
              <input
                type="number"
                min={1}
                max={product.stockQty}
                defaultValue={1}
                onChange={(e) => setQuantities((q) => ({ ...q, [product.id]: Number(e.target.value) }))}
                className="w-20 rounded-md border border-neutral-300 px-2 py-1.5 text-sm"
              />
              <Button
                type="button"
                disabled={ordering === product.id || product.stockQty === 0}
                onClick={() => order(product.id)}
              >
                {ordering === product.id ? '...جارٍ الطلب' : 'اطلب'}
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
