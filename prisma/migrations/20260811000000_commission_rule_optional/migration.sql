-- DropForeignKey
ALTER TABLE "commissions" DROP CONSTRAINT "commissions_commissionRuleId_fkey";

-- AlterTable
ALTER TABLE "commissions" ALTER COLUMN "commissionRuleId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "commissions" ADD CONSTRAINT "commissions_commissionRuleId_fkey" FOREIGN KEY ("commissionRuleId") REFERENCES "commission_rules"("id") ON DELETE SET NULL ON UPDATE CASCADE;

