-- Inbound enquiries from clinics and hospitals asking to join.
--
-- Deliberately a separate table from "tenants": this is written by an unauthenticated
-- public form, and the tenant table is what every isolation guarantee in the system is
-- keyed on. Approval means a platform admin creates the tenant through the ordinary flow;
-- nothing here grants access on its own.

CREATE TYPE "PartnerApplicationStatus" AS ENUM ('PENDING', 'CONTACTED', 'APPROVED', 'REJECTED');

CREATE TABLE "partner_applications" (
    "id" TEXT NOT NULL,
    "organizationName" TEXT NOT NULL,
    "type" "TenantType" NOT NULL,
    "countryId" TEXT NOT NULL,
    "cityId" TEXT,
    "contactName" TEXT NOT NULL,
    "contactEmail" TEXT NOT NULL,
    "contactPhone" TEXT NOT NULL,
    "doctorCount" INTEGER,
    "notes" TEXT,
    "status" "PartnerApplicationStatus" NOT NULL DEFAULT 'PENDING',
    "reviewedByUserId" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "partner_applications_pkey" PRIMARY KEY ("id")
);

-- The review queue is always "pending, oldest first"; this is the index that serves it.
CREATE INDEX "partner_applications_status_createdAt_idx" ON "partner_applications"("status", "createdAt");

ALTER TABLE "partner_applications" ADD CONSTRAINT "partner_applications_countryId_fkey"
    FOREIGN KEY ("countryId") REFERENCES "countries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "partner_applications" ADD CONSTRAINT "partner_applications_cityId_fkey"
    FOREIGN KEY ("cityId") REFERENCES "cities"("id") ON DELETE SET NULL ON UPDATE CASCADE;
