-- CreateTable
CREATE TABLE "public"."UserProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "businessPurpose" TEXT,
    "businessOffer" TEXT,
    "businessAdvantage" TEXT,
    "businessGoals" TEXT,
    "audienceDefinition" TEXT,
    "audienceAge" TEXT,
    "audienceLocation" TEXT,
    "audienceProblem" TEXT,
    "offerMonetization" TEXT,
    "offerPricing" TEXT,
    "offerExclusivity" TEXT,
    "offerOptions" TEXT,
    "businessComplete" BOOLEAN NOT NULL DEFAULT false,
    "audienceComplete" BOOLEAN NOT NULL DEFAULT false,
    "offerComplete" BOOLEAN NOT NULL DEFAULT false,
    "profileData" JSONB,
    "icpSummary" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Subscription" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "stripeId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "cancel_at_period_end" BOOLEAN NOT NULL DEFAULT false,
    "current_period_end" INTEGER,
    "searchTokens" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Subscription_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "UserProfile_userId_key" ON "public"."UserProfile"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Subscription_userId_key" ON "public"."Subscription"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Subscription_stripeId_key" ON "public"."Subscription"("stripeId");

-- AddForeignKey
ALTER TABLE "public"."UserProfile" ADD CONSTRAINT "UserProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Subscription" ADD CONSTRAINT "Subscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
