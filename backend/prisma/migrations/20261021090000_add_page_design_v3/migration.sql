-- AlterTable
ALTER TABLE "LandingPage" ADD COLUMN     "renderer" TEXT NOT NULL DEFAULT 'legacy';

-- CreateTable
CREATE TABLE "PageDesign" (
    "id" TEXT NOT NULL,
    "landingPageId" TEXT NOT NULL,
    "schemaVersion" INTEGER NOT NULL DEFAULT 1,
    "draft" JSONB NOT NULL,
    "draftRevision" INTEGER NOT NULL DEFAULT 0,
    "publishedVersionId" TEXT,
    "updatedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PageDesign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PageDesignVersion" (
    "id" TEXT NOT NULL,
    "designId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "content" JSONB NOT NULL,
    "createdByUserId" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PageDesignVersion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PageDesign_landingPageId_key" ON "PageDesign"("landingPageId");

-- CreateIndex
CREATE UNIQUE INDEX "PageDesignVersion_designId_version_key" ON "PageDesignVersion"("designId", "version");

-- AddForeignKey
ALTER TABLE "PageDesign" ADD CONSTRAINT "PageDesign_landingPageId_fkey" FOREIGN KEY ("landingPageId") REFERENCES "LandingPage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PageDesignVersion" ADD CONSTRAINT "PageDesignVersion_designId_fkey" FOREIGN KEY ("designId") REFERENCES "PageDesign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

