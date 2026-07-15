import { getDefaultEvent } from "@calcom/features/eventtypes/lib/defaultEvents";
import { TeamEventEntitlementService } from "@calcom/features/eventtypes/services/TeamEventEntitlementService";
import { HttpError } from "@calcom/lib/http-error";
import { withReporting } from "@calcom/lib/sentryWrapper";
import { getBookingFieldsWithSystemFields } from "../getBookingFields";
import { getEventTypesFromDB } from "./getEventTypesFromDB";

type GetEventTypeInput = {
  eventTypeId: number;
  eventTypeSlug?: string;
};

type GetEventTypeDependencies = {
  getDefaultEvent: typeof getDefaultEvent;
  getEventTypesFromDB: typeof getEventTypesFromDB;
  teamEventEntitlements: Pick<TeamEventEntitlementService, "assertActive">;
};

const defaultDependencies: GetEventTypeDependencies = {
  getDefaultEvent,
  getEventTypesFromDB,
  teamEventEntitlements: new TeamEventEntitlementService(),
};

function getBillingTeamId(eventType: Awaited<ReturnType<typeof getEventTypesFromDB>>): number | null {
  if (typeof eventType.teamId === "number") return eventType.teamId;
  if (typeof eventType.parent?.teamId === "number") return eventType.parent.teamId;
  return null;
}

const getEventTypeWithoutReporting = async (
  { eventTypeId, eventTypeSlug }: GetEventTypeInput,
  dependencies: GetEventTypeDependencies = defaultDependencies
) => {
  if (!eventTypeId && !eventTypeSlug) {
    throw new HttpError({ statusCode: 400, message: "Either eventTypeId or eventTypeSlug must be provided" });
  }

  // handle dynamic user
  const eventType =
    !eventTypeId && !!eventTypeSlug
      ? dependencies.getDefaultEvent(eventTypeSlug)
      : await dependencies.getEventTypesFromDB(eventTypeId);

  if (eventTypeId) {
    await dependencies.teamEventEntitlements.assertActive(
      getBillingTeamId(eventType as Awaited<ReturnType<typeof getEventTypesFromDB>>)
    );
  }

  const isOrgTeamEvent = !!eventType?.team && !!eventType?.team?.parentId;

  return {
    ...eventType,
    bookingFields: getBookingFieldsWithSystemFields({ ...eventType, isOrgTeamEvent }),
  };
};

const getEventType = withReporting(getEventTypeWithoutReporting, "getEventType");

export { getEventType, getEventTypeWithoutReporting };
export type { GetEventTypeDependencies };
