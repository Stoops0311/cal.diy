import AppNotInstalledMessage from "@calcom/app-store/_components/AppNotInstalledMessage";
import KeyField from "@calcom/app-store/hitpay/components/KeyInput";
import { hitpayCredentialKeysSchema } from "@calcom/app-store/hitpay/lib/hitpayCredentialKeysSchema";
import type { IHitPaySetupProps } from "@calcom/app-store/hitpay/pages/setup/_getServerSideProps";
import { useCurrentSession as useSession } from "@calcom/features/auth/lib/useCurrentSession";
import { useCompatSearchParams } from "@calcom/lib/hooks/useCompatSearchParams";
import { useLocale } from "@calcom/lib/hooks/useLocale";
import { trpc } from "@calcom/trpc/react";
import { Button } from "@calcom/ui/components/button";
import { Switch } from "@calcom/ui/components/form";
import { showToast } from "@calcom/ui/components/toast";
import SetupShell from "@calcom/web/components/apps/SetupShell";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

export default function HitPaySetup(props: IHitPaySetupProps) {
  const params = useCompatSearchParams();
  if (params?.get("callback") === "true") {
    return <HitPaySetupCallback />;
  }

  return <HitPaySetupPage {...props} />;
}

function HitPaySetupCallback() {
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
      return;
    }

    window.opener.postMessage({
      type: "hitpay:oauth:success",
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

function HitPaySetupPage(props: IHitPaySetupProps) {
  const [loading, setLoading] = useState<boolean>(false);
  const [updatable, setUpdatable] = useState<boolean>(false);
  const [isSandbox, SetIsSandbox] = useState<boolean>(props.isSandbox || false);
  const [keyData, setKeyData] = useState<
    | {
        apiKey: string;
        saltKey: string;
      }
    | undefined
  >();
  const session = useSession();
  const router = useRouter();
  const { t } = useLocale();

  const settingsSchema = z.object({
    apiKey: z
      .string()
      .trim()
      .min(64)
      .max(128, {
        message: t("max_limit_allowed_hint", { limit: 128 }),
      }),
    saltKey: z
      .string()
      .trim()
      .min(64)
      .max(128, {
        message: t("max_limit_allowed_hint", { limit: 128 }),
      }),
  });

  const integrations = trpc.viewer.apps.integrations.useQuery({ variant: "payment", appId: "hitpay" });
  const [HitPayPaymentAppCredentials] = integrations.data?.items || [];
  const [credentialId] = HitPayPaymentAppCredentials?.userCredentialIds || [-1];
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

  const deleteMutation = trpc.viewer.credentials.delete.useMutation({
    onSuccess: () => {
      router.push("/apps/hitpay");
    },
    onError: () => {
      showToast(t("error_removing_app"), "error");
    },
  });

  const {
    register,
    handleSubmit,
    formState: { errors },
    watch,
    reset,
  } = useForm<z.infer<typeof settingsSchema>>({
    reValidateMode: "onChange",
    resolver: zodResolver(settingsSchema),
  });

  useEffect(() => {
    const keyObj = isSandbox ? props.sandbox : props.prod;
    const _keyData = {
      apiKey: keyObj?.apiKey || "",
      saltKey: keyObj?.saltKey || "",
    };

    reset(_keyData);
    setKeyData(_keyData);
  }, [isSandbox]);

  useEffect(() => {
    const subscription = watch((value) => {
      const { apiKey, saltKey } = value;
      if (apiKey && saltKey && (keyData?.apiKey !== apiKey || keyData?.saltKey !== saltKey)) {
        setUpdatable(true);
      } else {
        setUpdatable(false);
      }
    });

    return () => subscription.unsubscribe();
  }, [watch, keyData]);

  const onSubmit = handleSubmit(async (data) => {
    if (loading) return;
    setLoading(true);
    try {
      const keyParams = {
        isSandbox,
        prod: isSandbox ? props.prod : data,
        sandbox: isSandbox ? data : props.sandbox,
      };
      saveKeysMutation.mutate({
        credentialId,
        key: hitpayCredentialKeysSchema.parse(keyParams),
      });
    } catch (error: unknown) {
      let message = "";
      if (error instanceof Error) {
        message = error.message;
      }
      showToast(message, "error");
    } finally {
      setLoading(false);
    }
  });

  const onCancel = () => {
    deleteMutation.mutate({ id: credentialId });
  };

  const hitpayIcon = <img className="h-5 w-5" src="/app-store/hitpay/icon.svg" alt="HitPay Icon" />;

  if (session.status === "loading") return <></>;

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
        <AppNotInstalledMessage appName="hitpay" />
      </div>
    );
  }

  return (
    <SetupShell
      logo={<img className="h-12 w-12" src="/app-store/hitpay/icon.svg" alt="HitPay Icon" />}
      name="HitPay"
      description={t("hitpay_connect_description")}>
      <form className="w-full stack-y-4" onSubmit={onSubmit}>
        <div className="flex items-center justify-end">
          <Switch
            onCheckedChange={(value) => SetIsSandbox(value as boolean)}
            checked={isSandbox}
            label={t("sandbox")}
          />
        </div>
        <div className="w-full">
          <KeyField
            {...register("apiKey", {
              required: true,
            })}
            id="apiKey"
            name="apiKey"
            containerClassName="w-full"
            label={t("api_key")}
            autoComplete="off"
            autoCorrect="off"
            defaultValue={keyData?.apiKey || ""}
          />

          {errors.apiKey && (
            <p data-testid="required" className="py-2 text-error text-xs" role="alert">
              {errors.apiKey?.message}
            </p>
          )}
        </div>
        <div className="w-full">
          <KeyField
            {...register("saltKey", {
              required: true,
            })}
            id="saltKey"
            name="saltKey"
            containerClassName="w-full"
            label={t("salt")}
            autoComplete="off"
            autoCorrect="off"
            defaultValue={keyData?.saltKey || ""}
          />

          {errors.saltKey && (
            <p data-testid="required" className="text-error py-2 text-xs" role="alert">
              {errors.saltKey?.message}
            </p>
          )}
        </div>
        {!props.prod && !props.sandbox ? (
          <div className="flex justify-end gap-2">
            <Button color="secondary" className="h-10" onClick={onCancel}>
              {t("cancel")}
            </Button>
            <Button className="h-10 justify-center gap-2" type="submit" loading={loading} disabled={loading}>
              {hitpayIcon}
              <span className="mr-2">{t("connect_with_provider", { provider: "HitPay" })}</span>
            </Button>
          </div>
        ) : (
          <div className="flex justify-end gap-2">
            <Button color="secondary" href="/apps/hitpay">
              {t("go_to_app_store")}
            </Button>
            <Button color="primary" type="submit" disabled={!updatable}>
              {t("update")}
            </Button>
          </div>
        )}
      </form>
    </SetupShell>
  );
}
