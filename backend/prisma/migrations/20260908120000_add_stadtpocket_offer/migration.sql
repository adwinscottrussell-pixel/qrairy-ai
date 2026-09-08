-- CreateTable
CREATE TABLE "StadtPocketOffer" (
    "id" TEXT NOT NULL,
    "listingLocationId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "offerText" TEXT NOT NULL,
    "image" JSONB,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "publishedAt" TIMESTAMP(3),
    "draftData" JSONB,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StadtPocketOffer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StadtPocketOffer_listingLocationId_idx" ON "StadtPocketOffer"("listingLocationId");

-- CreateIndex
CREATE INDEX "StadtPocketOffer_status_idx" ON "StadtPocketOffer"("status");

-- AddForeignKey
ALTER TABLE "StadtPocketOffer" ADD CONSTRAINT "StadtPocketOffer_listingLocationId_fkey" FOREIGN KEY ("listingLocationId") REFERENCES "StadtPocketListingLocation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
