import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getOwnSupplierProfile } from '@/lib/services/suppliers';
import { listIncomingEquipmentOrders } from '@/lib/services/equipment';
import { Badge } from '@/components/ui/badge';
import { OrderStatusActions } from './order-status-actions';

export const dynamic = 'force-dynamic';

const STATUS_TONE: Record<string, 'neutral' | 'success' | 'warning' | 'danger'> = {
  PENDING: 'warning',
  CONFIRMED: 'success',
  SHIPPED: 'success',
  DELIVERED: 'neutral',
  CANCELLED: 'danger',
};

const STATUS_LABEL: Record<string, string> = {
  PENDING: 'بانتظار التأكيد',
  CONFIRMED: 'مؤكد',
  SHIPPED: 'تم الشحن',
  DELIVERED: 'تم التسليم',
  CANCELLED: 'ملغى',
};

export default async function SupplierOrdersPage() {
  const session = await getServerSession(authOptions);
  const supplier = await getOwnSupplierProfile(session!.user.id);
  if (!supplier) redirect('/');

  const orders = await listIncomingEquipmentOrders(supplier.id);

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-neutral-900">الطلبات الواردة</h1>
      <div className="flex flex-col gap-4">
        {orders.length === 0 && <p className="text-sm text-neutral-500">لا توجد طلبات بعد.</p>}
        {orders.map((order) => (
          <div key={order.id} className="rounded-lg border border-neutral-200 bg-white p-5">
            <div className="mb-2 flex items-center justify-between">
              <p className="font-medium text-neutral-900">د. {order.doctor.user.name}</p>
              <Badge tone={STATUS_TONE[order.status]}>{STATUS_LABEL[order.status]}</Badge>
            </div>
            <ul className="mb-2 text-sm text-neutral-700">
              {order.items.map((item) => (
                <li key={item.id}>
                  {item.product.nameAr} × {item.quantity} — {(item.unitPriceMinor / 100).toFixed(2)} {order.currency}
                </li>
              ))}
            </ul>
            <p className="text-sm font-bold text-brand-700">
              الإجمالي: {(order.totalMinor / 100).toFixed(2)} {order.currency}
            </p>
            <p className="mt-1 text-sm text-neutral-500">عنوان الشحن: {order.shippingAddress}</p>
            {order.notes && <p className="mt-1 text-sm text-neutral-500">ملاحظات: {order.notes}</p>}
            <OrderStatusActions orderId={order.id} status={order.status} />
          </div>
        ))}
      </div>
    </div>
  );
}
