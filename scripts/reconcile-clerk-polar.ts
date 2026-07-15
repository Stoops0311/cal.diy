import { createHash } from "node:crypto";
import process from "node:process";
import { getClerkBackendClient } from "@calcom/features/auth/lib/clerkClient";
import { PolarSdkBillingGateway } from "@calcom/features/billing/services/PolarBillingGateway";
import { resolveConfiguredPolarProduct } from "@calcom/features/billing/services/PolarClient";
import { PolarSeatService } from "@calcom/features/billing/services/PolarSeatService";
import { PolarSubscriptionProjectionService } from "@calcom/features/billing/services/PolarSubscriptionProjectionService";
import { ClerkOrganizationSyncService } from "@calcom/features/organizations/services/ClerkOrganizationSyncService";
import { ClerkBackendOrganizationSource } from "@calcom/features/organizations/services/ClerkWebhookService";
import { prisma } from "@calcom/prisma";

type ReconciliationMode = "apply" | "dry-run";
type ReconciliationArguments = { mode: ReconciliationMode; organizationId?: number; userId?: number };
type ReconciliationDriftCode =
  | "ENTITLEMENT_DRIFT"
  | "MEMBERSHIP_ROLE_DRIFT"
  | "MISSING_CLERK_MAPPING"
  | "MISSING_LOCAL_ORGANIZATION"
  | "MISSING_WEBHOOK_DELIVERY"
  | "POLAR_SEAT_DRIFT"
  | "STALE_ACCEPTED_MEMBERSHIP"
  | "STALE_PROJECTION"
  | "UNKNOWN_PROVIDER_OBJECT";
type ReconciliationDrift = {
  code: ReconciliationDriftCode;
  repairable: boolean;
  subjectKey: string;
};
type ReconciliationMembership = {
  accepted?: boolean;
  clerkUserId: string;
  role: "ADMIN" | "MEMBER" | "OWNER";
};
type ReconciliationBillingState = {
  customerId: string;
  effectiveAt: Date;
  plan: "FREE" | "PRO" | "TEAM";
  productId: string | null;
  seats: number;
  status: string;
  subscriptionId: string | null;
};
type ReconciliationSnapshot = {
  billing: {
    acceptedSeats: number;
    entitlementPlan: "FREE" | "PRO" | "TEAM";
    local: ReconciliationBillingState | null;
    provider: ReconciliationBillingState | null;
    webhookDeliveryExists: boolean;
  } | null;
  identity: {
    candidateProviderIds: string[];
    exactCandidateId: string | null;
    localUserId: number;
    mappedProviderId: string | null;
    providerExists: boolean;
  } | null;
  organization: {
    clerkOrganizationId: string;
    localMemberships: ReconciliationMembership[];
    localOrganizationId: number | null;
    providerExists: boolean;
    providerMemberships: ReconciliationMembership[];
  } | null;
  subjectKey: string;
};
type ReconciliationAdapter = {
  read(subjectKey: string): Promise<ReconciliationSnapshot>;
  repair(code: ReconciliationDriftCode, subjectKey: string): Promise<void>;
};

function parsePositiveId(argument: string, name: string): number {
  const value = Number(argument.slice(name.length + 1));
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`${name} requires a positive integer`);
  return value;
}

function parseReconciliationArguments(args: string[]): ReconciliationArguments {
  const modes = args.filter((argument) => argument === "--dry-run" || argument === "--apply");
  if (modes.length !== 1) throw new Error("exactly one mode is required");
  const user = args.find((argument) => argument.startsWith("--user-id="));
  const organization = args.find((argument) => argument.startsWith("--organization-id="));
  if (user && organization) throw new Error("at most one subject scope is allowed");
  const result: ReconciliationArguments = { mode: modes[0] === "--apply" ? "apply" : "dry-run" };
  if (user) result.userId = parsePositiveId(user, "--user-id");
  if (organization) result.organizationId = parsePositiveId(organization, "--organization-id");
  if (result.mode === "apply" && !result.userId && !result.organizationId) {
    throw new Error("apply requires an exact subject scope");
  }
  return result;
}

