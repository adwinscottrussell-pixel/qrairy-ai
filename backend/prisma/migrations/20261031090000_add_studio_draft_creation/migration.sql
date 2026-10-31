-- CreateTable
CREATE TABLE "StudioDraftCreation" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "landingPageId" TEXT,
    "requestId" TEXT,
    "requestHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StudioDraftCreation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StudioDraftCreation_userId_createdAt_idx" ON "StudioDraftCreation"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "StudioDraftCreation_userId_requestId_key" ON "StudioDraftCreation"("userId", "requestId");
