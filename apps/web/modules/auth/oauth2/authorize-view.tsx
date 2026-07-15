"use client";

/* eslint-disable react-hooks/exhaustive-deps */
import { useCurrentSession as useSession } from "@calcom/features/auth/lib/useCurrentSession";
import { APP_NAME } from "@calcom/lib/constants";
import { useCompatSearchParams } from "@calcom/lib/hooks/useCompatSearchParams";
import { useLocale } from "@calcom/lib/hooks/useLocale";
import { trpc } from "@calcom/trpc/react";
import useMeQuery from "@calcom/trpc/react/hooks/useMeQuery";
import { Avatar } from "@calcom/ui/components/avatar";
import { Button } from "@calcom/ui/components/button";
import { Select } from "@calcom/ui/components/form";
import { Tooltip } from "@calcom/ui/components/tooltip";
import { CheckIcon, InfoIcon, PlusIcon } from "@coss/ui/icons";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

export function Authorize() {
  const { t } = useLocale();
  const { status } = useSession();
  const { data: user } = useMeQuery();

  const router = useRouter();
  const searchParams = useCompatSearchParams();

  const client_id = (searchParams?.get("client_id") as string) || "";
  const redirect_uri = searchParams?.get("redirect_uri") as string;
  const state = searchParams?.get("state") as string;
  const scope = searchParams?.get("scope") as string;
  const code_challenge = searchParams?.get("code_challenge") as string;
  const code_challenge_method = searchParams?.get("code_challenge_method") as string;
  const show_account_selector = searchParams?.get("show_account_selector") === "true";

  const queryString = searchParams?.toString();

  const [selectedAccount, setSelectedAccount] = useState<{
    value: string;
    label: string;
  } | null>();
  const scopes = scope ? scope.toString().split(",") : [];

  const {
    data: client,
    error: getClientError,
    isPending: isPendingGetClient,
  } = trpc.viewer.oAuth.getClientForAuthorization.useQuery(
    {
      clientId: client_id as string,
      redirectUri: redirect_uri,
    },
    {
      enabled: status === "authenticated" && !!redirect_uri,
    }
  );

  const { data, isPending: isPendingProfiles } =
    trpc.viewer.loggedInViewerRouter.teamsAndUserProfilesQuery.useQuery(undefined, {
      enabled: show_account_selector,
    });

  const generateAuthCodeMutation = trpc.viewer.oAuth.generateAuthCode.useMutation({
    onSuccess: (data) => {
      window.location.href =
        data.redirectUrl ?? `${client?.redirectUri}?code=${data.authorizationCode}&state=${state}`;
    },
    onError: (error) => {
      if (client?.redirectUri) {
        redirectToOAuthError({
          redirectUri: client.redirectUri,
          trpcError: error,
          state,
        });
      }
    },
  });

  const mappedProfiles = data
    ? data
        .filter((profile) => !profile.readOnly)
        .map((profile) => ({
          label: profile.name || profile.slug || "",
          value: profile.slug || "",
        }))
    : [];

  useEffect(() => {
    if (show_account_selector && mappedProfiles.length > 0) {
      setSelectedAccount(mappedProfiles[0]);
    }
  }, [isPendingProfiles, show_account_selector]);

  // Auto-authorize trusted clients
  useEffect(() => {
    if (client?.isTrusted) {
      generateAuthCodeMutation.mutate({
        clientId: client_id as string,
        redirectUri: client.redirectUri,
        scopes,
        codeChallenge: code_challenge || undefined,
        codeChallengeMethod: (code_challenge_method as "S256") || undefined,
        state,
      });
    }
  }, [client?.isTrusted]);

  useEffect(() => {
    if (status === "unauthenticated") {
      const urlSearchParams = new URLSearchParams({
        callbackUrl: `auth/oauth2/authorize?${queryString}`,
      });
      // Pass register param directly so login page can hide "Don't have an account" link
      const registerParam = searchParams?.get("register");
      if (registerParam) {
        urlSearchParams.set("register", registerParam);
      }
      router.replace(`/auth/login?${urlSearchParams.toString()}`);
    }
  }, [status]);

  if (getClientError) {
    return (
      <AuthorizationState title={t("authorization_failed", { error: getClientError.message })} role="alert" />
    );
  }

  if (isPendingGetClient || (show_account_selector && isPendingProfiles) || status !== "authenticated") {
    return <AuthorizationState title={t("authorizing")} role="status" />;
  }

  if (!client) {
    return <AuthorizationState title={t("unauthorized")} role="alert" />;
  }

  // Don't show UI for trusted clients, they'll auto-authorize
  if (client.isTrusted) {
    return <AuthorizationState title={t("authorizing")} role="status" />;
  }

  return (
    <main className="flex min-h-screen items-center bg-muted px-4 py-10 sm:px-6">
      <div className="mx-auto grid w-full max-w-5xl overflow-hidden rounded-3xl border border-subtle shadow-xl lg:grid-cols-[0.86fr_1.14fr]">
        <section className="flex flex-col justify-between bg-inverted p-8 text-inverted sm:p-10">
          <p className="font-mono text-[11px] text-inverted/55 uppercase tracking-[0.22em]">
            {t("connection_request")}
          </p>
          <div className="py-14 lg:py-0">
            <div className="flex items-center">
              <Avatar
                alt={t("client_logo", { clientName: client.name })}
                fallback={<PlusIcon className="h-6 w-6 text-subtle" aria-hidden="true" />}
                className="ring-4 ring-inverted"
                imageSrc={client.logo}
                size="lg"
              />
              <div className="h-px w-10 bg-inverted/25" aria-hidden="true" />
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-default ring-4 ring-inverted">
                <img
                  src="/convenio-mark-black.svg"
                  alt={t("app_logo", { appName: APP_NAME })}
                  className="h-8 w-8"
                />
              </div>
            </div>
            <h1 className="mt-8 max-w-sm font-cal text-4xl leading-none">
              {t("access_cal_account", {
                clientName: client.name,
                appName: APP_NAME,
              })}
            </h1>
          </div>
          <span className="font-mono text-[10px] text-inverted/45 uppercase tracking-[0.2em]">
            {APP_NAME}
          </span>
        </section>

        <section className="bg-subtle p-8 sm:p-10">
          {!show_account_selector ? (
            <div className="flex items-center gap-2 text-default text-sm" data-testid="signed-in-user">
              <Avatar
                size="sm"
                alt={user?.username ? t("avatar_of_username", { username: user.username }) : t("avatar")}
                imageSrc={user?.avatarUrl ?? user?.avatar}
              />
              <Tooltip content={user?.email} side="bottom">
                <span className="cursor-default">
                  {t("signed_in_as", { name: user?.name || user?.email })}
                </span>
              </Tooltip>
            </div>
          ) : null}
          {show_account_selector ? (
            <div>
              <label className="mb-1.5 block font-medium text-emphasis text-sm" htmlFor="account-select">
                {t("select_account_team")}
              </label>
              <Select
                isSearchable={true}
                id="account-select"
                onChange={(value) => {
                  setSelectedAccount(value);
                }}
                className="w-full"
                defaultValue={selectedAccount || mappedProfiles[0]}
                options={mappedProfiles}
              />
            </div>
          ) : null}

          <div className="mt-8">
            <p className="font-mono text-[10px] text-subtle uppercase tracking-[0.18em]">
              {t("permissions")}
            </p>
            <h2 className="mt-2 font-cal text-2xl text-emphasis">
              {t("allow_client_to", { clientName: client.name })}
            </h2>
          </div>
          <ul className="mt-6 space-y-3 text-default text-sm">
            {[
              t("associate_with_cal_account", { clientName: client.name }),
              t("see_personal_info"),
              t("see_primary_email_address"),
              t("access_event_type"),
              t("access_availability"),
              t("access_bookings"),
            ].map((permission) => (
              <li className="flex items-start gap-3" key={permission}>
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emphasis">
                  <CheckIcon className="h-3 w-3 text-inverted" aria-hidden="true" />
                </span>
                <span>{permission}</span>
              </li>
            ))}
          </ul>
          <div className="mt-8 flex rounded-2xl border border-subtle bg-default p-4">
            <InfoIcon className="mt-0.5 h-4 w-4 shrink-0 text-subtle" aria-hidden="true" />
            <div className="ml-3">
              <p className="mb-1 font-medium text-emphasis text-sm">
                {t("allow_client_to_do", { clientName: client.name })}
              </p>
              <p className="text-subtle text-sm leading-relaxed">
                {t("oauth_access_information", { appName: APP_NAME })}
              </p>
            </div>
          </div>

          <div className="mt-8 flex justify-end gap-2 border-subtle border-t pt-6">
            <Button
              color="secondary"
              onClick={() => {
                const separator = client.redirectUri.includes("?") ? "&" : "?";
                const params = new URLSearchParams();
                params.set("error", "access_denied");
                if (state) params.set("state", state);
                window.location.href = `${client.redirectUri}${separator}${params.toString()}`;
              }}>
              {t("go_back")}
            </Button>
            <Button
              loading={generateAuthCodeMutation.isPending}
              disabled={generateAuthCodeMutation.isPending}
              onClick={() => {
                generateAuthCodeMutation.mutate({
                  clientId: client_id as string,
                  scopes,
                  redirectUri: client.redirectUri,
                  teamSlug: selectedAccount?.value.startsWith("team/")
                    ? selectedAccount.value.substring(5)
                    : undefined,
                  codeChallenge: code_challenge || undefined,
                  codeChallengeMethod: (code_challenge_method as "S256") || undefined,
                  state,
                });
              }}
              data-testid="allow-button">
              {t("allow")}
            </Button>
          </div>
        </section>
      </div>
    </main>
  );
}