function detectReconciliationDrift(snapshot: ReconciliationSnapshot): ReconciliationDrift[] {
  const drifts: ReconciliationDrift[] = [];
  const add = (code: ReconciliationDriftCode, repairable: boolean): void => {
    if (!drifts.some((drift) => drift.code === code)) {
      drifts.push({ code, repairable, subjectKey: snapshot.subjectKey });
    }
  };

  if (snapshot.identity) {
    const identity = snapshot.identity;
    if (!identity.mappedProviderId) {
      if (
        identity.providerExists &&
        identity.exactCandidateId &&
        identity.candidateProviderIds.length === 1
      ) {
        add("MISSING_CLERK_MAPPING", true);
      } else {
        add("UNKNOWN_PROVIDER_OBJECT", false);
      }
    } else if (!identity.providerExists) {
      add("UNKNOWN_PROVIDER_OBJECT", false);
    }
  }

  if (snapshot.organization) {
    const organization = snapshot.organization;
    if (!organization.providerExists) add("UNKNOWN_PROVIDER_OBJECT", false);
    else if (!organization.localOrganizationId) add("MISSING_LOCAL_ORGANIZATION", true);
    else {
      const provider = new Map(
        organization.providerMemberships.map((membership) => [membership.clerkUserId, membership])
      );
      for (const local of organization.localMemberships.filter(({ accepted }) => accepted)) {
        const remote = provider.get(local.clerkUserId);
        if (!remote) add("STALE_ACCEPTED_MEMBERSHIP", true);
        else if (remote.role !== local.role) add("MEMBERSHIP_ROLE_DRIFT", true);
      }
    }
  }

  if (snapshot.billing) {
    const billing = snapshot.billing;
    if (billing.local && !billing.provider) add("UNKNOWN_PROVIDER_OBJECT", false);
    if (billing.provider) {
      if (billing.acceptedSeats !== billing.provider.seats) add("POLAR_SEAT_DRIFT", true);
      if (
        !billing.local ||
        billing.local.customerId !== billing.provider.customerId ||
        billing.local.subscriptionId !== billing.provider.subscriptionId ||
        billing.local.productId !== billing.provider.productId ||
        billing.local.plan !== billing.provider.plan ||
        billing.local.status !== billing.provider.status ||
        billing.local.seats !== billing.provider.seats ||
        billing.local.effectiveAt < billing.provider.effectiveAt
      ) {
        add("STALE_PROJECTION", true);
      }
      if (billing.local && billing.entitlementPlan !== billing.local.plan) add("ENTITLEMENT_DRIFT", true);
      if (!billing.webhookDeliveryExists) add("MISSING_WEBHOOK_DELIVERY", true);
    }
  }
  return drifts;
}

async function applyReconciliation(
  adapter: ReconciliationAdapter,
  subjectKey: string
): Promise<ReconciliationDrift[]> {
  for (let attempt = 0; attempt < 16; attempt += 1) {
    const drifts = detectReconciliationDrift(await adapter.read(subjectKey));
    const repairable = drifts.find((drift) => drift.repairable);
    if (!repairable) return drifts;
    await adapter.repair(repairable.code, subjectKey);
  }
  throw new Error("reconciliation did not converge");
}

function isMissingProviderObject(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { name?: string; response$?: { status?: number }; status?: number };
  return (
    candidate.name === "ResourceNotFound" || candidate.status === 404 || candidate.response$?.status === 404
  );
}

function providerStatus(status: string): string {
  return status.toUpperCase();
}

function providerMembershipRole(
  membership: { clerkUserId: string; role: "org:admin" | "org:member" },
  creatorClerkUserId: string | null
): ReconciliationMembership["role"] {
  if (membership.clerkUserId === creatorClerkUserId) return "OWNER";
  if (membership.role === "org:admin") return "ADMIN";
  return "MEMBER";
}

