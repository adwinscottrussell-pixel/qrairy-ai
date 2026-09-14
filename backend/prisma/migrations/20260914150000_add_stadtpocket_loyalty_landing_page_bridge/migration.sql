-- AlterTable
ALTER TABLE "StadtPocketListingLocation" ADD COLUMN     "loyaltyLandingPageId" TEXT;

-- CreateIndex
CREATE INDEX "StadtPocketListingLocation_loyaltyLandingPageId_idx" ON "StadtPocketListingLocation"("loyaltyLandingPageId");

-- AddForeignKey
ALTER TABLE "StadtPocketListingLocation" ADD CONSTRAINT "StadtPocketListingLocation_loyaltyLandingPageId_fkey" FOREIGN KEY ("loyaltyLandingPageId") REFERENCES "LandingPage"("id") ON DELETE SET NULL ON UPDATE CASCADE;
