/*
  Warnings:

  - You are about to drop the column `priority` on the `Lead` table. All the data in the column will be lost.
  - You are about to drop the `OnboardingFlow` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `Subscription` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `UserProfile` table. If the table is not empty, all the data it contains will be lost.

*/
-- CreateEnum
CREATE TYPE "public"."RunStatus" AS ENUM ('RUNNING', 'COMPLETE', 'ERROR');

-- CreateEnum
CREATE TYPE "public"."LeadStatus" AS ENUM ('DISCOVERED', 'ENRICHED', 'QUALIFIED', 'QUEUED', 'CONTACTED', 'ARCHIVED');

-- DropForeignKey
ALTER TABLE "public"."OnboardingFlow" DROP CONSTRAINT "OnboardingFlow_userId_fkey";

-- DropForeignKey
ALTER TABLE "public"."Subscription" DROP CONSTRAINT "Subscription_userId_fkey";

-- DropForeignKey
ALTER TABLE "public"."UserProfile" DROP CONSTRAINT "UserProfile_userId_fkey";

-- AlterTable
ALTER TABLE "public"."Lead" DROP COLUMN "priority",
ADD COLUMN     "campaignId" TEXT,
ADD COLUMN     "generatedMessage" TEXT,
ADD COLUMN     "icpFitReason" TEXT,
ADD COLUMN     "icpFitScore" DOUBLE PRECISION,
ADD COLUMN     "inactiveSuspected" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "noContactFound" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "status" "public"."LeadStatus" NOT NULL DEFAULT 'DISCOVERED';

-- DropTable
DROP TABLE "public"."OnboardingFlow";

-- DropTable
DROP TABLE "public"."Subscription";

-- DropTable
DROP TABLE "public"."UserProfile";

-- DropEnum
DROP TYPE "public"."Priority";

-- DropEnum
DROP TYPE "public"."RiskTolerance";

-- DropEnum
DROP TYPE "public"."TonePreference";

-- CreateTable
CREATE TABLE "public"."Campaign" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "vertical" TEXT NOT NULL,
    "location" TEXT NOT NULL,
    "locationLat" DOUBLE PRECISION,
    "locationLng" DOUBLE PRECISION,
    "radiusMeters" INTEGER NOT NULL DEFAULT 5000,
    "offer" TEXT NOT NULL,
    "angle" TEXT,
    "qualifier" TEXT,
    "tone" TEXT,
    "voiceExamples" TEXT[],
    "active" BOOLEAN NOT NULL DEFAULT false,
    "dailyTarget" INTEGER NOT NULL DEFAULT 15,
    "setupComplete" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Campaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."CampaignRun" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "runAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leadsDiscovered" INTEGER NOT NULL DEFAULT 0,
    "leadsFiltered" INTEGER NOT NULL DEFAULT 0,
    "leadsQueued" INTEGER NOT NULL DEFAULT 0,
    "status" "public"."RunStatus" NOT NULL DEFAULT 'RUNNING',
    "errorMessage" TEXT,

    CONSTRAINT "CampaignRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Campaign_userId_active_idx" ON "public"."Campaign"("userId", "active");

-- CreateIndex
CREATE INDEX "CampaignRun_campaignId_runAt_idx" ON "public"."CampaignRun"("campaignId", "runAt");

-- AddForeignKey
ALTER TABLE "public"."Campaign" ADD CONSTRAINT "Campaign_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."CampaignRun" ADD CONSTRAINT "CampaignRun_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "public"."Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Lead" ADD CONSTRAINT "Lead_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "public"."Campaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;
