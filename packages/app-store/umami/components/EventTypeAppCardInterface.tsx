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
  const siteId = getAppData("SITE_ID");
  const scriptURL = getAppData("SCRIPT_URL");
  const { enabled, updateEnabled } = useIsAppEnabled(app);

  return (
    <AppCard
      onAppInstallSuccess={onAppInstallSuccess}
      app={app}
      switchOnClick={(e) => {
        updateEnabled(e);
      }}
      switchChecked={enabled}
      teamId={eventType.team?.id || undefined}>
      <fieldset className="stack-y-2" disabled={disabled}>
        <TextField
          disabled={disabled}
          name="scriptUrl"
          label={t("script_url")}
          value={scriptURL}
          defaultValue="https://cloud.umami.is/script.js"
          placeholder={t("script_url_placeholder")}
          onChange={(e) => {
            setAppData("SCRIPT_URL", e.target.value);
          }}
        />
        <TextField
          disabled={disabled}
          name="siteId"
          label={t("site_id")}
          value={siteId}
          placeholder={t("site_id_placeholder")}
          onChange={(e) => {
            setAppData("SITE_ID", e.target.value);
          }}
        />
      </fieldset>
    </AppCard>
  );
};

export default EventTypeAppCard;
