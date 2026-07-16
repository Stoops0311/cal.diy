import process from "node:process";
import { useLocale } from "@calcom/lib/hooks/useLocale";
import { Alert } from "@calcom/ui/components/alert";
import { Button } from "@calcom/ui/components/button";
import { Form, TextField } from "@calcom/ui/components/form";
import SetupShell from "@calcom/web/components/apps/SetupShell";
import { useCalendarIntegrationFetch } from "@calcom/web/components/apps/useCalendarIntegrationFetch";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";

export default function Exchange2016CalendarSetup() {
  const { t } = useLocale();
  const router = useRouter();
  const integrationFetch = useCalendarIntegrationFetch();
  const form = useForm({
    defaultValues: {
      username: "",
      password: "",
      url: process.env.EXCHANGE_DEFAULT_EWS_URL || "",
    },
  });

  const [errorMessage, setErrorMessage] = useState("");

  return (
    <SetupShell
      logo={
        <img
          src="/api/app-store/exchange2016calendar/icon.svg"
          alt="Exchange 2016 Calendar"
          className="h-12 w-12"
        />
      }
      name="Exchange 2016 Calendar"
      description={t("credentials_stored_encrypted")}>
      <Form
        form={form}
        handleSubmit={async (values) => {
          setErrorMessage("");
          const res = await integrationFetch("/api/integrations/exchange2016calendar/add", {
            method: "POST",
            body: JSON.stringify(values),
            headers: {
              "Content-Type": "application/json",
            },
          });
          const json = await res.json();
          if (!res.ok) {
            setErrorMessage(json?.message || t("something_went_wrong"));
          } else {
            router.push(json.url);
          }
        }}>
        <fieldset className="stack-y-2" disabled={form.formState.isSubmitting}>
          <TextField
            required
            type="text"
            {...form.register("url")}
            label={t("calendar_url")}
            placeholder="https://example.com/Ews/Exchange.asmx"
          />
          <TextField
            required
            type="text"
            {...form.register("username")}
            label={t("email")}
            placeholder="calendar-user@example.com"
          />
          <TextField
            required
            type="password"
            {...form.register("password")}
            label={t("password")}
            placeholder="•••••••••••••"
            autoComplete="password"
          />
        </fieldset>

        {errorMessage && <Alert severity="error" title={errorMessage} className="my-4" />}
        <div className="mt-5 justify-end space-x-2 rtl:space-x-reverse sm:mt-4 sm:flex">
          <Button type="button" color="secondary" onClick={() => router.back()}>
            {t("cancel")}
          </Button>
          <Button type="submit" loading={form.formState.isSubmitting}>
            {t("save")}
          </Button>
        </div>
      </Form>
    </SetupShell>
  );
}
