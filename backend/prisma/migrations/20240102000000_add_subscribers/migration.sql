-- AlterTable
ALTER TABLE "QR" ADD COLUMN "businessName" TEXT;

-- CreateTable
CREATE TABLE "Subscriber" (
    "id" TEXT NOT NULL,
    "qrId" TEXT NOT NULL,
    "oneSignalId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Subscriber_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "Subscriber" ADD CONSTRAINT "Subscriber_qrId_fkey" FOREIGN KEY ("qrId") REFERENCES "QR"("id") ON DELETE RESTRICT ON UPDATE CASCADE;