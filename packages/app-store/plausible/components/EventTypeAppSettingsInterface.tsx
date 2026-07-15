import type { EventTypeAppSettingsComponent } from "@calcom/app-store/types";
import { useLocale } from "@calcom/lib/hooks/useLocale";
import { TextField } from "@calcom/ui/components/form";

const EventTypeAppSettingsInterface: EventTypeAppSettingsComponent = ({
  getAppData,
  setAppData,
  disabled,
  slug,
}) => {
  const { t } = useLocale();
  const plausibleUrl = getAppData("PLAUSIBLE_URL");
  const trackingId = getAppData("trackingId");

  return (
    <div className="flex flex-col gap-2">
      <TextField
        dataTestid={`${slug}-url`}
        name="plausibleUrl"
        label={t("plausible_url")}
        defaultValue="https://plausible.io/js/script.js"
        placeholder="https://plausible.io/js/script.js"
        value={plausibleUrl}
        disabled={disabled}
        onChange={(e) => {
          setAppData("PLAUSIBLE_URL", e.target.value);
        }}
      />
      <TextField
        dataTestid={`${slug}-tracking-id`}
        disabled={disabled}
        name="trackedDomain"
        label={t("tracked_domain")}
        placeholder="yourdomain.com"
        value={trackingId}
        onChange={(e) => {
          setAppData("trackingId", e.target.value);
        }}
      />
    </div>
  );
};

export default EventTypeAppSettingsInterface;
