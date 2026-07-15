import process from "node:process";
import type { OrganizationSeatBillingPort } from "@calcom/features/organizations/services/OrganizationSeatBillingPort";
import { ErrorCode } from "@calcom/lib/errorCodes";
import { ErrorWithCode } from "@calcom/lib/errors";
import { prisma } from "@calcom/prisma";
import type { PlanKey } from "@calcom/prisma/enums";
import type { PolarBillingGateway } from "./PolarBillingGateway";
import { PolarSdkBillingGateway } from "./PolarBillingGateway";
import { PolarSubscriptionProjectionService } from "./PolarSubscriptionProjectionService";

type OrganizationBilling = {
  externalCustomerId: string;
  plan: PlanKey;
  polarSubscriptionId: string | null;
};
type PolarSeatRepository = {
  getOrganizationBilling(organizationId: number): Promise<OrganizationBilling>;
};
type PolarSeatServiceDependencies = {
  gateway: Pick<PolarBillingGateway, "getCustomerState" | "getSubscription" | "updateSubscription">;
  projection: Pick<PolarSubscriptionProjectionService, "projectCustomerState">;
  repository: PolarSeatRepository;
};

function seatFailure(): ErrorWithCode {
  return new ErrorWithCode(ErrorCode.InternalServerError, "Polar seat synchronization failed");
}

class PrismaPolarSeatRepository implements PolarSeatRepository {
  async getOrganizationBilling(organizationId: number): Promise<OrganizationBilling> {
    const organization = await prisma.team.findUnique({
      where: { id: organizationId },
      select: {
        archivedAt: true,
        billingSubscription: { select: { plan: true, polarSubscriptionId: true } },
        clerkOrganizationId: true,
      },
    });
    if (!organization?.clerkOrganizationId || organization.archivedAt) {
      throw new ErrorWithCode(ErrorCode.Forbidden, "Organization billing access denied");
    }
    return {
      externalCustomerId: `org:${organization.clerkOrganizationId}`,
      plan: organization.billingSubscription?.plan ?? "FREE",
      polarSubscriptionId: organization.billingSubscription?.polarSubscriptionId ?? null,
    };
  }
}

class PolarSeatService implements OrganizationSeatBillingPort {
  private readonly dependencies: PolarSeatServiceDependencies;
  private readonly transitions = new Map<number, Promise<unknown>>();

  constructor(dependencies?: PolarSeatServiceDependencies) {
    this.dependencies =
      dependencies ??
      (() => {
        const gateway = new PolarSdkBillingGateway(process.env);
        return {
          gateway,
          projection: new PolarSubscriptionProjectionService(process.env),
          repository: new PrismaPolarSeatRepository(),
        };
      })();
  }

  async syncAcceptedSeats(input: { desiredSeats: number; organizationId: number }): Promise<void> {
    if (input.desiredSeats < 1 || input.desiredSeats > 50) {
      throw new ErrorWithCode(ErrorCode.EntitlementLimitExceeded, "Team seats must be between one and fifty");
    }
    return this.serialize(input.organizationId, async () => {
      const billing = await this.dependencies.repository.getOrganizationBilling(input.organizationId);
      if (billing.plan !== "TEAM" || !billing.polarSubscriptionId) {
        throw new ErrorWithCode(ErrorCode.EntitlementRequired, "An active Team subscription is required");
      }

      let providerSubscription: Awaited<ReturnType<PolarBillingGateway["getSubscription"]>>;
      try {
        providerSubscription = await this.dependencies.gateway.getSubscription(billing.polarSubscriptionId);
      } catch {
        throw seatFailure();
      }
      if (providerSubscription.externalCustomerId !== billing.externalCustomerId) {
        throw new ErrorWithCode(ErrorCode.Forbidden, "Polar subscription ownership mismatch");
      }

      try {
        await this.dependencies.gateway.updateSubscription({
          id: providerSubscription.id,
          idempotencyKey: `billing:organization:${input.organizationId}:seats:${input.desiredSeats}`,
          update: { seats: input.desiredSeats },
        });
        const state = await this.dependencies.gateway.getCustomerState(billing.externalCustomerId);
        await this.dependencies.projection.projectCustomerState(state);
      } catch {
        throw seatFailure();
      }
    });
  }

  private async serialize<T>(organizationId: number, task: () => Promise<T>): Promise<T> {
    const queued = (this.transitions.get(organizationId) ?? Promise.resolve())
      .catch(() => undefined)
      .then(task);
    this.transitions.set(organizationId, queued);
    try {
      return await queued;
    } finally {
      if (this.transitions.get(organizationId) === queued) this.transitions.delete(organizationId);
    }
  }
}

export { PolarSeatService };
export type { PolarSeatRepository, PolarSeatServiceDependencies };