class RuntimeReconciliationAdapter implements ReconciliationAdapter {
  private readonly clerk = getClerkBackendClient();
  private readonly gateway = new PolarSdkBillingGateway(process.env);
  private readonly organizationSource = new ClerkBackendOrganizationSource();
  private readonly organizationSync = new ClerkOrganizationSyncService();
  private readonly projection = new PolarSubscriptionProjectionService(process.env);
  private readonly seats = new PolarSeatService();

  async read(subjectKey: string): Promise<ReconciliationSnapshot> {
    const [kind, idValue] = subjectKey.split(":");
    const id = Number(idValue);
    if (!Number.isSafeInteger(id) || id <= 0 || (kind !== "user" && kind !== "organization")) {
      throw new Error("invalid reconciliation subject key");
    }
    return kind === "user" ? this.readUser(id) : this.readOrganization(id);
  }

  async repair(code: ReconciliationDriftCode, subjectKey: string): Promise<void> {
    const snapshot = await this.read(subjectKey);
    if (code === "MISSING_CLERK_MAPPING") {
      const identity = snapshot.identity;
      if (!identity?.exactCandidateId || identity.candidateProviderIds.length !== 1) {
        throw new Error("ambiguous Clerk identity mapping");
      }
      await prisma.user.updateMany({
        where: { clerkUserId: null, id: identity.localUserId },
        data: { clerkUserId: identity.exactCandidateId },
      });
      return;
    }
    if (
      code === "MEMBERSHIP_ROLE_DRIFT" ||
      code === "STALE_ACCEPTED_MEMBERSHIP" ||
      code === "MISSING_LOCAL_ORGANIZATION"
    ) {
      const clerkOrganizationId = snapshot.organization?.clerkOrganizationId;
      if (!clerkOrganizationId) throw new Error("Clerk organization mapping is unavailable");
      await this.organizationSync.reconcileOrganization(
        await this.organizationSource.getSnapshot(clerkOrganizationId)
      );
      return;
    }
    if (code === "POLAR_SEAT_DRIFT") {
      const organizationId = snapshot.organization?.localOrganizationId;
      if (!organizationId || !snapshot.billing) throw new Error("organization billing is unavailable");
      await this.seats.syncAcceptedSeats({
        desiredSeats: snapshot.billing.acceptedSeats,
        organizationId,
      });
      return;
    }
    if (code === "STALE_PROJECTION" || code === "ENTITLEMENT_DRIFT" || code === "MISSING_WEBHOOK_DELIVERY") {
      await this.reconcileBilling(snapshot);
    }
  }

  private async readUser(id: number): Promise<ReconciliationSnapshot> {
    const user = await prisma.user.findUnique({
      where: { id },
      select: { clerkUserId: true, email: true, id: true },
    });
    if (!user) throw new Error(`local user ${id} was not found`);
    const candidates = await this.clerk.users.getUserList({ externalId: [String(id)], limit: 2 });
    const exact = candidates.data.filter(
      (candidate) =>
        candidate.externalId === String(id) &&
        candidate.emailAddresses.some(
          ({ emailAddress }) => emailAddress.toLowerCase() === user.email.toLowerCase()
        )
    );
    let providerExists = false;
    if (user.clerkUserId) {
      try {
        await this.clerk.users.getUser(user.clerkUserId);
        providerExists = true;
      } catch (error) {
        if (!isMissingProviderObject(error)) throw error;
      }
    } else {
      providerExists = exact.length === 1;
    }
    const providerId = user.clerkUserId ?? exact[0]?.id ?? null;
    return {
      billing: await this.readBilling(`user:${id}`, providerId ? `user:${providerId}` : null, 1),
      identity: {
        candidateProviderIds: candidates.data.map(({ id: providerUserId }) => providerUserId),
        exactCandidateId: exact.length === 1 ? (exact[0]?.id ?? null) : null,
        localUserId: id,
        mappedProviderId: user.clerkUserId,
        providerExists,
      },
      organization: null,
      subjectKey: `user:${id}`,
    };
  }

