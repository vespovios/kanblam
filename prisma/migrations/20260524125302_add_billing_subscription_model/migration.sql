-- CreateEnum
CREATE TYPE "BillingStatus" AS ENUM ('NONE', 'TRIALING', 'ACTIVE', 'PAST_DUE', 'READ_ONLY', 'SUSPENDED', 'CANCELED');

-- CreateTable
CREATE TABLE "workspace_billing" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "status" "BillingStatus" NOT NULL DEFAULT 'NONE',
    "polarCustomerId" TEXT,
    "externalCustomerId" TEXT,
    "polarSubscriptionId" TEXT,
    "polarProductId" TEXT,
    "polarPriceId" TEXT,
    "trialEndsAt" TIMESTAMP(3),
    "currentPeriodEnd" TIMESTAMP(3),
    "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
    "canceledAt" TIMESTAMP(3),
    "gracePeriodEndsAt" TIMESTAMP(3),
    "readOnlyAt" TIMESTAMP(3),
    "suspendedAt" TIMESTAMP(3),
    "isFoundingMember" BOOLEAN NOT NULL DEFAULT false,
    "foundingLockedUntil" TIMESTAMP(3),
    "seatCount" INTEGER,
    "polarStatus" TEXT,
    "lastSyncedAt" TIMESTAMP(3),
    "lastWebhookEventId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "workspace_billing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "billing_events" (
    "id" TEXT NOT NULL,
    "polarEventId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "workspaceId" TEXT,
    "payload" JSONB NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),
    "error" TEXT,

    CONSTRAINT "billing_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "workspace_billing_workspaceId_key" ON "workspace_billing"("workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "workspace_billing_polarCustomerId_key" ON "workspace_billing"("polarCustomerId");

-- CreateIndex
CREATE UNIQUE INDEX "workspace_billing_externalCustomerId_key" ON "workspace_billing"("externalCustomerId");

-- CreateIndex
CREATE UNIQUE INDEX "workspace_billing_polarSubscriptionId_key" ON "workspace_billing"("polarSubscriptionId");

-- CreateIndex
CREATE INDEX "workspace_billing_status_idx" ON "workspace_billing"("status");

-- CreateIndex
CREATE INDEX "workspace_billing_currentPeriodEnd_idx" ON "workspace_billing"("currentPeriodEnd");

-- CreateIndex
CREATE UNIQUE INDEX "billing_events_polarEventId_key" ON "billing_events"("polarEventId");

-- CreateIndex
CREATE INDEX "billing_events_type_idx" ON "billing_events"("type");

-- CreateIndex
CREATE INDEX "billing_events_workspaceId_idx" ON "billing_events"("workspaceId");

-- CreateIndex
CREATE INDEX "billing_events_processedAt_idx" ON "billing_events"("processedAt");

-- AddForeignKey
ALTER TABLE "workspace_billing" ADD CONSTRAINT "workspace_billing_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
