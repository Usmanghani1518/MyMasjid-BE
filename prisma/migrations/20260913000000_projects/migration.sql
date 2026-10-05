CREATE TYPE "ProjectStatus" AS ENUM ('PLANNED', 'ACTIVE', 'COMPLETED');
CREATE TYPE "ProjectMilestoneStatus" AS ENUM ('COMPLETED', 'IN_PROGRESS', 'UPCOMING');
CREATE TYPE "ConstructionLogType" AS ENUM ('DAILY', 'WEEKLY');
CREATE TYPE "ProjectMediaKind" AS ENUM ('IMAGE', 'VIDEO', 'THREE_D_RENDER');
CREATE TYPE "ExpenditureStatus" AS ENUM ('PENDING', 'APPROVED', 'PAID', 'VOID');
CREATE TYPE "InvoiceStatus" AS ENUM ('PENDING', 'PAID', 'OVERDUE', 'VOID');

CREATE TABLE "projects" (
  "id" TEXT NOT NULL,
  "masjidId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "managerName" TEXT NOT NULL,
  "location" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "coverImageUrl" TEXT,
  "status" "ProjectStatus" NOT NULL DEFAULT 'PLANNED',
  "currency" TEXT NOT NULL DEFAULT 'GBP',
  "estimatedTotalCost" DECIMAL(14,2),
  "fundraisingGoal" DECIMAL(14,2),
  "seedFunding" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "raisedAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "constructionProgress" INTEGER NOT NULL DEFAULT 0,
  "notice" TEXT,
  "startDate" TIMESTAMP(3),
  "completionDate" TIMESTAMP(3),
  "fundingSources" JSONB NOT NULL DEFAULT '[]',
  "media" JSONB NOT NULL DEFAULT '[]',
  "complianceDocuments" JSONB NOT NULL DEFAULT '[]',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "deletedAt" TIMESTAMP(3),
  CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "projects_masjidId_status_idx" ON "projects"("masjidId", "status");
CREATE INDEX "projects_masjidId_category_idx" ON "projects"("masjidId", "category");
CREATE INDEX "projects_masjidId_createdAt_idx" ON "projects"("masjidId", "createdAt");

ALTER TABLE "projects" ADD CONSTRAINT "projects_masjidId_fkey"
  FOREIGN KEY ("masjidId") REFERENCES "masjids"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "project_milestones" (
  "id" TEXT NOT NULL, "projectId" TEXT NOT NULL, "name" TEXT NOT NULL, "phaseLabel" TEXT,
  "description" TEXT, "status" "ProjectMilestoneStatus" NOT NULL DEFAULT 'UPCOMING',
  "durationWeeks" INTEGER, "progressPercent" INTEGER NOT NULL DEFAULT 0,
  "plannedStartDate" TIMESTAMP(3), "dueDate" TIMESTAMP(3), "completedAt" TIMESTAMP(3),
  "primaryContractor" TEXT, "leadEngineer" TEXT, "position" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  "deletedAt" TIMESTAMP(3), CONSTRAINT "project_milestones_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "project_milestones_projectId_status_position_idx" ON "project_milestones"("projectId", "status", "position");
CREATE INDEX "project_milestones_projectId_dueDate_idx" ON "project_milestones"("projectId", "dueDate");

CREATE TABLE "milestone_comments" (
  "id" TEXT NOT NULL, "milestoneId" TEXT NOT NULL, "authorId" TEXT NOT NULL, "authorName" TEXT NOT NULL,
  "body" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL, "deletedAt" TIMESTAMP(3), CONSTRAINT "milestone_comments_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "milestone_comments_milestoneId_createdAt_idx" ON "milestone_comments"("milestoneId", "createdAt");

CREATE TABLE "milestone_updates" (
  "id" TEXT NOT NULL, "milestoneId" TEXT NOT NULL, "authorId" TEXT NOT NULL, "authorName" TEXT NOT NULL,
  "message" TEXT NOT NULL, "progressPercent" INTEGER, "status" "ProjectMilestoneStatus",
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "milestone_updates_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "milestone_updates_milestoneId_createdAt_idx" ON "milestone_updates"("milestoneId", "createdAt");

CREATE TABLE "construction_logs" (
  "id" TEXT NOT NULL, "projectId" TEXT NOT NULL, "milestoneId" TEXT, "authorId" TEXT NOT NULL,
  "authorName" TEXT NOT NULL, "type" "ConstructionLogType" NOT NULL DEFAULT 'DAILY', "logDate" TIMESTAMP(3) NOT NULL,
  "title" TEXT NOT NULL, "body" TEXT NOT NULL, "progressPercent" INTEGER, "delayMinutes" INTEGER NOT NULL DEFAULT 0,
  "safetyIncident" BOOLEAN NOT NULL DEFAULT false, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL, "deletedAt" TIMESTAMP(3), CONSTRAINT "construction_logs_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "construction_logs_projectId_logDate_idx" ON "construction_logs"("projectId", "logDate");
CREATE INDEX "construction_logs_milestoneId_idx" ON "construction_logs"("milestoneId");

CREATE TABLE "construction_log_assets" (
  "id" TEXT NOT NULL, "logId" TEXT NOT NULL, "kind" "ProjectMediaKind" NOT NULL, "url" TEXT NOT NULL,
  "label" TEXT NOT NULL, "position" INTEGER NOT NULL DEFAULT 0, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "construction_log_assets_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "construction_log_assets_logId_position_idx" ON "construction_log_assets"("logId", "position");

CREATE TABLE "project_assets" (
  "id" TEXT NOT NULL, "projectId" TEXT NOT NULL, "milestoneId" TEXT, "kind" "ProjectMediaKind" NOT NULL,
  "url" TEXT NOT NULL, "label" TEXT NOT NULL, "altText" TEXT, "position" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  "deletedAt" TIMESTAMP(3), CONSTRAINT "project_assets_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "project_assets_projectId_position_idx" ON "project_assets"("projectId", "position");
CREATE INDEX "project_assets_milestoneId_idx" ON "project_assets"("milestoneId");

CREATE TABLE "contractor_reports" (
  "id" TEXT NOT NULL, "projectId" TEXT NOT NULL, "title" TEXT NOT NULL, "reportType" TEXT NOT NULL,
  "contractorName" TEXT, "reportingPeriod" TEXT, "description" TEXT, "fileUrl" TEXT NOT NULL,
  "verified" BOOLEAN NOT NULL DEFAULT false, "verifiedBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  "deletedAt" TIMESTAMP(3), CONSTRAINT "contractor_reports_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "contractor_reports_projectId_createdAt_idx" ON "contractor_reports"("projectId", "createdAt");

CREATE TABLE "budget_allocations" (
  "id" TEXT NOT NULL, "projectId" TEXT NOT NULL, "name" TEXT NOT NULL, "totalBudget" DECIMAL(14,2) NOT NULL,
  "warningThreshold" INTEGER NOT NULL DEFAULT 80, "position" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  "deletedAt" TIMESTAMP(3), CONSTRAINT "budget_allocations_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "budget_allocations_projectId_position_idx" ON "budget_allocations"("projectId", "position");

CREATE TABLE "expenditures" (
  "id" TEXT NOT NULL, "projectId" TEXT NOT NULL, "allocationId" TEXT, "vendor" TEXT NOT NULL,
  "description" TEXT NOT NULL, "amount" DECIMAL(14,2) NOT NULL, "expenditureDate" TIMESTAMP(3) NOT NULL,
  "status" "ExpenditureStatus" NOT NULL DEFAULT 'PENDING', "invoiceReference" TEXT, "receiptUrl" TEXT, "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  "deletedAt" TIMESTAMP(3), CONSTRAINT "expenditures_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "expenditures_projectId_expenditureDate_idx" ON "expenditures"("projectId", "expenditureDate");
CREATE INDEX "expenditures_allocationId_idx" ON "expenditures"("allocationId");

CREATE TABLE "invoices" (
  "id" TEXT NOT NULL, "projectId" TEXT NOT NULL, "allocationId" TEXT, "vendor" TEXT NOT NULL,
  "invoiceNumber" TEXT NOT NULL, "amount" DECIMAL(14,2) NOT NULL, "dueDate" TIMESTAMP(3) NOT NULL,
  "status" "InvoiceStatus" NOT NULL DEFAULT 'PENDING', "paidAt" TIMESTAMP(3), "documentUrl" TEXT, "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  "deletedAt" TIMESTAMP(3), CONSTRAINT "invoices_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "invoices_projectId_invoiceNumber_key" ON "invoices"("projectId", "invoiceNumber");
CREATE INDEX "invoices_projectId_dueDate_idx" ON "invoices"("projectId", "dueDate");
CREATE INDEX "invoices_allocationId_idx" ON "invoices"("allocationId");

CREATE TABLE "budget_forecasts" (
  "id" TEXT NOT NULL, "projectId" TEXT NOT NULL, "month" TIMESTAMP(3) NOT NULL,
  "forecastAmount" DECIMAL(14,2) NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "budget_forecasts_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "budget_forecasts_projectId_month_key" ON "budget_forecasts"("projectId", "month");
CREATE INDEX "budget_forecasts_projectId_month_idx" ON "budget_forecasts"("projectId", "month");

ALTER TABLE "project_milestones" ADD CONSTRAINT "project_milestones_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "milestone_comments" ADD CONSTRAINT "milestone_comments_milestoneId_fkey" FOREIGN KEY ("milestoneId") REFERENCES "project_milestones"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "milestone_updates" ADD CONSTRAINT "milestone_updates_milestoneId_fkey" FOREIGN KEY ("milestoneId") REFERENCES "project_milestones"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "construction_logs" ADD CONSTRAINT "construction_logs_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "construction_logs" ADD CONSTRAINT "construction_logs_milestoneId_fkey" FOREIGN KEY ("milestoneId") REFERENCES "project_milestones"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "construction_log_assets" ADD CONSTRAINT "construction_log_assets_logId_fkey" FOREIGN KEY ("logId") REFERENCES "construction_logs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "project_assets" ADD CONSTRAINT "project_assets_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "project_assets" ADD CONSTRAINT "project_assets_milestoneId_fkey" FOREIGN KEY ("milestoneId") REFERENCES "project_milestones"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "contractor_reports" ADD CONSTRAINT "contractor_reports_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "budget_allocations" ADD CONSTRAINT "budget_allocations_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "expenditures" ADD CONSTRAINT "expenditures_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "expenditures" ADD CONSTRAINT "expenditures_allocationId_fkey" FOREIGN KEY ("allocationId") REFERENCES "budget_allocations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_allocationId_fkey" FOREIGN KEY ("allocationId") REFERENCES "budget_allocations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "budget_forecasts" ADD CONSTRAINT "budget_forecasts_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
