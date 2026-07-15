import { useLocale } from "@calcom/lib/hooks/useLocale";
import { Button } from "@calcom/ui/components/button";
import { TextField } from "@calcom/ui/components/form";
import { useState } from "react";

export default function AppSettings() {
  const { t } = useLocale();
  const unit = "metric";
  const [location, setLocation] = useState("");

  return (
    <div className="stack-y-4 text-sm">
      <TextField
        placeholder={t("city_placeholder")}
        value={location}
        name="city"
        label={t("enter_city")}
        onChange={async (e) => {
          setLocation(e.target.value);
        }}
      />
      <Button
        href={`webcal://weather-in-calendar.com/cal/weather-cal.php?city=${location}&units=${unit}&temperature=day`}>
        {t("add_to_calendar")}
      </Button>
    </div>
  );
}
