import type { EventTypeAppSettingsComponent } from "@calcom/app-store/types";
import { useLocale } from "@calcom/lib/hooks/useLocale";
import { Label, Select, TextField } from "@calcom/ui/components/form";
import { useEffect } from "react";

const EventTypeAppSettingsInterface: EventTypeAppSettingsComponent = ({
  getAppData,
  setAppData,
  disabled,
}) => {
  const { t } = useLocale();
  const trackingId = getAppData("trackingId");
  const trackingEvent = getAppData("trackingEvent");

  type EventOption = { label: string; value: string };
  const eventOptions: EventOption[] = [
    { label: t("meta_event_lead"), value: "Lead" },
    { label: t("meta_event_complete_registration"), value: "CompleteRegistration" },
    { label: t("meta_event_schedule"), value: "Schedule" },
    { label: t("meta_event_page_view"), value: "PageView" },
  ];

  const currentOption = eventOptions.find((e) => e.value === trackingEvent) || eventOptions[0];

  useEffect(() => {
    if (!trackingEvent) {
      setAppData("trackingEvent", "Lead");
    }
  }, [trackingEvent, setAppData]);

  return (
    <div className="flex flex-col gap-2">
      <TextField
        name="pixelId"
        label={t("pixel_id")}
        value={trackingId}
        disabled={disabled}
        onChange={(e) => {
          setAppData("trackingId", e.target.value);
        }}
      />
      <div className="flex flex-col gap-1">
        <Label htmlFor="meta-conversion-event">{t("select_conversion_event")}</Label>
        <Select
          inputId="meta-conversion-event"
          options={eventOptions}
          value={currentOption}
          isDisabled={disabled}
          isSearchable={false}
          onChange={(e) => {
            setAppData("trackingEvent", e?.value ?? "Lead");
          }}
        />
      </div>
    </div>
  );
};

export default EventTypeAppSettingsInterface;
