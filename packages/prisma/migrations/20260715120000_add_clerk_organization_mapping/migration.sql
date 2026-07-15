CREATE TYPE "ExternalWebhookProvider" AS ENUM ('CLERK', 'POLAR');

CREATE TYPE "ExternalWebhookProcessingState" AS ENUM ('PROCESSING', 'SUCCEEDED', 'FAILED');

ALTER TABLE "Team" ADD COLUMN "clerkOrganizationId" TEXT;
ALTER TABLE "Team" ADD COLUMN "archivedAt" TIMESTAMP(3);

CREATE UNIQUE INDEX "Team_clerkOrganizationId_key" ON "Team"("clerkOrganizationId");

CREATE TABLE "ExternalWebhookEvent" (
    "id" TEXT NOT NULL,
    "provider" "ExternalWebhookProvider" NOT NULL,
    "externalEventId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "state" "ExternalWebhookProcessingState" NOT NULL DEFAULT 'PROCESSING',
    "attempts" INTEGER NOT NULL DEFAULT 1,
    "payloadHash" TEXT NOT NULL,
    "effectiveAt" TIMESTAMP(3),
    "processedAt" TIMESTAMP(3),
    "sanitizedError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExternalWebhookEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ExternalWebhookEvent_provider_externalEventId_key"
ON "ExternalWebhookEvent"("provider", "externalEventId");

CREATE INDEX "ExternalWebhookEvent_provider_state_idx"
ON "ExternalWebhookEvent"("provider", "state");
