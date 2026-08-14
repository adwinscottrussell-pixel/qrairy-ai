-- Canonical Customer Foundation — Phase 1 (infrastructure only).
-- Additive only. No column added to any existing table, no existing
-- data touched. Superseded, corrected version of an earlier local-only
-- draft that was never applied to production and anchored Customer to
-- `slug` instead of `ownerUserId` — see schema.prisma comment above the
-- Customer model for the full rationale.

-- CreateTable
CREATE TABLE "Customer" (
    "id" TEXT NOT NULL,
    "ownerUserId" TEXT NOT NULL,
    "slug" TEXT,
    "displayName" TEXT,
    "primaryEmail" TEXT,
    "primaryEmailVerifiedAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'active',
    "mergedIntoId" TEXT,
    "source" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastActivityAt" TIMESTAMP(3),

    CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerIdentity" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "ownerUserId" TEXT NOT NULL,
    "slug" TEXT,
    "type" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "verifiedAt" TIMESTAMP(3),
    "source" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustomerIdentity_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Customer_ownerUserId_idx" ON "Customer"("ownerUserId");

-- CreateIndex
CREATE INDEX "Customer_slug_idx" ON "Customer"("slug");

-- CreateIndex
CREATE INDEX "Customer_primaryEmail_idx" ON "Customer"("primaryEmail");

-- CreateIndex
CREATE UNIQUE INDEX "Customer_ownerUserId_primaryEmail_key" ON "Customer"("ownerUserId", "primaryEmail");

-- CreateIndex
CREATE INDEX "CustomerIdentity_customerId_idx" ON "CustomerIdentity"("customerId");

-- CreateIndex
CREATE INDEX "CustomerIdentity_slug_idx" ON "CustomerIdentity"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "CustomerIdentity_ownerUserId_type_value_key" ON "CustomerIdentity"("ownerUserId", "type", "value");

-- AddForeignKey
ALTER TABLE "CustomerIdentity" ADD CONSTRAINT "CustomerIdentity_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
