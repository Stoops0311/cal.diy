"use client";

import { isRedirectApp } from "@calcom/app-store/_utils/redirectApps";
import useAddAppMutation from "@calcom/app-store/_utils/useAddAppMutation";
import { InstallAppButton } from "@calcom/app-store/InstallAppButton";
import { doesAppSupportTeamInstall, isConferencing } from "@calcom/app-store/utils";
import type { UserAdminTeams } from "@calcom/features/users/repositories/UserRepository";
import { AppOnboardingSteps } from "@calcom/lib/apps/appOnboardingSteps";
import { getAppOnboardingUrl } from "@calcom/lib/apps/getAppOnboardingUrl";
import { WEBAPP_URL } from "@calcom/lib/constants";
import { useLocale } from "@calcom/lib/hooks/useLocale";
import { markdownToSafeHTML } from "@calcom/lib/markdownToSafeHTML";
import type { AppFrontendPayload as App } from "@calcom/types/App";
import type { CredentialFrontendPayload as Credential } from "@calcom/types/Credential";
import classNames from "@calcom/ui/classNames";
import { Badge } from "@calcom/ui/components/badge";
import type { ButtonProps } from "@calcom/ui/components/button";
import { Button } from "@calcom/ui/components/button";
import { showToast } from "@calcom/ui/components/toast";
import { normalizeAppBrandText } from "@calcom/web/modules/apps/lib/normalizeAppBrandText";
import { useRouter } from "next/navigation";
import posthog from "posthog-js";
import { useEffect, useState } from "react";

interface AppCardProps {
  app: App;
  credentials?: Credential[];
  searchText?: string;
  userAdminTeams?: UserAdminTeams;
}

