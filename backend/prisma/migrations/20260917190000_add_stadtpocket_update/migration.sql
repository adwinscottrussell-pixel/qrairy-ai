-- CreateTable
CREATE TABLE "StadtPocketUpdate" (
    "id" TEXT NOT NULL,
    "listingLocationId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "image" JSONB,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "publishedAt" TIMESTAMP(3),
    "draftData" JSONB,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StadtPocketUpdate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StadtPocketUpdate_listingLocationId_idx" ON "StadtPocketUpdate"("listingLocationId");

-- CreateIndex
CREATE INDEX "StadtPocketUpdate_status_idx" ON "StadtPocketUpdate"("status");

-- AddForeignKey
ALTER TABLE "StadtPocketUpdate" ADD CONSTRAINT "StadtPocketUpdate_listingLocationId_fkey" FOREIGN KEY ("listingLocationId") REFERENCES "StadtPocketListingLocation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
