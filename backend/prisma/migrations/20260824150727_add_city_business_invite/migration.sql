-- CreateTable
CREATE TABLE "CityBusinessInvite" (
    "id" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "businessName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "tokenHash" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "claimedBusinessId" TEXT,

    CONSTRAINT "CityBusinessInvite_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CityBusinessInvite_tokenHash_key" ON "CityBusinessInvite"("tokenHash");

-- CreateIndex
CREATE INDEX "CityBusinessInvite_locationId_idx" ON "CityBusinessInvite"("locationId");

-- CreateIndex
CREATE INDEX "CityBusinessInvite_email_idx" ON "CityBusinessInvite"("email");

-- AddForeignKey
ALTER TABLE "CityBusinessInvite" ADD CONSTRAINT "CityBusinessInvite_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
