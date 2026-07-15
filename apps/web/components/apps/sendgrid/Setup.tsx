import { useLocale } from "@calcom/lib/hooks/useLocale";
import { Button } from "@calcom/ui/components/button";
import { Form, TextField } from "@calcom/ui/components/form";
import { showToast } from "@calcom/ui/components/toast";
import SetupShell from "@calcom/web/components/apps/SetupShell";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import z from "zod";

const formSchema = z.object({
  api_key: z.string(),
});

export default function SendgridSetup() {
  const { t } = useLocale();
  const router = useRouter();
  const [testPassed, setTestPassed] = useState<boolean | undefined>(undefined);
  const [testLoading, setTestLoading] = useState<boolean>(false);

  const form = useForm<{
    api_key: string;
  }>({
    resolver: zodResolver(formSchema),
  });

  useEffect(() => {
    const timer = setTimeout(() => {
      if (testPassed === false) {
        setTestPassed(undefined);
      }
    }, 3000);
    return () => clearTimeout(timer);
  }, [testPassed]);

  return (
    <SetupShell
      logo={<img src="/api/app-store/sendgrid/logo.png" alt="Sendgrid" className="h-12 w-12" />}
      name="SendGrid"
      description={
        <>
          {t("generate_api_key_description", { appName: "Sendgrid" })}{" "}
          <a
            className="font-medium underline underline-offset-4 hover:text-emphasis"
            href="https://app.sendgrid.com/settings/api_keys"
            target="_blank"
            rel="noopener noreferrer">
            Sendgrid
          </a>
          . {t("it_stored_encrypted")}
        </>
      }>
      <Form
        form={form}
        handleSubmit={async (values) => {
          const res = await fetch("/api/integrations/sendgrid/add", {
            method: "POST",
            body: JSON.stringify(values),
            headers: {
              "Content-Type": "application/json",
            },
          });
          const json = await res.json();

          if (res.ok) {
            router.push(json.url);
          } else {
            showToast(json.message, "error");
          }
        }}>
        <fieldset className="stack-y-2" disabled={form.formState.isSubmitting}>
          <Controller
            name="api_key"
            control={form.control}
            render={({ field: { onBlur, onChange } }) => (
              <TextField
                className="my-0"
                onBlur={onBlur}
                disabled={testPassed === true}
                name="api_key"
                label={t("api_key")}
                placeholder="SG.xxxxxx..."
                onChange={async (e) => {
                  onChange(e.target.value);
                  form.setValue("api_key", e.target.value);
                  await form.trigger("api_key");
                }}
              />
            )}
          />
        </fieldset>
        <div className="mt-5 justify-end space-x-2 rtl:space-x-reverse sm:mt-4 sm:flex">
          <Button type="button" color="secondary" onClick={() => router.back()}>
            {t("cancel")}
          </Button>
          <Button
            type="submit"
            loading={testLoading}
            disabled={testPassed === true}
            StartIcon={testPassed === undefined ? undefined : testPassed ? "check" : "x"}
            className={
              testPassed !== undefined
                ? testPassed
                  ? "bg-cal-success! text-success! hover:bg-cal-success"
                  : "border-semantic-error! bg-error text-error! hover:bg-error"
                : "secondary"
            }
            color={testPassed === true ? "minimal" : "secondary"}
            onClick={async () => {
              const check = await form.trigger("api_key");
              if (!check) return;
              const api_key = form.getValues("api_key");
              setTestLoading(true);
              const res = await fetch("/api/integrations/sendgrid/check", {
                method: "POST",
                body: JSON.stringify({ api_key }),
                headers: {
                  "Content-Type": "application/json",
                },
              });

              if (res.status === 200) {
                setTestPassed(true);
              } else {
                setTestPassed(false);
              }
              setTestLoading(false);
            }}>
            {t(testPassed !== undefined ? (testPassed ? "test_passed" : "test_failed") : "test_api_key")}
          </Button>
          <Button type="submit" loading={form.formState.isSubmitting}>
            {t("save")}
          </Button>
        </div>
      </Form>
    </SetupShell>
  );
}
