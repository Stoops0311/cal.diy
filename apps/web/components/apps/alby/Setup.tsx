import AppNotInstalledMessage from "@calcom/app-store/_components/AppNotInstalledMessage";
import { albyCredentialKeysSchema } from "@calcom/app-store/alby/lib/albyCredentialKeysSchema";
import type { IAlbySetupProps } from "@calcom/app-store/alby/pages/setup/_getServerSideProps";
import { APP_NAME } from "@calcom/lib/constants";
import { useCompatSearchParams } from "@calcom/lib/hooks/useCompatSearchParams";
import { useLocale } from "@calcom/lib/hooks/useLocale";
import { trpc } from "@calcom/trpc/react";
import { Alert } from "@calcom/ui/components/alert";
import { Badge } from "@calcom/ui/components/badge";
import { Button } from "@calcom/ui/components/button";
import { showToast } from "@calcom/ui/components/toast";
import SetupShell from "@calcom/web/components/apps/SetupShell";
import { auth, Client, webln } from "@getalby/sdk";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

export default function AlbySetup(props: IAlbySetupProps) {
  const params = useCompatSearchParams();
  if (params?.get("callback") === "true") {
    return <AlbySetupCallback />;
  }

  return <AlbySetupPage {...props} />;
}

function AlbySetupCallback() {
  const { t } = useLocale();
  const [error, setError] = useState<string | null>(null);
  const searchParams = useCompatSearchParams();

  useEffect(() => {
    if (!searchParams) {
      return;
    }

    if (!window.opener) {
      setError("Something went wrong. Opener not available. Please contact support@getalby.com");
      return;
    }

    const code = searchParams?.get("code");
    const error = searchParams?.get("error");

    if (!code) {
      setError("declined");
    }
    if (error) {
      setError(error);
      alert(error);
      return;
    }

    window.opener.postMessage({
      type: "alby:oauth:success",
      payload: { code },
    });
    window.close();
  }, [searchParams]);

  return (
    <div>
      {error && <p>{t("authorization_failed", { error })}</p>}
      {!error && <p>{t("connecting")}</p>}
    </div>
  );
}

function AlbySetupPage(props: IAlbySetupProps) {
  const router = useRouter();
  const { t } = useLocale();
  const integrations = trpc.viewer.apps.integrations.useQuery({ variant: "payment", appId: "alby" });
  const [albyPaymentAppCredentials] = integrations.data?.items || [];
  const [credentialId] = albyPaymentAppCredentials?.userCredentialIds || [-1];
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

  const connectWithAlby = useCallback(async () => {
    const authClient = new auth.OAuth2User({
      client_id: props.clientId,
      client_secret: props.clientSecret,
      callback: `${process.env.NEXT_PUBLIC_WEBAPP_URL}/apps/alby/setup?callback=true`,
      scopes: ["invoices:read", "account:read"],
      user_agent: APP_NAME,
    });

    const weblnOAuthProvider = new webln.OauthWeblnProvider({
      auth: authClient,
    });
    await weblnOAuthProvider.enable();

    const client = new Client(authClient);
    const accountInfo = await client.accountInformation({});
    // TODO: add a way to delete the endpoint when the app is uninstalled
    const webhookEndpoint = await client.createWebhookEndpoint({
      filter_types: ["invoice.incoming.settled"],
      url: `${process.env.NEXT_PUBLIC_WEBAPP_URL}/api/integrations/alby/webhook`,
      description: APP_NAME,
    });

    saveKeysMutation.mutate({
      credentialId,
      key: albyCredentialKeysSchema.parse({
        account_id: accountInfo.identifier,
        account_email: accountInfo.email,
        account_lightning_address: accountInfo.lightning_address,
        webhook_endpoint_id: webhookEndpoint.id,
        webhook_endpoint_secret: webhookEndpoint.endpoint_secret,
      }),
    });
  }, [credentialId, props.clientId, props.clientSecret, saveKeysMutation]);

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
        <AppNotInstalledMessage appName="alby" />
      </div>
    );
  }

  const albyIcon = (
    <>
      <img className="h-12 w-12 dark:hidden" src="/api/app-store/alby/icon-borderless.svg" alt="Alby Icon" />
      <img
        className="hidden h-12 w-12 dark:block"
        src="/api/app-store/alby/icon-borderless-dark.svg"
        alt="Alby Icon"
      />
    </>
  );

  return (
    <SetupShell
      logo={albyIcon}
      name="Alby"
      description={!props.lightningAddress ? t("alby_connect_description") : undefined}>
      <div className="flex flex-col items-start gap-5">
        {!props.lightningAddress ? (
          <Button className="h-10 justify-center gap-2" type="button" onClick={connectWithAlby}>
            {albyIcon}
            <span className="mr-2">{t("connect_with_provider", { provider: "Alby" })}</span>
          </Button>
        ) : (
          <>
            <p className="text-emphasis font-medium">{t("provider_connected", { provider: "Alby" })}</p>
            <Badge>
              {t("email")}: {props.email}
            </Badge>
            <Badge>
              {t("lightning_address")}: {props.lightningAddress}
            </Badge>
          </>
        )}

        {/* TODO: remove when invoices are generated using user identifier */}
        <Alert severity="info" title={t("lightning_address")} message={t("alby_lightning_address_note")} />
        <Button color="secondary" href="/apps/alby">
          {t("go_to_app_store_listing")}
        </Button>
      </div>
    </SetupShell>
  );
}
