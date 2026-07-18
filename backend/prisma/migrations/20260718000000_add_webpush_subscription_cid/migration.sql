-- AlterTable
ALTER TABLE "WebPushSubscription" ADD COLUMN     "cid" TEXT;

-- CreateIndex
CREATE INDEX "WebPushSubscription_cid_idx" ON "WebPushSubscription"("cid");
