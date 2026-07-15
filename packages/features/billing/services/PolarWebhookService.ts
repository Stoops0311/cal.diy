import { createHash } from "node:crypto";
import process from "node:process";
import { ErrorCode } from "@calcom/lib/errorCodes";
import { ErrorWithCode } from "@calcom/lib/errors";
import { prisma } from "@calcom/prisma";
import { Prisma } from "@calcom/prisma/client";
import type { PolarBillingGateway } from "./PolarBillingGateway";
import { PolarSdkBillingGateway } from "./PolarBillingGateway";
import { type PolarEnvironment, resolveConfiguredPolarBenefits } from "./PolarClient";
import {
  type PolarCustomerStateSnapshot,
  PolarSubscriptionProjectionService,
} from "./PolarSubscriptionProjectionService";

type PolarWebhookSubscription = {
  cancelAtPeriodEnd: boolean;
  currentPeriodEnd: Date;
  currentPeriodStart: Date;
  id: string;
  metadata: Record<string, unknown>;
  modifiedAt: Date | null;
  productId: string;
  status: PolarCustomerStateSnapshot["status"];
};

type PolarWebhookEvent = {
  data?: {
    activeSubscriptions: PolarWebhookSubscription[];
    customerId: string;
    deletedAt: Date | null;
    externalCustomerId: string | null;
    grantedBenefitIds: string[];
    modifiedAt: Date | null;
    type: "individual" | "team";
  };
  timestamp: Date;
  type: string;
};

type PolarWebhookProjection = Pick<PolarSubscriptionProjectionService, "projectCustomerState">;
type PolarWebhookServiceDependencies = {
  environment: PolarEnvironment;
  projection: PolarWebhookProjection;
  subscriptionSource: Pick<PolarBillingGateway, "getSubscription">;
};

type ProcessInput = { event: PolarWebhookEvent; eventId: string; rawBody: string };
type ProcessResult = "duplicate" | "ignored" | "processed";

function conflict(message: string): ErrorWithCode {
  return new ErrorWithCode(ErrorCode.PolarProjectionConflict, message);
}

function sanitizedError(error: unknown): string {
  if (error instanceof ErrorWithCode) return error.code;
  return "polar_webhook_processing_failed";
}

class PolarWebhookService {
  private readonly environment: PolarEnvironment;
  private readonly projection: PolarWebhookProjection;
  private readonly subscriptionSource: Pick<PolarBillingGateway, "getSubscription">;

  constructor(dependencies?: PolarWebhookServiceDependencies) {
    this.environment = dependencies?.environment ?? process.env;
    this.projection = dependencies?.projection ?? new PolarSubscriptionProjectionService(this.environment);
    this.subscriptionSource =
      dependencies?.subscriptionSource ?? new PolarSdkBillingGateway(this.environment);
  }

  async process(input: ProcessInput): Promise<ProcessResult> {
    const payloadHash = createHash("sha256").update(input.rawBody).digest("hex");
    if (!(await this.claim(input, payloadHash))) return "duplicate";

    try {
      if (input.event.type !== "customer.state_changed" || !input.event.data) {
        await this.markSucceeded(input.eventId);
        return "ignored";
      }
      const data = input.event.data;
      if (
        data.deletedAt &&
        !data.externalCustomerId &&
        data.activeSubscriptions.length === 0 &&
        data.grantedBenefitIds.length === 0
      ) {
        await this.markSucceeded(input.eventId);
        return "ignored";
      }
      await this.projection.projectCustomerState(await this.toSnapshot(input.eventId, input.event));
      await this.markSucceeded(input.eventId);
      return "processed";
    } catch (error) {
      const subjectWasDeleted =
        error instanceof ErrorWithCode && error.code === ErrorCode.PolarSubjectNotFound;
      const providerObjectWasDeleted = error instanceof Error && error.name === "ResourceNotFound";
      if (subjectWasDeleted || providerObjectWasDeleted) {
        await this.markSucceeded(input.eventId);
        return "ignored";
      }
      await prisma.externalWebhookEvent.update({
        where: { provider_externalEventId: { externalEventId: input.eventId, provider: "POLAR" } },
        data: { sanitizedError: sanitizedError(error), state: "FAILED" },
        select: { id: true },
      });
      throw error;
    }
  }

