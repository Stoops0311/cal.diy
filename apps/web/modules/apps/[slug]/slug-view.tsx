"use client";

import { IS_PRODUCTION } from "@calcom/lib/constants";
import { useLocale } from "@calcom/lib/hooks/useLocale";
import { markdownToSafeHTML } from "@calcom/lib/markdownToSafeHTML";
import { Button } from "@calcom/ui/components/button";
import { EmptyScreen } from "@calcom/ui/components/empty-screen";
import { showToast } from "@calcom/ui/components/toast";
import { normalizeAppBrandText } from "@calcom/web/modules/apps/lib/normalizeAppBrandText";
import App from "@components/apps/App";
import type { AppDataProps } from "@lib/apps/[slug]/getStaticProps";
import useRouterQuery from "@lib/hooks/useRouterQuery";

function SingleAppPage(props: AppDataProps) {
  const { error, setQuery: setError } = useRouterQuery("error");
  const { t } = useLocale();
  if (error === "account_already_linked" || error === "no_default_calendar") {
    showToast(t(error), "error", { id: error });
    setError(undefined);
  }
  // If it's not production environment, it would be a better idea to inform that the App is disabled.
  if (props.isAppDisabled) {
    if (!IS_PRODUCTION) {
      return (
        <EmptyScreen
          Icon="circle-alert"
          headline={t("app_is_disabled", { appName: normalizeAppBrandText(props.data.name) })}
          description={t("app_disabled_admin_description")}
          buttonRaw={
            <Button color="secondary" href="/settings/admin/apps">
              {t("go_to_admin")}
            </Button>
          }
        />
      );
    }

    // Disabled App should give 404 any ways in production.
    return null;
  }

  const { source, data } = props;
  return (
    <App
      name={normalizeAppBrandText(data.name)}
      description={normalizeAppBrandText(data.description)}
      isGlobal={data.isGlobal}
      slug={data.slug}
      variant={data.variant}
      type={data.type}
      logo={data.logo}
      categories={data.categories ?? [data.category]}
      author={normalizeAppBrandText(data.publisher)}
      feeType={data.feeType || "usage-based"}
      price={data.price || 0}
      commission={data.commission || 0}
      docs={data.docsUrl}
      website={data.url}
      email={normalizeAppBrandText(data.email)}
      licenseRequired={data.licenseRequired}
      descriptionItems={(source.data?.items as string[] | undefined)?.map(normalizeAppBrandText)}
      isTemplate={data.isTemplate}
      dependencies={data.dependencies}
      concurrentMeetings={data.concurrentMeetings}
      paid={data.paid}
      //   tos="https://zoom.us/terms"
      //   privacy="https://zoom.us/privacy"
      body={
        <>
          {}
          {/* biome-ignore lint/security/noDangerouslySetInnerHtml: Content is sanitized via markdownToSafeHTML */}
          <div
            dangerouslySetInnerHTML={{ __html: markdownToSafeHTML(normalizeAppBrandText(source.content)) }}
          />
        </>
      }
    />
  );
}

export default SingleAppPage;
