import { useLocale } from "@calcom/lib/hooks/useLocale";
import { Badge } from "@calcom/ui/components/badge";
import { Button } from "@calcom/ui/components/button";
import { Select } from "@calcom/ui/components/form";
import { showToast } from "@calcom/ui/components/toast";
import { useEffect, useMemo, useState } from "react";

export interface IAppConfigurationProps {
  credentialIds: number[];
}

const saveSettings = async ({
  parameter,
  sleepValue,
}: {
  parameter: { label: string; value: string };
  sleepValue: number;
}) => {
  try {
    const response = await fetch("/api/integrations/vital/save", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sleepValue,
        parameter: parameter.value,
      }),
    });
    if (response.ok && response.status === 200) {
      return true;
    }
  } catch (error) {
    if (error instanceof Error) {
      console.error(error.message);
    }
  }
};

const AppConfiguration = (props: IAppConfigurationProps) => {
  const [credentialId] = props.credentialIds;
  const { t } = useLocale();

  const options = useMemo(
    () => [
      { label: t("vital_total_sleep_metric"), value: "total" },
      { label: t("vital_duration_sleep_metric"), value: "duration" },
    ],
    [t]
  );

  const [selectedParam, setSelectedParam] = useState<{ label: string; value: string }>(options[0]);
  const [touchedForm, setTouchedForm] = useState(false);
  const defaultSleepValue = 0;
  const [sleepValue, setSleepValue] = useState(defaultSleepValue);
  const [connected, setConnected] = useState(false);
  const [saveLoading, setSaveLoading] = useState(false);
  useEffect(() => {
    async function getVitalsConfig() {
      const response = await fetch("/api/integrations/vital/settings", {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
      });
      if (response.status === 200) {
        const vitalSettings: {
          connected: boolean;
          parameter: string;
          sleepValue: number;
        } = await response.json();

        if (vitalSettings && vitalSettings.connected) {
          setConnected(vitalSettings.connected);
        }
        if (vitalSettings.sleepValue && vitalSettings.parameter) {
          const selectedParam = options.find(
            (item: { value: string }) => item.value === vitalSettings.parameter
          );
          if (selectedParam) {
            setSelectedParam(selectedParam);
          }
          setSleepValue(vitalSettings.sleepValue);
        }
      }
    }
    getVitalsConfig();
  }, [options]);

  if (!credentialId) {
    return null;
  }

  const disabledSaveButton = !touchedForm || sleepValue === 0;
  return (
    <div className="bg-subtle rounded-xl p-1 text-sm">
      <div className="bg-default rounded-xl p-5">
        <div className="flex items-center justify-between gap-4">
          <h3 className="text-emphasis font-semibold">{t("vital_connection")}</h3>
          <Badge variant={connected ? "success" : "gray"}>
            {t(connected ? "connected" : "disconnected")}
          </Badge>
        </div>
        <div className="border-subtle mt-5 border-t pt-5">
          <h4 className="text-emphasis font-semibold">{t("sleeping_reschedule_automation")}</h4>
          <p className="text-subtle mt-1">{t("sleeping_reschedule_description")}</p>
        </div>

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="vital-parameter" className="text-default mb-1 block text-sm font-medium">
              {t("parameter")}
            </label>
            <Select
              inputId="vital-parameter"
              options={options}
              value={selectedParam}
              onChange={(option) => {
                if (option) setSelectedParam(option);
                setTouchedForm(true);
              }}
            />
          </div>
          <div>
            <label htmlFor="value" className="text-default mb-1 block text-sm font-medium">
              {t("trigger_at_or_below")}
            </label>
            <div className="flex items-center gap-2">
              <input
                id="value"
                type="number"
                min={1}
                max={99}
                value={sleepValue}
                onChange={(event) => {
                  setSleepValue(Number(event.currentTarget.value));
                  setTouchedForm(true);
                }}
                className="border-default bg-default text-default focus:border-emphasis focus:shadow-outline-gray-focused block h-9 w-24 rounded-lg border px-3 text-sm outline-none"
              />
              <span className="text-subtle font-medium">{t("hours")}</span>
            </div>
          </div>
        </div>
        <Button
          className="mt-5"
          onClick={async () => {
            try {
              setSaveLoading(true);
              await saveSettings({ parameter: selectedParam, sleepValue: sleepValue });
              showToast(t("vital_configuration_saved"), "success");
            } catch (error) {
              showToast(t("vital_configuration_save_error"), "error");
              setSaveLoading(false);
            }
            setTouchedForm(false);
            setSaveLoading(false);
          }}
          loading={saveLoading}
          disabled={disabledSaveButton}>
          {t("save")}
        </Button>
      </div>
    </div>
  );
};

export default AppConfiguration;
