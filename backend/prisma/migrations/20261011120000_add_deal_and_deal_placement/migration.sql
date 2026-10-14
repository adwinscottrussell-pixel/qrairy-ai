-- CreateTable
CREATE TABLE "Deal" (
    "id" TEXT NOT NULL,
    "ownerUserId" TEXT NOT NULL,
    "businessId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "offerText" TEXT NOT NULL,
    "offerType" TEXT,
    "offerDetails" JSONB,
    "image" JSONB,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "publishedAt" TIMESTAMP(3),
    "draftData" JSONB,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Deal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DealPlacement" (
    "id" TEXT NOT NULL,
    "dealId" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "targetRef" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DealPlacement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Deal_ownerUserId_idx" ON "Deal"("ownerUserId");

-- CreateIndex
CREATE INDEX "Deal_businessId_idx" ON "Deal"("businessId");

-- CreateIndex
CREATE INDEX "Deal_status_idx" ON "Deal"("status");

-- CreateIndex
CREATE INDEX "DealPlacement_channel_targetRef_idx" ON "DealPlacement"("channel", "targetRef");

-- CreateIndex
CREATE UNIQUE INDEX "DealPlacement_dealId_channel_targetRef_key" ON "DealPlacement"("dealId", "channel", "targetRef");

-- AddForeignKey
ALTER TABLE "Deal" ADD CONSTRAINT "Deal_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DealPlacement" ADD CONSTRAINT "DealPlacement_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Deal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

