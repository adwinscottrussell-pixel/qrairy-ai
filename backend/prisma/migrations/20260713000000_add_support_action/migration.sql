-- CreateTable
CREATE TABLE "SupportAction" (
    "id" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "actorType" TEXT NOT NULL,
    "actionType" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupportAction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SupportAction_actorId_idx" ON "SupportAction"("actorId");

-- CreateIndex
CREATE INDEX "SupportAction_targetType_targetId_idx" ON "SupportAction"("targetType", "targetId");

-- CreateIndex
CREATE INDEX "SupportAction_createdAt_idx" ON "SupportAction"("createdAt");
