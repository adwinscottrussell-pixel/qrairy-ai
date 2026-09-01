-- CreateTable
CREATE TABLE "StadtPocketListing" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "subCategory" TEXT,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "shortDescription" TEXT NOT NULL,
    "longDescription" TEXT,
    "businessId" TEXT,
    "sourceProvider" TEXT,
    "sourceUrl" TEXT,
    "sourceType" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "verifiedBy" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StadtPocketListing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StadtPocketListingLocation" (
    "id" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "phone" TEXT,
    "website" TEXT,
    "hours" JSONB,
    "publicationStatus" TEXT NOT NULL DEFAULT 'draft',
    "businessLocationId" TEXT,
    "sourceProvider" TEXT,
    "sourceUrl" TEXT,
    "sourceType" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "verifiedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StadtPocketListingLocation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StadtPocketListing_slug_key" ON "StadtPocketListing"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "StadtPocketListing_businessId_key" ON "StadtPocketListing"("businessId");

-- CreateIndex
CREATE UNIQUE INDEX "StadtPocketListingLocation_businessLocationId_key" ON "StadtPocketListingLocation"("businessLocationId");

-- CreateIndex
CREATE INDEX "StadtPocketListingLocation_listingId_idx" ON "StadtPocketListingLocation"("listingId");

-- CreateIndex
CREATE INDEX "StadtPocketListingLocation_locationId_idx" ON "StadtPocketListingLocation"("locationId");

-- AddForeignKey
ALTER TABLE "StadtPocketListing" ADD CONSTRAINT "StadtPocketListing_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StadtPocketListingLocation" ADD CONSTRAINT "StadtPocketListingLocation_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "StadtPocketListing"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StadtPocketListingLocation" ADD CONSTRAINT "StadtPocketListingLocation_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StadtPocketListingLocation" ADD CONSTRAINT "StadtPocketListingLocation_businessLocationId_fkey" FOREIGN KEY ("businessLocationId") REFERENCES "BusinessLocation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