  private async toSnapshot(eventId: string, event: PolarWebhookEvent): Promise<PolarCustomerStateSnapshot> {
    const data = event.data;
    if (!data?.externalCustomerId) throw conflict("Polar customer has no external subject");
    if (data.activeSubscriptions.length > 1) {
      throw conflict("Polar customer has multiple active subscriptions");
    }
    const activeBenefits = resolveConfiguredPolarBenefits(data.grantedBenefitIds, this.environment);
    const subscription = data.activeSubscriptions[0];
    if (!subscription) {
      return {
        activeBenefits,
        cancelAtPeriodEnd: false,
        currentPeriodEnd: null,
        currentPeriodStart: null,
        customerId: data.customerId,
        effectiveAt: data.modifiedAt ?? event.timestamp,
        eventId,
        externalCustomerId: data.externalCustomerId,
        productId: null,
        productMetadata: {},
        seats: 1,
        status: "unpaid",
        subscriptionId: null,
      };
    }

    let seats = 1;
    if (data.type === "team") {
      const providerSubscription = await this.subscriptionSource.getSubscription(subscription.id);
      if (providerSubscription.externalCustomerId !== data.externalCustomerId) {
        throw conflict("Polar Team subscription ownership does not match the customer");
      }
      if (
        providerSubscription.seats === null ||
        !Number.isInteger(providerSubscription.seats) ||
        providerSubscription.seats < 1 ||
        providerSubscription.seats > 50
      ) {
        throw conflict("Polar Team subscription has an invalid seat count");
      }
      seats = providerSubscription.seats;
    }
    const effectiveAt = [event.timestamp, data.modifiedAt, subscription.modifiedAt]
      .filter((value): value is Date => value instanceof Date)
      .reduce((latest, value) => (value > latest ? value : latest), event.timestamp);

    return {
      activeBenefits,
      cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
      currentPeriodEnd: subscription.currentPeriodEnd,
      currentPeriodStart: subscription.currentPeriodStart,
      customerId: data.customerId,
      effectiveAt,
      eventId,
      externalCustomerId: data.externalCustomerId,
      productId: subscription.productId,
      productMetadata: subscription.metadata,
      seats,
      status: subscription.status,
      subscriptionId: subscription.id,
    };
  }

  private async claim(input: ProcessInput, payloadHash: string): Promise<boolean> {
    try {
      await prisma.externalWebhookEvent.create({
        data: {
          effectiveAt: input.event.timestamp,
          externalEventId: input.eventId,
          payloadHash,
          provider: "POLAR",
          type: input.event.type,
        },
        select: { id: true },
      });
      return true;
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") throw error;
    }

    const existing = await prisma.externalWebhookEvent.findUniqueOrThrow({
      where: { provider_externalEventId: { externalEventId: input.eventId, provider: "POLAR" } },
      select: { payloadHash: true, state: true },
    });
    if (existing.payloadHash !== payloadHash) {
      throw new ErrorWithCode(
        ErrorCode.PolarWebhookPayloadConflict,
        "A Polar event id was delivered with a different payload"
      );
    }
    if (existing.state !== "FAILED") return false;
    const retried = await prisma.externalWebhookEvent.updateMany({
      where: { externalEventId: input.eventId, payloadHash, provider: "POLAR", state: "FAILED" },
      data: { attempts: { increment: 1 }, sanitizedError: null, state: "PROCESSING" },
    });
    return retried.count === 1;
  }

  private async markSucceeded(eventId: string): Promise<void> {
    await prisma.externalWebhookEvent.update({
      where: { provider_externalEventId: { externalEventId: eventId, provider: "POLAR" } },
      data: { processedAt: new Date(), sanitizedError: null, state: "SUCCEEDED" },
      select: { id: true },
    });
  }
}

export { PolarWebhookService };
export type { PolarWebhookEvent, PolarWebhookServiceDependencies };