  private async readOrganization(id: number): Promise<ReconciliationSnapshot> {
    const organization = await prisma.team.findUnique({
      where: { id },
      select: {
        clerkOrganizationId: true,
        members: {
          select: { accepted: true, role: true, user: { select: { clerkUserId: true } } },
        },
      },
    });
    if (!organization?.clerkOrganizationId) throw new Error(`local organization ${id} was not found`);
    let providerSnapshot: Awaited<ReturnType<ClerkBackendOrganizationSource["getSnapshot"]>> | null = null;
    try {
      providerSnapshot = await this.organizationSource.getSnapshot(organization.clerkOrganizationId);
    } catch (error) {
      if (!isMissingProviderObject(error)) throw error;
    }
    const providerMemberships: ReconciliationMembership[] =
      providerSnapshot?.memberships.map((membership) => ({
        clerkUserId: membership.clerkUserId,
        role: providerMembershipRole(membership, providerSnapshot.creatorClerkUserId),
      })) ?? [];
    const localMemberships: ReconciliationMembership[] = organization.members.flatMap((membership) =>
      membership.user.clerkUserId
        ? [
            {
              accepted: membership.accepted,
              clerkUserId: membership.user.clerkUserId,
              role: membership.role,
            },
          ]
        : []
    );
    const acceptedSeats = localMemberships.filter(({ accepted }) => accepted).length;
    return {
      billing: await this.readBilling(
        `organization:${id}`,
        `org:${organization.clerkOrganizationId}`,
        acceptedSeats
      ),
      identity: null,
      organization: {
        clerkOrganizationId: organization.clerkOrganizationId,
        localMemberships,
        localOrganizationId: id,
        providerExists: Boolean(providerSnapshot),
        providerMemberships,
      },
      subjectKey: `organization:${id}`,
    };
  }

  private async readBilling(
    subjectKey: string,
    externalCustomerId: string | null,
    acceptedSeats: number
  ): Promise<ReconciliationSnapshot["billing"]> {
    const local = await prisma.billingSubscription.findUnique({ where: { subjectKey } });
    let provider: Awaited<ReturnType<PolarSdkBillingGateway["getCustomerState"]>> | null = null;
    if (externalCustomerId) {
      try {
        provider = await this.gateway.getCustomerState(externalCustomerId);
      } catch (error) {
        if (!isMissingProviderObject(error)) throw error;
      }
    }
    if (!local && !provider) return null;
    const providerPlan = provider?.productId
      ? resolveConfiguredPolarProduct(provider.productId, provider.productMetadata, process.env).plan
      : "FREE";
    const providerState: ReconciliationBillingState | null = provider
      ? {
          customerId: provider.customerId,
          effectiveAt: provider.effectiveAt,
          plan: providerPlan,
          productId: provider.productId,
          seats: provider.seats,
          status: provider.productId ? providerStatus(provider.status) : "NONE",
          subscriptionId: provider.subscriptionId,
        }
      : null;
    const webhookDeliveryExists = provider
      ? Boolean(
          await prisma.externalWebhookEvent.findFirst({
            where: {
              effectiveAt: { gte: provider.effectiveAt },
              provider: "POLAR",
              state: "SUCCEEDED",
            },
            select: { id: true },
          })
        )
      : true;
    return {
      acceptedSeats,
      entitlementPlan: local?.plan ?? providerPlan,
      local: local
        ? {
            customerId: local.polarCustomerId ?? "",
            effectiveAt: local.latestEffectiveAt ?? new Date(0),
            plan: local.plan,
            productId: local.polarProductId,
            seats: local.seatCount,
            status: local.status,
            subscriptionId: local.polarSubscriptionId,
          }
        : null,
      provider: providerState,
      webhookDeliveryExists,
    };
  }

