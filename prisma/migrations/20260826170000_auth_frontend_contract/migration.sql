ALTER TYPE "OtpPurpose" ADD VALUE IF NOT EXISTS 'PASSWORD_RESET';

CREATE TABLE IF NOT EXISTS "password_resets" (
  "id" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "tokenHash" TEXT,
  "verifiedAt" TIMESTAMP(3),
  "expiresAt" TIMESTAMP(3),
  "usedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "password_resets_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "password_resets_email_idx" ON "password_resets"("email");
