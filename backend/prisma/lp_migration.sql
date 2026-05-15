-- CreateTable
CREATE TABLE "LandingPage" (
    "id"           TEXT NOT NULL,
    "slug"         TEXT NOT NULL,
    "businessName" TEXT NOT NULL,
    "websiteUrl"   TEXT,
    "useCase"      TEXT,
    "brandColor"   TEXT DEFAULT '#ff5a1f',
    "logoUrl"      TEXT,
    "userId"       TEXT,
    "qrType"       TEXT DEFAULT 'ai',
    "sections"     TEXT,
    "status"       TEXT NOT NULL DEFAULT 'live',
    "scanCount"    INTEGER NOT NULL DEFAULT 0,
    "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LandingPage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LandingPage_slug_key" ON "LandingPage"("slug");

-- CreateIndex  
CREATE INDEX "LandingPage_userId_idx" ON "LandingPage"("userId");