  private async reconcileBilling(snapshot: ReconciliationSnapshot): Promise<void> {
    let externalCustomerId: string | null = null;
    if (snapshot.identity?.mappedProviderId) {
      externalCustomerId = `user:${snapshot.identity.mappedProviderId}`;
    } else if (snapshot.organization?.clerkOrganizationId) {
      externalCustomerId = `org:${snapshot.organization.clerkOrganizationId}`;
    }
    if (!externalCustomerId) throw new Error("billing subject mapping is unavailable");
    const state = await this.gateway.getCustomerState(externalCustomerId);
    await this.projection.projectCustomerState(state);
    await prisma.externalWebhookEvent.upsert({
      where: { provider_externalEventId: { externalEventId: state.eventId, provider: "POLAR" } },
      create: {
        effectiveAt: state.effectiveAt,
        externalEventId: state.eventId,
        payloadHash: createHash("sha256").update(`reconcile:${snapshot.subjectKey}`).digest("hex"),
        processedAt: new Date(),
        provider: "POLAR",
        state: "SUCCEEDED",
        type: "reconciliation.customer_state",
      },
      update: { processedAt: new Date(), sanitizedError: null, state: "SUCCEEDED" },
      select: { id: true },
    });
  }
}

async function listSubjectKeys(args: ReconciliationArguments): Promise<string[]> {
  if (args.userId) return [`user:${args.userId}`];
  if (args.organizationId) return [`organization:${args.organizationId}`];
  const rows = await prisma.billingSubscription.findMany({
    where: { polarCustomerId: { not: null } },
    select: {
      organization: { select: { clerkOrganizationId: true, name: true } },
      polarCustomerId: true,
      subjectKey: true,
      user: { select: { clerkUserId: true, email: true } },
    },
  });
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return rows
    .filter((row) => row.polarCustomerId && uuid.test(row.polarCustomerId))
    .filter((row) => !row.user?.email.startsWith("convenio+clerk_test_"))
    .filter((row) => !row.organization?.name.startsWith("Convenio E2E "))
    .filter(
      (row) =>
        (row.user?.clerkUserId && /^user_[A-Za-z0-9]+$/.test(row.user.clerkUserId)) ||
        (row.organization?.clerkOrganizationId &&
          /^org_[A-Za-z0-9]+$/.test(row.organization.clerkOrganizationId))
    )
    .map(({ subjectKey }) => subjectKey);
}

async function main(): Promise<void> {
  const args = parseReconciliationArguments(process.argv.slice(2));
  const adapter = new RuntimeReconciliationAdapter();
  const subjectKeys = await listSubjectKeys(args);
  const drifts: ReconciliationDrift[] = [];
  for (const subjectKey of subjectKeys) {
    const result =
      args.mode === "apply"
        ? await applyReconciliation(adapter, subjectKey)
        : detectReconciliationDrift(await adapter.read(subjectKey));
    drifts.push(...result);
  }
  console.log(
    JSON.stringify({
      driftCount: drifts.length,
      drifts,
      mode: args.mode,
      status: drifts.length === 0 ? "clean" : "drift",
      subjectCount: subjectKeys.length,
    })
  );
  if (drifts.length > 0) process.exitCode = 2;
}

const entrypoint = process.argv[1];
if (entrypoint?.endsWith("/scripts/reconcile-clerk-polar.ts")) {
  main().catch((error: unknown) => {
    const code = error instanceof Error ? error.message : "reconciliation_failed";
    console.error(JSON.stringify({ code, status: "failed" }));
    process.exitCode = 1;
  });
}

export {
  applyReconciliation,
  detectReconciliationDrift,
  parseReconciliationArguments,
  RuntimeReconciliationAdapter,
};
export type {
  ReconciliationAdapter,
  ReconciliationArguments,
  ReconciliationDrift,
  ReconciliationDriftCode,
  ReconciliationSnapshot,
};
