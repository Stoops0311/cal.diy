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
  const databuddy_script = getAppData("DATABUDDY_SCRIPT_URL");
  const databuddy_api = getAppData("DATABUDDY_API_URL");
  const client_id = getAppData("CLIENT_ID");

  return (
    <div className="flex flex-col gap-2">
      <TextField
        dataTestid={`${slug}-url`}
        name="databuddyScriptUrl"
        label={t("databuddy_script_url")}
        defaultValue="https://cdn.databuddy.cc/databuddy.js"
        placeholder="https://cdn.databuddy.cc/databuddy.js"
        value={databuddy_script}
        disabled={disabled}
        onChange={(e) => {
          setAppData("DATABUDDY_SCRIPT_URL", e.target.value);
        }}
      />
      <TextField
        dataTestid={`${slug}-api-url`}
        name="databuddyApiUrl"
        label={t("databuddy_api_url")}
        defaultValue="https://basket.databuddy.cc"
        placeholder="https://basket.databuddy.cc"
        value={databuddy_api}
        disabled={disabled}
        onChange={(e) => {
          setAppData("DATABUDDY_API_URL", e.target.value);
        }}
      />
      <TextField
        dataTestid={`${slug}-client-id`}
        disabled={disabled}
        name="clientId"
        label={t("client_id")}
        placeholder="databuddy-client-id"
        value={client_id}
        onChange={(e) => {
          setAppData("CLIENT_ID", e.target.value);
        }}
      />
    </div>
  );
};

export default EventTypeAppSettingsInterface;
