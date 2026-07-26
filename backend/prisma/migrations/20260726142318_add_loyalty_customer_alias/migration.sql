-- AlterTable
ALTER TABLE "Pass" ADD COLUMN     "loyaltyCustomerId" TEXT;

-- CreateTable
CREATE TABLE "LoyaltyCustomerAlias" (
    "id" TEXT NOT NULL,
    "loyaltyCustomerId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "cid" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LoyaltyCustomerAlias_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LoyaltyCustomerAlias_loyaltyCustomerId_idx" ON "LoyaltyCustomerAlias"("loyaltyCustomerId");

-- CreateIndex
CREATE UNIQUE INDEX "LoyaltyCustomerAlias_slug_cid_key" ON "LoyaltyCustomerAlias"("slug", "cid");

-- CreateIndex
CREATE INDEX "Pass_loyaltyCustomerId_idx" ON "Pass"("loyaltyCustomerId");

-- AddForeignKey
ALTER TABLE "Pass" ADD CONSTRAINT "Pass_loyaltyCustomerId_fkey" FOREIGN KEY ("loyaltyCustomerId") REFERENCES "LoyaltyCustomer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoyaltyCustomerAlias" ADD CONSTRAINT "LoyaltyCustomerAlias_loyaltyCustomerId_fkey" FOREIGN KEY ("loyaltyCustomerId") REFERENCES "LoyaltyCustomer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

