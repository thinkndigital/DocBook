-- Equipment marketplace: manufacturers/distributors list products, doctors order.
--
-- A separate business line from booking. Suppliers are tenant-less like Representative and
-- Patient (a manufacturer sells across every clinic on the platform), so none of these
-- tables carry a tenantId and none go into tenant.ts's scoped-model sets — ownership is an
-- explicit supplierId/doctorId check in src/lib/services/equipment.ts.

ALTER TYPE "UserRole" ADD VALUE 'SUPPLIER';

CREATE TYPE "EquipmentProductStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');
CREATE TYPE "EquipmentOrderStatus" AS ENUM ('PENDING', 'CONFIRMED', 'SHIPPED', 'DELIVERED', 'CANCELLED');

CREATE TABLE "suppliers" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameAr" TEXT NOT NULL,
    "countryId" TEXT NOT NULL,
    "phone" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "suppliers_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "suppliers_userId_key" ON "suppliers"("userId");
CREATE INDEX "suppliers_countryId_idx" ON "suppliers"("countryId");

ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_countryId_fkey"
    FOREIGN KEY ("countryId") REFERENCES "countries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "equipment_products" (
    "id" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameAr" TEXT NOT NULL,
    "description" TEXT,
    "descriptionAr" TEXT,
    "category" TEXT NOT NULL,
    "priceMinor" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'JOD',
    "stockQty" INTEGER NOT NULL DEFAULT 0,
    "status" "EquipmentProductStatus" NOT NULL DEFAULT 'DRAFT',
    "imageUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "equipment_products_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "equipment_products_supplierId_idx" ON "equipment_products"("supplierId");
CREATE INDEX "equipment_products_status_idx" ON "equipment_products"("status");

ALTER TABLE "equipment_products" ADD CONSTRAINT "equipment_products_supplierId_fkey"
    FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "equipment_orders" (
    "id" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "doctorId" TEXT NOT NULL,
    "status" "EquipmentOrderStatus" NOT NULL DEFAULT 'PENDING',
    "totalMinor" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'JOD',
    "shippingAddress" TEXT NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "equipment_orders_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "equipment_orders_supplierId_createdAt_idx" ON "equipment_orders"("supplierId", "createdAt");
CREATE INDEX "equipment_orders_doctorId_createdAt_idx" ON "equipment_orders"("doctorId", "createdAt");

ALTER TABLE "equipment_orders" ADD CONSTRAINT "equipment_orders_supplierId_fkey"
    FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "equipment_orders" ADD CONSTRAINT "equipment_orders_doctorId_fkey"
    FOREIGN KEY ("doctorId") REFERENCES "doctors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "equipment_order_items" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitPriceMinor" INTEGER NOT NULL,

    CONSTRAINT "equipment_order_items_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "equipment_order_items_orderId_idx" ON "equipment_order_items"("orderId");

ALTER TABLE "equipment_order_items" ADD CONSTRAINT "equipment_order_items_orderId_fkey"
    FOREIGN KEY ("orderId") REFERENCES "equipment_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "equipment_order_items" ADD CONSTRAINT "equipment_order_items_productId_fkey"
    FOREIGN KEY ("productId") REFERENCES "equipment_products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
