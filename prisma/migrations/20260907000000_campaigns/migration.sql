CREATE TYPE "CampaignPublicationStatus" AS ENUM ('DRAFT', 'PUBLISHED');

CREATE TABLE "campaigns" (
  "id" TEXT NOT NULL,
  "masjidId" TEXT NOT NULL,
  "name" TEXT,
  "category" TEXT,
  "project" TEXT,
  "description" TEXT,
  "coverImageUrl" TEXT,
  "coverImagePublicId" TEXT,
  "videoUrl" TEXT,
  "videoPublicId" TEXT,
  "gallery" JSONB NOT NULL DEFAULT '[]',
  "goal" DECIMAL(14,2),
  "currency" TEXT NOT NULL DEFAULT 'GBP',
  "startDate" TIMESTAMP(3),
  "endDate" TIMESTAMP(3),
  "donationTiers" JSONB NOT NULL DEFAULT '[]',
  "story" TEXT,
  "impact" TEXT,
  "faqs" JSONB NOT NULL DEFAULT '[]',
  "publicationStatus" "CampaignPublicationStatus" NOT NULL DEFAULT 'DRAFT',
  "publishedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "deletedAt" TIMESTAMP(3),
  CONSTRAINT "campaigns_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "campaigns_masjidId_publicationStatus_idx" ON "campaigns"("masjidId", "publicationStatus");
CREATE INDEX "campaigns_startDate_endDate_idx" ON "campaigns"("startDate", "endDate");
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_masjidId_fkey" FOREIGN KEY ("masjidId") REFERENCES "masjids"("id") ON DELETE CASCADE ON UPDATE CASCADE;
