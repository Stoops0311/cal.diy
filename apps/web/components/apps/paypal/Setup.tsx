import AppNotInstalledMessage from "@calcom/app-store/_components/AppNotInstalledMessage";
import { APP_NAME } from "@calcom/lib/constants";
import { useLocale } from "@calcom/lib/hooks/useLocale";
import { trpc } from "@calcom/trpc/react";
import { Button } from "@calcom/ui/components/button";
import { TextField } from "@calcom/ui/components/form";
import { showToast } from "@calcom/ui/components/toast";
import SetupShell from "@calcom/web/components/apps/SetupShell";
import { CircleAlertIcon } from "@coss/ui/icons";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function PayPalSetup() {
  const [newClientId, setNewClientId] = useState("");
  const [newSecretKey, setNewSecretKey] = useState("");
  const router = useRouter();
  const { t } = useLocale();
  const integrations = trpc.viewer.apps.integrations.useQuery({ variant: "payment", appId: "paypal" });
  const [paypalPaymentAppCredentials] = integrations.data?.items || [];
  const [credentialId] = paypalPaymentAppCredentials?.userCredentialIds || [-1];
  const showContent = !!integrations.data && integrations.isSuccess && !!credentialId;
  const saveKeysMutation = trpc.viewer.apps.updateAppCredentials.useMutation({
    onSuccess: () => {
      showToast(t("keys_have_been_saved"), "success");
      router.push("/event-types");
    },
    onError: (error) => {
      showToast(error.message, "error");
    },
  });

  if (integrations.isPending) {
    return (
      <div
        className="bg-default text-subtle flex min-h-screen items-center justify-center"
        aria-live="polite">
        {t("loading")}
      </div>
    );
  }

  if (!showContent) {
    return (
      <div className="bg-default flex min-h-screen p-4 sm:p-8">
        <AppNotInstalledMessage appName="paypal" />
      </div>
    );
  }

  return (
    <SetupShell
      logo={<img className="h-12 w-12" src="/api/app-store/paypal/icon.svg" alt={t("paypal_payment_logo")} />}
      name={t("paypal")}
      description={t("paypal_description", { appName: APP_NAME })}>
      <form autoComplete="off">
        <TextField
          label={t("client_id")}
          type="text"
          name="client_id"
          id="client_id"
          value={newClientId}
          onChange={(e) => setNewClientId(e.target.value)}
          role="presentation"
          className="mb-6"
        />

        <TextField
          label={t("secret_key")}
          type="password"
          name="access_token"
          id="access_token"
          value={newSecretKey}
          autoComplete="new-password"
          role="presentation"
          onChange={(e) => setNewSecretKey(e.target.value)}
        />

        <div className="mt-5 flex flex-row justify-end">
          <Button
            color="primary"
            onClick={() => {
              saveKeysMutation.mutate({
                credentialId,
                key: {
                  client_id: newClientId,
                  secret_key: newSecretKey,
                },
              });
            }}>
            {t("save")}
          </Button>
        </div>
      </form>
      <div className="border-subtle mt-10 border-t pt-6">
        <h2 className="font-cal text-emphasis text-xl tracking-tight">{t("paypal_getting_started")}</h2>

        <p className="text-default mt-6 inline-flex text-sm font-semibold">
          <CircleAlertIcon className="mr-2 mt-0.5 h-4 w-4" /> {t("important_requirements")}
        </p>
        <ul className="text-default ml-1 mt-2 list-disc pl-2 text-sm leading-6">
          <li>{t("paypal_business_account")}</li>
          <li>{t("paypal_developer_account")}</li>
        </ul>

        <p className="text-default mb-2 mt-5 text-sm font-semibold">{t("resources")}:</p>
        <a
          className="text-emphasis text-sm underline"
          target="_blank"
          href="https://developer.paypal.com/api/rest/#link-getclientidandclientsecret"
          rel="noreferrer">
          {t("paypal_rest_setup_guide")}
        </a>

        <h3 className="text-emphasis mt-6 text-sm font-semibold">{t("paypal_setup_instructions")}</h3>
        <p className="text-subtle mt-2 text-sm leading-6">{t("paypal_setup_note")}</p>

        <ol className="text-default ml-1 mt-5 list-decimal pl-2 text-sm leading-6">
          <li>
            {t("paypal_step_1")}{" "}
            <a
              target="_blank"
              href="https://developer.paypal.com/dashboard/applications/live"
              className="text-emphasis underline"
              rel="noreferrer">
              {t("here")}
            </a>
            .
          </li>
          <li>{t("paypal_step_2")}</li>
          <li>{t("paypal_step_3")}</li>

          <li>
            {t("paypal_step_4_part_1")}{" "}
            <a
              className="text-emphasis underline"
              href="https://developer.paypal.com/dashboard/applications/live">
              {t("dashboard")}
            </a>
            {t("paypal_step_4_part_2")}
          </li>
          <li>{t("paypal_step_5")}</li>
          <li>{t("paypal_step_6")}</li>
          <li>{t("paypal_step_7")}</li>
        </ol>
        <p className="text-default mt-5 inline-flex text-sm font-bold">
          <CircleAlertIcon className="mr-2 mt-0.5 h-4 w-4" />
          {t("reminder")}:
        </p>
        <p className="text-subtle mt-2 text-sm leading-6">{t("paypal_webhook_reminder")}</p>
      </div>
    </SetupShell>
  );
}