export function AppCard({ app, credentials, searchText, userAdminTeams }: AppCardProps) {
  const { t } = useLocale();
  const router = useRouter();
  const appName = normalizeAppBrandText(app.name);
  const allowedMultipleInstalls = app.categories && app.categories.indexOf("calendar") > -1;
  const appAdded = (credentials && credentials.length) || 0;
  const enabledOnTeams = doesAppSupportTeamInstall({
    appCategories: app.categories,
    concurrentMeetings: app.concurrentMeetings,
    isPaid: !!app.paid,
  });

  const appInstalled = enabledOnTeams && userAdminTeams ? userAdminTeams.length < appAdded : appAdded > 0;

  const mutation = useAddAppMutation(null, {
    onSuccess: (data) => {
      if (data?.setupPending) return;
      showToast(t("app_successfully_installed"), "success");
    },
    onError: (error) => {
      if (error instanceof Error) showToast(error.message || t("app_could_not_be_installed"), "error");
    },
  });

  const [searchTextIndex, setSearchTextIndex] = useState<number | undefined>(undefined);

  useEffect(() => {
    setSearchTextIndex(searchText ? appName.toLowerCase().indexOf(searchText.toLowerCase()) : undefined);
  }, [appName, searchText]);

  const handleAppInstall = () => {
    posthog.capture("app_install_button_clicked", {
      slug: app.slug,
      app_type: app.type,
      is_redirect: isRedirectApp(app.slug),
      is_conferencing: isConferencing(app.categories || []),
    });

    if (isRedirectApp(app.slug)) {
      // For redirect apps, open the external URL directly
      if (app.url) window.open(app.url, "_blank", "noopener,noreferrer");
      return;
    }
    if (isConferencing(app.categories) && !app.concurrentMeetings) {
      mutation.mutate({
        type: app.type,
        variant: app.variant,
        slug: app.slug,
        returnTo:
          WEBAPP_URL +
          getAppOnboardingUrl({
            slug: app.slug,
            step: AppOnboardingSteps.EVENT_TYPES_STEP,
          }),
      });
    } else if (
      !doesAppSupportTeamInstall({
        appCategories: app.categories,
        concurrentMeetings: app.concurrentMeetings,
        isPaid: !!app.paid,
      })
    ) {
      mutation.mutate({ type: app.type });
    } else {
      router.push(getAppOnboardingUrl({ slug: app.slug, step: AppOnboardingSteps.ACCOUNTS_STEP }));
    }
  };

  const categoryLabel = app.categories?.[0] ?? app.category;

  return (
    <div className="hover:bg-muted flex min-h-[72px] items-center gap-4 px-3 py-4 transition-colors">
      <img
        src={app.logo}
        alt={t("app_logo", { appName })}
        className={classNames(app.logo.includes("-dark") && "dark:invert", "h-10 w-10 shrink-0 rounded-sm")}
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-x-2">
          <h3 className="text-emphasis truncate text-sm font-medium">
            {searchTextIndex != undefined && searchText ? (
              <>
                {appName.substring(0, searchTextIndex)}
                <span className="bg-emphasis rounded-sm" data-testid="highlighted-text">
                  {appName.substring(searchTextIndex, searchTextIndex + searchText.length)}
                </span>
                {appName.substring(searchTextIndex + searchText.length)}
              </>
            ) : (
              appName
            )}
          </h3>
          {appAdded > 0 && !isRedirectApp(app.slug) ? (
            <Badge variant="green">{t("installed", { count: appAdded })}</Badge>
          ) : null}
          {app.isTemplate && (
            <span className="text-subtle shrink-0 font-mono text-[11px] uppercase tracking-[0.18em]">
              {t("template")}
            </span>
          )}
          {(app.isDefault || (!app.isDefault && app.isGlobal)) && (
            <span className="text-subtle shrink-0 font-mono text-[11px] uppercase tracking-[0.18em]">
              {t("default")}
            </span>
          )}
        </div>
        <p className="text-default truncate text-sm">
          {markdownToSafeHTML(normalizeAppBrandText(app.description)).replace(/<[^>]+>/g, "")}
        </p>
      </div>
      {categoryLabel && (
        <span className="text-muted hidden shrink-0 font-mono text-[11px] uppercase tracking-[0.18em] md:inline">
          {categoryLabel}
        </span>
      )}
      <div className="flex shrink-0 items-center gap-2">
        <Button
          color="secondary"
          href={`/apps/${app.slug}`}
          onClick={() => {
            posthog.capture("app_card_details_clicked", { slug: app.slug });
          }}
          data-testid={`app-store-app-card-${app.slug}`}>
          {t("details")}
        </Button>
        {app.isGlobal ||
        (credentials && credentials.length > 0 && allowedMultipleInstalls) ||
        (credentials && credentials.length > 0 && isRedirectApp(app.slug))
          ? !app.isGlobal && (
              <InstallAppButton
                type={app.type}
                disableInstall={!!app.dependencies && !app.dependencyData?.some((data) => !data.installed)}
                render={({ useDefaultComponent, ...props }) => {
                  if (useDefaultComponent) {
                    props = {
                      ...props,
                      onClick: () => {
                        handleAppInstall();
                      },
                      loading: mutation.isPending,
                    };
                  } else {
                    const originalOnClick = props.onClick;
                    props = {
                      ...props,
                      onClick: (e) => {
                        posthog.capture("app_install_button_clicked", {
                          slug: app.slug,
                          app_type: app.type,
                          is_redirect: isRedirectApp(app.slug),
                          is_conferencing: isConferencing(app.categories || []),
                        });
                        originalOnClick?.(e);
                      },
                    };
                  }
                  return (
                    <InstallAppButtonChild paid={app.paid} isRedirect={isRedirectApp(app.slug)} {...props} />
                  );
                }}
              />
            )
          : credentials &&
            !appInstalled && (
              <InstallAppButton
                type={app.type}
                disableInstall={!!app.dependencies && app.dependencyData?.some((data) => !data.installed)}
                render={({ useDefaultComponent, ...props }) => {
                  if (useDefaultComponent) {
                    props = {
                      ...props,
                      disabled: !!props.disabled,
                      onClick: () => {
                        handleAppInstall();
                      },
                      loading: mutation.isPending,
                    };
                  } else {
                    const originalOnClick = props.onClick;
                    props = {
                      ...props,
                      onClick: (e) => {
                        posthog.capture("app_install_button_clicked", {
                          slug: app.slug,
                          app_type: app.type,
                          is_redirect: isRedirectApp(app.slug),
                          is_conferencing: isConferencing(app.categories || []),
                        });
                        originalOnClick?.(e);
                      },
                    };
                  }
                  return (
                    <InstallAppButtonChild paid={app.paid} isRedirect={isRedirectApp(app.slug)} {...props} />
                  );
                }}
              />
            )}
      </div>
    </div>
  );
}

const InstallAppButtonChild = ({
  paid,
  isRedirect = false,
  ...props
}: {
  paid: App["paid"];
  isRedirect?: boolean;
} & ButtonProps) => {
  const { t } = useLocale();
  if (isRedirect) {
    return (
      <Button color="secondary" StartIcon="external-link" {...props} size="base">
        {t("visit")}
      </Button>
    );
  }
  // Paid apps don't support team installs at the moment
  // Also, cal.ai(the only paid app at the moment) doesn't support team install either
  if (paid) {
    return (
      <Button color="secondary" StartIcon="plus" data-testid="install-app-button" {...props}>
        {paid.trial ? t("start_paid_trial") : t("subscribe")}
      </Button>
    );
  }

  return (
    <Button
      color="secondary"
      className="[@media(max-width:260px)]:w-full [@media(max-width:260px)]:justify-center"
      StartIcon="plus"
      data-testid="install-app-button"
      {...props}
      size="base">
      {t("install")}
    </Button>
  );
};
