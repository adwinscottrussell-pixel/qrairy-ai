-- AlterTable
ALTER TABLE "QR" ADD COLUMN     "destinationUrl" TEXT,
ADD COLUMN     "isDynamic" BOOLEAN NOT NULL DEFAULT false;
