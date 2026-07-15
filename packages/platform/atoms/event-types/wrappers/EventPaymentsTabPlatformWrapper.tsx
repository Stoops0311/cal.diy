import type {
  EventTypeApp,
  EventTypeForAppCard,
} from "@calcom/app-store/_components/EventTypeAppCardInterface";
import { EventTypeAppCard } from "@calcom/app-store/_components/EventTypeAppCardInterface";
import type { EventTypeAppsList } from "@calcom/app-store/utils";
import useAppsData from "@calcom/features/apps/hooks/useAppsData";
import type { EventTypeSetupProps } from "@calcom/features/eventtypes/lib/types";
import { useLocale } from "@calcom/lib/hooks/useLocale";
import { EmptyScreen } from "@calcom/ui/components/empty-screen";
import { StripeConnect } from "../../connect/stripe/StripeConnect";
import { useCheck } from "../../hooks/stripe/useCheck";
import { useAtomsEventTypeById } from "../hooks/useAtomEventTypeAppIntegration";

const EventPaymentsTabPlatformWrapper = ({ eventType }: { eventType: EventTypeSetupProps["eventType"] }) => {
  const { t } = useLocale();
  const { allowConnect, checked } = useCheck({ teamId: eventType.teamId });

  const isStripeConnected = !checked || !allowConnect;

  if (!checked)
    return (
      <div className="text-subtle text-sm" aria-live="polite">
        {t("checking")}
      </div>
    );

  return (
    <div>
      {!isStripeConnected ? (
        <EmptyScreen
          Icon="grid-3x3"
          headline={t("stripe_not_connected")}
          description={t("stripe_not_connected_description")}
          buttonRaw={
            <StripeConnect
              teamId={eventType.teamId}
              label={t("connect_to_stripe")}
              loadingLabel={t("connecting")}
              alreadyConnectedLabel={t("connect_to_stripe")}
              isClickable={true}
              color="secondary"
              redir={typeof window === "undefined" ? undefined : window.location.href}
            />
          }
        />
      ) : (
        <StripeAppCard eventType={eventType} />
      )}
    </div>
  );
};

const StripeAppCard = ({ eventType }: { eventType: EventTypeSetupProps["eventType"] }) => {
  const { getAppDataGetter, getAppDataSetter, eventTypeFormMetadata } = useAppsData();
  const { data: stripeData, isLoading } = useAtomsEventTypeById("stripe", eventType.teamId);
  const transformedAppData = {
    ...stripeData?.app,
    logo: `https://app.cal.com${stripeData?.app.logo}`,
  };

  if (isLoading || !stripeData) return null;

  if (!!transformedAppData.teams && transformedAppData.teams.length > 0) {
    const eventTypeAssociatedTeam = transformedAppData.teams.find((team) => team.teamId === eventType.teamId);

    if (!eventTypeAssociatedTeam) return null;

    return (
      <EventTypeAppCard
        getAppData={getAppDataGetter(transformedAppData.slug as EventTypeAppsList)}
        setAppData={getAppDataSetter(
          transformedAppData.slug as EventTypeAppsList,
          transformedAppData.categories as string[],
          eventTypeAssociatedTeam.credentialId
        )}
        key={(transformedAppData.slug ?? stripeData.app.slug) + eventTypeAssociatedTeam.credentialId}
        app={
          {
            ...transformedAppData,
            credentialOwner: {
              name: eventTypeAssociatedTeam.name,
              avatar: eventTypeAssociatedTeam.logoUrl,
              teamId: eventTypeAssociatedTeam.teamId,
              credentialId: eventTypeAssociatedTeam.credentialId,
            },
          } as unknown as EventTypeApp
        }
        eventType={eventType as unknown as EventTypeForAppCard}
        eventTypeFormMetadata={eventTypeFormMetadata}
      />
    );
  }

  return (
    <EventTypeAppCard
      getAppData={getAppDataGetter(transformedAppData.slug as EventTypeAppsList)}
      setAppData={getAppDataSetter(
        transformedAppData.slug as EventTypeAppsList,
        transformedAppData.categories as string[],
        transformedAppData.userCredentialIds && (transformedAppData.userCredentialIds[0] as number)
      )}
      key={transformedAppData.slug}
      app={transformedAppData as unknown as EventTypeApp}
      eventType={eventType as unknown as EventTypeForAppCard}
      eventTypeFormMetadata={eventTypeFormMetadata}
    />
  );
};

export default EventPaymentsTabPlatformWrapper;