function AuthorizationState({ title, role }: { title: string; role: "alert" | "status" }) {
  return (
    <main className="flex min-h-screen items-center bg-muted px-4 py-10">
      <div className="mx-auto grid w-full max-w-3xl overflow-hidden rounded-3xl border border-subtle shadow-xl sm:grid-cols-[0.78fr_1.22fr]">
        <div className="flex items-center justify-center bg-inverted p-10">
          <img src="/convenio-mark-white.svg" alt="" className="h-14 w-14" aria-hidden="true" />
        </div>
        <div className="flex min-h-64 items-center bg-subtle p-10" role={role}>
          <p className="font-cal text-3xl text-emphasis">{title}</p>
        </div>
      </div>
    </main>
  );
}

function mapTrpcCodeToOAuthError(code: string | undefined) {
  if (code === "BAD_REQUEST") return "invalid_request";
  if (code === "UNAUTHORIZED") return "unauthorized_client";
  return "server_error";
}

function buildOAuthErrorRedirectUrl({
  redirectUri,
  error,
  errorDescription,
  state,
}: {
  redirectUri: string;
  error: string;
  errorDescription?: string;
  state?: string;
}) {
  const errorParams = new URLSearchParams({
    error,
  });

  if (errorDescription) {
    errorParams.append("error_description", errorDescription);
  }

  if (state) {
    errorParams.append("state", state);
  }

  return `${redirectUri}${redirectUri.includes("?") ? "&" : "?"}${errorParams.toString()}`;
}

function redirectToOAuthError({
  redirectUri,
  trpcError,
  state,
}: {
  redirectUri: string;
  trpcError: { data?: { code?: string } | null; message: string };
  state?: string;
}) {
  const redirectUrl = buildOAuthErrorRedirectUrl({
    redirectUri,
    error: mapTrpcCodeToOAuthError(trpcError.data?.code),
    errorDescription: trpcError.message,
    state,
  });

  window.location.href = redirectUrl;
}

export default Authorize;
