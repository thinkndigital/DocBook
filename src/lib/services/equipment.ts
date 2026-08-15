import { db } from '@/lib/db';
import { recordAudit } from '@/lib/audit';
import type { SessionUser } from '@/lib/auth';
import type { z } from 'zod';
import type { createProductSchema, updateProductSchema, createEquipmentOrderSchema } from '@/lib/validation/equipment';
import type { EquipmentOrderStatus, Prisma } from '@prisma/client';

type CreateProductInput = z.infer<typeof createProductSchema>;
type UpdateProductInput = z.infer<typeof updateProductSchema>;
type CreateOrderInput = z.infer<typeof createEquipmentOrderSchema>;

export class NotOwnProductError extends Error {}
export class NotOwnOrderError extends Error {}
export class InvalidProductError extends Error {}
export class MixedSupplierOrderError extends Error {}
export class InsufficientStockError extends Error {}
export class InvalidOrderStatusTransitionError extends Error {}

const PRODUCT_INCLUDE = { supplier: { select: { id: true, name: true, nameAr: true } } } as const;

// ---------- Supplier: own product catalog ----------

export async function listOwnProducts(supplierId: string) {
  return db.equipmentProduct.findMany({
    where: { supplierId, deletedAt: null },
    orderBy: { createdAt: 'desc' },
  });
}

export async function createProduct(input: CreateProductInput, actor: SessionUser, supplierId: string) {
  const product = await db.equipmentProduct.create({ data: { ...input, supplierId } });
  await recordAudit({
    actorUserId: actor.id,
    tenantId: null,
    action: 'EQUIPMENT_PRODUCT_CREATED',
    entityType: 'EquipmentProduct',
    entityId: product.id,
    afterState: { name: product.name, priceMinor: product.priceMinor },
  });
  return product;
}

async function assertOwnProduct(productId: string, supplierId: string) {
  const product = await db.equipmentProduct.findFirst({ where: { id: productId, deletedAt: null } });
  if (!product || product.supplierId !== supplierId) throw new NotOwnProductError('This product does not belong to you.');
  return product;
}

export async function updateProduct(id: string, input: UpdateProductInput, supplierId: string) {
  await assertOwnProduct(id, supplierId);
  return db.equipmentProduct.update({ where: { id }, data: input });
}

export async function deleteProduct(id: string, supplierId: string) {
  await assertOwnProduct(id, supplierId);
  await db.equipmentProduct.update({ where: { id }, data: { deletedAt: new Date(), status: 'ARCHIVED' } });
}

// ---------- Doctor: browse the public catalog ----------

export async function browseEquipmentProducts(filters: { search?: string; category?: string }) {
  const where: Prisma.EquipmentProductWhereInput = { status: 'PUBLISHED', deletedAt: null };
  if (filters.category) where.category = filters.category;
  if (filters.search) {
    where.OR = [
      { name: { contains: filters.search, mode: 'insensitive' } },
      { nameAr: { contains: filters.search, mode: 'insensitive' } },
    ];
  }
  return db.equipmentProduct.findMany({ where, include: PRODUCT_INCLUDE, orderBy: { createdAt: 'desc' } });
}

// ---------- Doctor: orders ----------

/**
 * One order is one supplier — items from more than one supplier's catalog can't be mixed
 * into a single order (no cross-supplier shipment or split payment exists), matching how a
 * real checkout would need a cart per vendor. `unitPriceMinor` snapshots the product's price
 * at order time; a later price change never reprices a placed order. Stock is decremented in
 * the same transaction the order is created in, so two doctors racing for the last unit
 * can't both succeed.
 */
