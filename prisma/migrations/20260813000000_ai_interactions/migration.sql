-- CreateEnum
CREATE TYPE "AiInteractionKind" AS ENUM ('SYMPTOM_TRIAGE', 'PATIENT_ASSISTANT', 'CLINIC_BRIEFING');

-- CreateTable
CREATE TABLE "ai_interactions" (
    "id" TEXT NOT NULL,
    "kind" "AiInteractionKind" NOT NULL,
    "userId" TEXT,
    "tenantId" TEXT,
    "actorKey" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "inputChars" INTEGER NOT NULL DEFAULT 0,
    "suggestedSlugs" TEXT[],
    "redFlagged" BOOLEAN NOT NULL DEFAULT false,
    "injectionFlagged" BOOLEAN NOT NULL DEFAULT false,
    "disclaimerVersion" TEXT NOT NULL,
    "latencyMs" INTEGER NOT NULL DEFAULT 0,
    "succeeded" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_interactions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ai_interactions_actorKey_createdAt_idx" ON "ai_interactions"("actorKey", "createdAt");

-- CreateIndex
CREATE INDEX "ai_interactions_tenantId_createdAt_idx" ON "ai_interactions"("tenantId", "createdAt");

-- AddForeignKey
ALTER TABLE "ai_interactions" ADD CONSTRAINT "ai_interactions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_interactions" ADD CONSTRAINT "ai_interactions_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

