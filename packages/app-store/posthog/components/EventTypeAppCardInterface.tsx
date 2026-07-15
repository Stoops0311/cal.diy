import AppCard from "@calcom/app-store/_components/AppCard";
import useIsAppEnabled from "@calcom/app-store/_utils/useIsAppEnabled";
import { useAppContextWithSchema } from "@calcom/app-store/EventTypeAppContext";
import type { EventTypeAppCardComponent } from "@calcom/app-store/types";
import { useLocale } from "@calcom/lib/hooks/useLocale";
import { TextField } from "@calcom/ui/components/form";
import type { appDataSchema } from "../zod";

const EventTypeAppCard: EventTypeAppCardComponent = function EventTypeAppCard({
  app,
  eventType,
  onAppInstallSuccess,
}) {
  const { t } = useLocale();
  const { getAppData, setAppData, disabled } = useAppContextWithSchema<typeof appDataSchema>();
  const trackingId = getAppData("TRACKING_ID");
  const apiHost = getAppData("API_HOST");
  const { enabled, updateEnabled } = useIsAppEnabled(app);

  return (
    <AppCard
      onAppInstallSuccess={onAppInstallSuccess}
      hideSettingsIcon
      app={app}
      switchOnClick={(e) => {
        updateEnabled(e);
      }}
      switchChecked={enabled}
      teamId={eventType.team?.id || undefined}>
      <div className="flex flex-col gap-2">
        <TextField
          required
          disabled={disabled}
          name="trackingId"
          label={t("tracking_id")}
          value={trackingId}
          placeholder={t("tracking_id_placeholder")}
          onChange={(e) => {
            setAppData("TRACKING_ID", e.target.value);
          }}
        />
        <TextField
          required
          disabled={disabled}
          name="apiHost"
          label={t("api_host")}
          value={apiHost}
          placeholder={t("api_host_placeholder")}
          onChange={(e) => {
            setAppData("API_HOST", e.target.value);
          }}
        />
      </div>
    </AppCard>
  );
};

export default EventTypeAppCard;
