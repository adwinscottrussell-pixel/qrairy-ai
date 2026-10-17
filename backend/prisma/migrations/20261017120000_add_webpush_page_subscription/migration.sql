-- Phase 5.5C.3: independent push subscriptions per business.
-- Additive only: one nullable column, one new table. No existing row is
-- changed or deleted.

-- AlterTable
ALTER TABLE "WebPushSubscription" ADD COLUMN "expiredAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "WebPushPageSubscription" (
    "id" TEXT NOT NULL,
    "subscriptionId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "cid" TEXT,
    "source" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "unsubscribedAt" TIMESTAMP(3),

    CONSTRAINT "WebPushPageSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WebPushPageSubscription_subscriptionId_slug_key" ON "WebPushPageSubscription"("subscriptionId", "slug");

-- CreateIndex
CREATE INDEX "WebPushPageSubscription_slug_idx" ON "WebPushPageSubscription"("slug");

-- AddForeignKey
ALTER TABLE "WebPushPageSubscription" ADD CONSTRAINT "WebPushPageSubscription_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "WebPushSubscription"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: each existing subscription keeps exactly the one page it
-- belongs to today, if that page still exists. No consent is inferred for
-- any other page. Subscriptions of deleted pages are left as they are (kept,
-- not linked): no business can send to them, and their slug stays reserved
-- (services/slugReservation.js).
INSERT INTO "WebPushPageSubscription" ("id", "subscriptionId", "slug", "cid", "source", "createdAt", "updatedAt")
SELECT 'migrated-' || s."id", s."id", s."slug", s."cid", 'migrated', s."createdAt", CURRENT_TIMESTAMP
FROM "WebPushSubscription" s
WHERE EXISTS (SELECT 1 FROM "LandingPage" l WHERE l."slug" = s."slug")
ON CONFLICT ("subscriptionId", "slug") DO NOTHING;
