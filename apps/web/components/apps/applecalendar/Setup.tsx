import { APP_NAME } from "@calcom/lib/constants";
import { useLocale } from "@calcom/lib/hooks/useLocale";
import { Alert } from "@calcom/ui/components/alert";
import { Button } from "@calcom/ui/components/button";
import { Form, PasswordField, TextField } from "@calcom/ui/components/form";
import SetupShell from "@calcom/web/components/apps/SetupShell";
import { useCalendarIntegrationFetch } from "@calcom/web/components/apps/useCalendarIntegrationFetch";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";

export default function AppleCalendarSetup() {
  const { t } = useLocale();
  const router = useRouter();
  const integrationFetch = useCalendarIntegrationFetch();
  const form = useForm({
    defaultValues: {
      username: "",
      password: "",
    },
  });

  const [errorMessage, setErrorMessage] = useState("");

  return (
    <SetupShell
      logo={
        // eslint-disable-next-line @next/next/no-img-element
        <img src="/api/app-store/applecalendar/icon.svg" alt="Apple Calendar" className="h-12 w-12" />
      }
      name="Apple Calendar"
      description={
        <>
          {t("apple_server_generate_password", { appName: APP_NAME })}{" "}
          <a
            className="font-bold hover:underline"
            href="https://appleid.apple.com/account/manage"
            target="_blank"
            rel="noopener noreferrer">
            https://appleid.apple.com/account/manage
          </a>
          . {t("credentials_stored_encrypted")}
        </>
      }>
      <Form
        form={form}
        handleSubmit={async (values) => {
          try {
            setErrorMessage("");
            const res = await integrationFetch("/api/integrations/applecalendar/add", {
              method: "POST",
              body: JSON.stringify(values),
              headers: {
                "Content-Type": "application/json",
              },
            });
            const json = await res.json();
            if (!res.ok) {
              setErrorMessage(t(json?.message) || t("something_went_wrong"));
            } else {
              router.push(json.url);
            }
          } catch (err) {
            setErrorMessage(t("unable_to_add_apple_calendar"));
          }
        }}>
        <fieldset
          className="stack-y-4"
          disabled={form.formState.isSubmitting}
          data-testid="apple-calendar-form">
          <TextField
            required
            type="text"
            {...form.register("username")}
            label={t("apple_id")}
            placeholder="appleid@domain.com"
            data-testid="apple-calendar-email"
          />
          <PasswordField
            required
            {...form.register("password")}
            label={t("password")}
            placeholder="•••••••••••••"
            autoComplete="password"
            data-testid="apple-calendar-password"
          />
        </fieldset>

        {errorMessage && <Alert severity="error" title={errorMessage} className="my-4" />}
        <div className="mt-5 justify-end space-x-2 rtl:space-x-reverse sm:mt-4 sm:flex">
          <Button type="button" color="secondary" onClick={() => router.back()}>
            {t("cancel")}
          </Button>
          <Button
            type="submit"
            loading={form.formState.isSubmitting}
            data-testid="apple-calendar-login-button">
            {t("save")}
          </Button>
        </div>
      </Form>
    </SetupShell>
  );
}
