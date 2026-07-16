import { useCreateEventTypeForm } from "@calcom/atoms/hooks/event-types/private/useCreateEventTypeForm";
import { useLocale } from "@calcom/lib/hooks/useLocale";
import { HttpError } from "@calcom/lib/http-error";
import type { EventType } from "@calcom/prisma/client";
import { trpc } from "@calcom/trpc/react";
import type { EntitlementUpgradeContext } from "../../billing/useEntitlementUpgrade";
import { useEntitlementUpgrade } from "../../billing/useEntitlementUpgrade";

export function resolveEventTypeBillingOrganizationId({
  manageableOrganizationId,
  parentOrganizationId,
  teamId,
}: {
  manageableOrganizationId?: number;
  parentOrganizationId?: number | null;
  teamId?: number | null;
}): number | undefined {
  if (parentOrganizationId) return parentOrganizationId;
  return teamId && teamId === manageableOrganizationId ? teamId : undefined;
}

export const useCreateEventType = (
  onSuccessMutation: (eventType: EventType) => void,
  onErrorMutation: (message: string) => void,
  upgradeContext: EntitlementUpgradeContext
) => {
  const utils = trpc.useUtils();
  const { t } = useLocale();
  const { form, isManagedEventType } = useCreateEventTypeForm();
  const { openFromError } = useEntitlementUpgrade();

  const createMutation = trpc.viewer.eventTypesHeavy.create.useMutation({
    onSuccess: async ({ eventType }) => {
      onSuccessMutation(eventType);

      await utils.viewer.eventTypes.getEventTypesFromGroup.fetchInfinite({
        group: { teamId: eventType.teamId, parentId: eventType.parentId },
        searchQuery: "",
        limit: 10,
      });

      form.reset();
    },
    onError: (err) => {
      if (openFromError(err, upgradeContext)) return;

      let error = err.message;
      if (err instanceof HttpError) {
        error = `${err.statusCode}: ${err.message}`;
      }

      if (err.data?.code === "BAD_REQUEST") {
        error = `${err.data.code}: ${t("error_event_type_url_duplicate")}`;
      }

      if (err.data?.code === "UNAUTHORIZED") {
        error = `${err.data.code}: ${t("error_event_type_unauthorized_create")}`;
      }
      onErrorMutation(error);
    },
  });

  return { form, createMutation, isManagedEventType };
};
