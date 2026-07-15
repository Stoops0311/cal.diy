CREATE TYPE "PlanKey" AS ENUM ('FREE', 'PRO', 'TEAM');

CREATE TYPE "BillingInterval" AS ENUM ('MONTH', 'YEAR');

CREATE TYPE "BillingStatus" AS ENUM ('NONE', 'TRIALING', 'ACTIVE', 'PAST_DUE', 'CANCELED', 'UNPAID');

CREATE TABLE "BillingSubscription" (
    "id" TEXT NOT NULL,
    "subjectKey" TEXT NOT NULL,
    "userId" INTEGER,
    "organizationId" INTEGER,
    "plan" "PlanKey" NOT NULL DEFAULT 'FREE',
    "interval" "BillingInterval",
    "status" "BillingStatus" NOT NULL DEFAULT 'NONE',
    "polarCustomerId" TEXT,
    "polarSubscriptionId" TEXT,
    "polarProductId" TEXT,
    "seatCount" INTEGER NOT NULL DEFAULT 1,
    "currentPeriodStart" TIMESTAMP(3),
    "currentPeriodEnd" TIMESTAMP(3),
    "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
    "latestEffectiveAt" TIMESTAMP(3),
    "providerModifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BillingSubscription_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "BillingSubscription_exactly_one_subject_check"
      CHECK ((("userId" IS NOT NULL)::int + ("organizationId" IS NOT NULL)::int) = 1),
    CONSTRAINT "BillingSubscription_seat_count_check" CHECK ("seatCount" BETWEEN 1 AND 50)
);

CREATE UNIQUE INDEX "BillingSubscription_subjectKey_key" ON "BillingSubscription"("subjectKey");
CREATE UNIQUE INDEX "BillingSubscription_userId_key" ON "BillingSubscription"("userId");
CREATE UNIQUE INDEX "BillingSubscription_organizationId_key" ON "BillingSubscription"("organizationId");
CREATE UNIQUE INDEX "BillingSubscription_polarCustomerId_key" ON "BillingSubscription"("polarCustomerId");
CREATE UNIQUE INDEX "BillingSubscription_polarSubscriptionId_key" ON "BillingSubscription"("polarSubscriptionId");
CREATE INDEX "BillingSubscription_plan_status_idx" ON "BillingSubscription"("plan", "status");
CREATE INDEX "BillingSubscription_currentPeriodEnd_idx" ON "BillingSubscription"("currentPeriodEnd");

ALTER TABLE "BillingSubscription"
ADD CONSTRAINT "BillingSubscription_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "BillingSubscription"
ADD CONSTRAINT "BillingSubscription_organizationId_fkey"
FOREIGN KEY ("organizationId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;
