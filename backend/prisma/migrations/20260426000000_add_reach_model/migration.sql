CREATE TYPE "ReachChannel" AS ENUM ('EMAIL', 'PHONE', 'DM', 'DROP_IN');

CREATE TYPE "ReachResult" AS ENUM (
  'NO_ANSWER', 'VOICEMAIL', 'GATEKEEPER', 'CONVERSATION',
  'POSITIVE', 'NEGATIVE', 'FOLLOW_UP_REQUESTED', 'NOT_NOW', 'DO_NOT_CONTACT'
);

CREATE TABLE "Reach" (
  "id"         TEXT NOT NULL,
  "leadId"     TEXT NOT NULL,
  "campaignId" TEXT,
  "userId"     TEXT NOT NULL,
  "channel"    "ReachChannel" NOT NULL,
  "result"     "ReachResult" NOT NULL,
  "transcript" TEXT,
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "Reach_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Reach_leadId_createdAt_idx" ON "Reach"("leadId", "createdAt");
CREATE INDEX "Reach_userId_createdAt_idx" ON "Reach"("userId", "createdAt");

ALTER TABLE "Reach" ADD CONSTRAINT "Reach_leadId_fkey"
  FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Reach" ADD CONSTRAINT "Reach_campaignId_fkey"
  FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Lead" ADD COLUMN "nextFollowUpAt" TIMESTAMP(3);
ALTER TABLE "Lead" ADD COLUMN "lastReachedAt"  TIMESTAMP(3);
ALTER TABLE "Lead" ADD COLUMN "followUpCount"  INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Lead" ADD COLUMN "activeChannel"  "ReachChannel";
ALTER TABLE "Lead" ADD COLUMN "lostReason"     TEXT;
