-- AlterTable
ALTER TABLE "StadtPocketOffer" ADD COLUMN "offerType" TEXT,
ADD COLUMN "offerDetails" JSONB;

-- CreateIndex
CREATE INDEX "StadtPocketOffer_offerType_idx" ON "StadtPocketOffer"("offerType");
