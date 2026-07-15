import { useLocale } from "@calcom/lib/hooks/useLocale";
import { Alert } from "@calcom/ui/components/alert";
import { Button } from "@calcom/ui/components/button";
import { Form, TextField } from "@calcom/ui/components/form";
import SetupShell from "@calcom/web/components/apps/SetupShell";
import { PlusIcon, TrashIcon } from "@coss/ui/icons";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";

export default function ICSFeedSetup() {
  const { t } = useLocale();
  const router = useRouter();
  const form = useForm({
    defaultValues: {},
  });

  const [urls, setUrls] = useState<string[]>([""]);
  const [errorMessage, setErrorMessage] = useState("");
  const [errorActionUrl, setErrorActionUrl] = useState("");

  return (
    <SetupShell
      logo={
        // eslint-disable-next-line @next/next/no-img-element
        <img src="/api/app-store/ics-feedcalendar/icon.svg" alt="ICS Feed" className="h-12 w-12" />
      }
      name="ICS Feed"
      description={t("credentials_stored_encrypted")}>
      <Form
        form={form}
        handleSubmit={async (_) => {
          setErrorMessage("");
          const res = await fetch("/api/integrations/ics-feedcalendar/add", {
            method: "POST",
            body: JSON.stringify({ urls }),
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
          {urls.map((url, i) => (
            <div key={i} className="flex w-full items-center gap-2">
              <TextField
                required
                type="text"
                label={t("calendar_url")}
                value={url}
                containerClassName={`w-full ${i === 0 ? "mr-6" : ""}`}
                onChange={(e) => {
                  const newVal = e.target.value as string;
                  setUrls((urls) => urls.map((x, ii) => (ii === i ? newVal : x)));
                }}
                placeholder="https://example.com/calendar.ics"
              />
              {i !== 0 ? (
                <button
                  type="button"
                  aria-label={t("remove_calendar_url")}
                  className="mb-2 h-min rounded-md p-1 text-subtle hover:bg-muted hover:text-emphasis focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emphasis"
                  onClick={() => setUrls((urls) => urls.filter((_, ii) => i !== ii))}>
                  <TrashIcon size={16} />
                </button>
              ) : null}
            </div>
          ))}
        </fieldset>

        <button
          className="rounded-md text-sm hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emphasis"
          type="button"
          onClick={() => {
            setUrls((urls) => urls.concat(""));
          }}>
          {t("add")} <PlusIcon className="inline" size={16} />
        </button>

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
