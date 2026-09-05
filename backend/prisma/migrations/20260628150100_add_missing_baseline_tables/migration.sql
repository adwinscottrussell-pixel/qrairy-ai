-- CreateTable
CREATE TABLE "LandingPage" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "businessName" TEXT NOT NULL,
    "websiteUrl" TEXT,
    "useCase" TEXT,
    "brandColor" TEXT DEFAULT '#ff5a1f',
    "logoUrl" TEXT,
    "userId" TEXT,
    "qrType" TEXT DEFAULT 'ai',
    "sections" TEXT,
    "template" TEXT,
    "status" TEXT NOT NULL DEFAULT 'live',
    "scanCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LandingPage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Pass" (
    "id" TEXT NOT NULL,
    "serialNumber" TEXT NOT NULL,
    "passTypeId" TEXT NOT NULL,
    "authToken" TEXT,
    "lastMsgTitle" TEXT,
    "lastMsg" TEXT,
    "lastMsgLink" TEXT,
    "stampCount" INTEGER NOT NULL DEFAULT 0,
    "stampGoal" INTEGER NOT NULL DEFAULT 10,
    "rewardReady" BOOLEAN NOT NULL DEFAULT false,
    "totalStamps" INTEGER NOT NULL DEFAULT 0,
    "rewardsEarned" INTEGER NOT NULL DEFAULT 0,
    "lastStampAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Pass_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PassDevice" (
    "id" TEXT NOT NULL,
    "deviceLibraryId" TEXT NOT NULL,
    "pushToken" TEXT NOT NULL,
    "walletType" TEXT NOT NULL DEFAULT 'apple',
    "passId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PassDevice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PassRegistration" (
    "id" TEXT NOT NULL,
    "deviceLibraryId" TEXT NOT NULL,
    "serialNumber" TEXT NOT NULL,
    "passId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PassRegistration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PushCampaign" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "linkUrl" TEXT,
    "sent" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PushCampaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebPushSubscription" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "cid" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WebPushSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StampSettings" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "goal" INTEGER NOT NULL DEFAULT 10,
    "rewardName" TEXT NOT NULL DEFAULT 'Free item',
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "color" TEXT NOT NULL DEFAULT '#ff5a1f',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StampSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StampToken" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StampToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StampEntry" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "passId" TEXT NOT NULL,
    "source" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StampEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RewardEvent" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "passId" TEXT NOT NULL,
    "rewardText" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'earned',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "redeemedAt" TIMESTAMP(3),

    CONSTRAINT "RewardEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LoyaltyCustomer" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "hasWallet" BOOLEAN NOT NULL DEFAULT false,
    "stampCount" INTEGER NOT NULL DEFAULT 0,
    "totalStamps" INTEGER NOT NULL DEFAULT 0,
    "rewardsEarned" INTEGER NOT NULL DEFAULT 0,
    "rewardReady" BOOLEAN NOT NULL DEFAULT false,
    "lastStampAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LoyaltyCustomer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LandingPage_slug_key" ON "LandingPage"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Pass_serialNumber_key" ON "Pass"("serialNumber");

-- CreateIndex
CREATE UNIQUE INDEX "PassDevice_passId_deviceLibraryId_key" ON "PassDevice"("passId", "deviceLibraryId");

-- CreateIndex
CREATE UNIQUE INDEX "WebPushSubscription_endpoint_key" ON "WebPushSubscription"("endpoint");

-- CreateIndex
CREATE INDEX "WebPushSubscription_cid_idx" ON "WebPushSubscription"("cid");

-- CreateIndex
CREATE UNIQUE INDEX "StampSettings_slug_key" ON "StampSettings"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "StampToken_token_key" ON "StampToken"("token");

-- CreateIndex
CREATE UNIQUE INDEX "LoyaltyCustomer_slug_customerId_key" ON "LoyaltyCustomer"("slug", "customerId");

-- AddForeignKey
ALTER TABLE "PassDevice" ADD CONSTRAINT "PassDevice_passId_fkey" FOREIGN KEY ("passId") REFERENCES "Pass"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PassRegistration" ADD CONSTRAINT "PassRegistration_passId_fkey" FOREIGN KEY ("passId") REFERENCES "Pass"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RewardEvent" ADD CONSTRAINT "RewardEvent_passId_fkey" FOREIGN KEY ("passId") REFERENCES "Pass"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
