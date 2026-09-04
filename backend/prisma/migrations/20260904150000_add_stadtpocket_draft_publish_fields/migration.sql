-- AlterTable
ALTER TABLE "StadtPocketListing" ADD COLUMN     "draftData" JSONB;

-- AlterTable
ALTER TABLE "StadtPocketListingLocation" ADD COLUMN     "draftData" JSONB,
ADD COLUMN     "publishedAt" TIMESTAMP(3);
