import { useLocale } from "@calcom/lib/hooks/useLocale";
import { Alert } from "@calcom/ui/components/alert";
import { Button } from "@calcom/ui/components/button";
import { Form, TextField } from "@calcom/ui/components/form";
import SetupShell from "@calcom/web/components/apps/SetupShell";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";

export default function CalDavCalendarSetup() {
  const { t } = useLocale();
  const router = useRouter();
  const form = useForm({
    defaultValues: {
      url: "",
      username: "",
      password: "",
    },
  });

  const [errorMessage, setErrorMessage] = useState("");
  const [errorActionUrl, setErrorActionUrl] = useState("");

  return (
    <SetupShell
      logo={
        // eslint-disable-next-line @next/next/no-img-element
        <img src="/api/app-store/caldavcalendar/icon.svg" alt="CalDav Calendar" className="h-12 w-12" />
      }
      name="CalDav Calendar"
      description={t("credentials_stored_encrypted")}>
      <Form
        form={form}
        handleSubmit={async (values) => {
          setErrorMessage("");
          const res = await fetch("/api/integrations/caldavcalendar/add", {
            method: "POST",
            body: JSON.stringify(values),
            headers: {
              "Content-Type": "application/json",
            },
          });
          const json = await res.json();
          if (!res.ok) {
            setErrorMessage(json?.message || t("something_went_wrong"));
            if (json.actionUrl) {
              setErrorActionUrl(json.actionUrl);
            }
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
            placeholder="https://example.com/calendar"
          />
          <TextField
            required
            type="text"
            {...form.register("username")}
            label={t("username")}
            placeholder="calendar-user"
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

        {errorMessage && (
          <Alert
            severity="error"
            title={errorMessage}
            actions={
              errorActionUrl !== "" ? (
                <Button href={errorActionUrl} color="secondary" target="_blank" className="ml-5 w-32 p-5!">
                  {t("go_to_admin")}
                </Button>
              ) : undefined
            }
            className="my-4"
          />
        )}
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
