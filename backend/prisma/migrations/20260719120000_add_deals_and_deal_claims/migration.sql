-- CreateTable
CREATE TABLE "Deal" (
    "id" TEXT NOT NULL,
    "publicId" TEXT NOT NULL,
    "landingPageSlug" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "shortDescription" TEXT NOT NULL,
    "fullDescription" TEXT NOT NULL,
    "imageUrl" TEXT,
    "ctaLabel" TEXT NOT NULL DEFAULT 'Claim Deal',
    "startAt" TIMESTAMP(3) NOT NULL,
    "endAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'draft',
    "redemptionType" TEXT NOT NULL DEFAULT 'single_use',
    "redemptionLimit" INTEGER,
    "terms" TEXT,
    "originalPrice" DOUBLE PRECISION,
    "dealPrice" DOUBLE PRECISION,
    "discountText" TEXT,
    "pushMessage" TEXT,
    "featured" BOOLEAN NOT NULL DEFAULT false,
    "locationRef" TEXT,
    "viewCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Deal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DealClaim" (
    "id" TEXT NOT NULL,
    "dealId" TEXT NOT NULL,
    "cid" TEXT,
    "token" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'claimed',
    "claimedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "redeemedAt" TIMESTAMP(3),
    "redeemedBy" TEXT,
    "redeemedLocationRef" TEXT,
    "expiresAt" TIMESTAMP(3),

    CONSTRAINT "DealClaim_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Deal_publicId_key" ON "Deal"("publicId");

-- CreateIndex
CREATE INDEX "Deal_landingPageSlug_idx" ON "Deal"("landingPageSlug");

-- CreateIndex
CREATE UNIQUE INDEX "Deal_landingPageSlug_slug_key" ON "Deal"("landingPageSlug", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "DealClaim_token_key" ON "DealClaim"("token");

-- CreateIndex
CREATE INDEX "DealClaim_dealId_idx" ON "DealClaim"("dealId");

-- CreateIndex
CREATE INDEX "DealClaim_cid_idx" ON "DealClaim"("cid");

-- AddForeignKey
ALTER TABLE "DealClaim" ADD CONSTRAINT "DealClaim_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Deal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
