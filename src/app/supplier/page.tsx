import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getOwnSupplierProfile } from '@/lib/services/suppliers';
import { listOwnProducts } from '@/lib/services/equipment';
import { NewProductForm } from './new-product-form';
import { ProductActions } from './product-actions';

export const dynamic = 'force-dynamic';

const STATUS_LABEL: Record<string, string> = {
  DRAFT: 'مسودة',
  PUBLISHED: 'منشور',
  ARCHIVED: 'مؤرشف',
};

export default async function SupplierProductsPage() {
  const session = await getServerSession(authOptions);
  const supplier = await getOwnSupplierProfile(session!.user.id);
  if (!supplier) redirect('/');

  const products = await listOwnProducts(supplier.id);

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-neutral-900">منتجاتي</h1>
      <NewProductForm />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {products.length === 0 && <p className="text-sm text-neutral-500">لا توجد منتجات بعد.</p>}
        {products.map((product) => (
          <div key={product.id} className="rounded-lg border border-neutral-200 bg-white p-5">
            {product.imageUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={product.imageUrl} alt={product.nameAr} className="mb-3 h-32 w-full rounded-md object-cover" />
            )}
            <h2 className="font-semibold text-neutral-900">{product.nameAr}</h2>
            <p className="mt-1 text-sm text-neutral-500">{product.category}</p>
            <p className="mt-1 text-lg font-bold text-brand-700">
              {(product.priceMinor / 100).toFixed(2)} {product.currency}
            </p>
            <p className="mt-1 text-sm text-neutral-500">المخزون: {product.stockQty}</p>
            <p className="mt-1 text-xs text-neutral-500">{STATUS_LABEL[product.status]}</p>
            <ProductActions productId={product.id} status={product.status} />
          </div>
        ))}
      </div>
    </div>
  );
}