export async function createEquipmentOrder(input: CreateOrderInput, actor: SessionUser) {
  const doctor = await db.doctor.findUnique({ where: { userId: actor.id } });
  if (!doctor) throw new InvalidProductError('No doctor profile for this account.');

  const productIds = input.items.map((i) => i.productId);
  const products = await db.equipmentProduct.findMany({
    where: { id: { in: productIds }, status: 'PUBLISHED', deletedAt: null },
  });
  if (products.length !== productIds.length) {
    throw new InvalidProductError('One or more products are unavailable.');
  }

  const supplierIds = new Set(products.map((p) => p.supplierId));
  if (supplierIds.size > 1) {
    throw new MixedSupplierOrderError('An order can only contain products from one supplier at a time.');
  }
  const supplierId = products[0]!.supplierId;

  const productById = new Map(products.map((p) => [p.id, p]));
  let totalMinor = 0;
  for (const item of input.items) {
    const product = productById.get(item.productId)!;
    if (product.stockQty < item.quantity) {
      throw new InsufficientStockError(`Not enough stock for "${product.name}".`);
    }
    totalMinor += product.priceMinor * item.quantity;
  }

  const order = await db.$transaction(async (tx) => {
    for (const item of input.items) {
      await tx.equipmentProduct.update({
        where: { id: item.productId },
        data: { stockQty: { decrement: item.quantity } },
      });
    }
    return tx.equipmentOrder.create({
      data: {
        supplierId,
        doctorId: doctor.id,
        totalMinor,
        currency: products[0]!.currency,
        shippingAddress: input.shippingAddress,
        notes: input.notes,
        items: {
          create: input.items.map((item) => ({
            productId: item.productId,
            quantity: item.quantity,
            unitPriceMinor: productById.get(item.productId)!.priceMinor,
          })),
        },
      },
      include: { items: { include: { product: true } }, supplier: { select: { name: true, nameAr: true } } },
    });
  });

  await recordAudit({
    actorUserId: actor.id,
    tenantId: null,
    action: 'EQUIPMENT_ORDER_CREATED',
    entityType: 'EquipmentOrder',
    entityId: order.id,
    afterState: { supplierId, totalMinor },
  });

  return order;
}

export async function listOwnEquipmentOrders(actorUserId: string) {
  const doctor = await db.doctor.findUnique({ where: { userId: actorUserId } });
  if (!doctor) return [];
  return db.equipmentOrder.findMany({
    where: { doctorId: doctor.id },
    include: { items: { include: { product: true } }, supplier: { select: { name: true, nameAr: true } } },
    orderBy: { createdAt: 'desc' },
  });
}

// ---------- Supplier: incoming orders ----------

export async function listIncomingEquipmentOrders(supplierId: string) {
  return db.equipmentOrder.findMany({
    where: { supplierId },
    include: { items: { include: { product: true } }, doctor: { include: { user: { select: { name: true } } } } },
    orderBy: { createdAt: 'desc' },
  });
}

const ALLOWED_ORDER_TRANSITIONS: Record<EquipmentOrderStatus, EquipmentOrderStatus[]> = {
  PENDING: ['CONFIRMED', 'CANCELLED'],
  CONFIRMED: ['SHIPPED', 'CANCELLED'],
  SHIPPED: ['DELIVERED'],
  DELIVERED: [],
  CANCELLED: [],
};

export async function updateEquipmentOrderStatus(
  orderId: string,
  nextStatus: EquipmentOrderStatus,
  actor: SessionUser,
  supplierId: string
) {
  const order = await db.equipmentOrder.findFirst({ where: { id: orderId } });
  if (!order || order.supplierId !== supplierId) throw new NotOwnOrderError('This order does not belong to you.');

  const allowed = ALLOWED_ORDER_TRANSITIONS[order.status];
  if (!allowed.includes(nextStatus)) {
    throw new InvalidOrderStatusTransitionError(`Cannot move order from ${order.status} to ${nextStatus}.`);
  }

  const updated = await db.equipmentOrder.update({ where: { id: orderId }, data: { status: nextStatus } });

  await recordAudit({
    actorUserId: actor.id,
    tenantId: null,
    action: `EQUIPMENT_ORDER_${nextStatus}`,
    entityType: 'EquipmentOrder',
    entityId: orderId,
    beforeState: { status: order.status },
    afterState: { status: nextStatus },
  });

  return updated;
}
