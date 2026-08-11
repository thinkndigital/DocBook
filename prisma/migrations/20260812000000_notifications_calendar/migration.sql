-- AlterTable
ALTER TABLE "doctors" ADD COLUMN     "calendarFeedToken" TEXT;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "notificationPrefs" JSONB;

-- CreateIndex
CREATE UNIQUE INDEX "doctors_calendarFeedToken_key" ON "doctors"("calendarFeedToken");

