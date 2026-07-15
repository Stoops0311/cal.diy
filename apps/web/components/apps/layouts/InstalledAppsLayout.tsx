"use client";

import AppCategoryNavigation from "@calcom/app-store/_components/AppCategoryNavigation";
import { useLocale } from "@calcom/lib/hooks/useLocale";
import type React from "react";
import type { ComponentProps } from "react";
import Shell from "~/shell/Shell";

export default function InstalledAppsLayout({
  children,
  ...rest
}: { children: React.ReactNode } & ComponentProps<typeof Shell>) {
  const { t } = useLocale();

  return (
    <Shell {...rest} title={t("installed_apps")} description={t("manage_your_connected_apps")}>
      <AppCategoryNavigation baseURL="/apps/installed" containerClassname="min-w-0 w-full">
        {children}
      </AppCategoryNavigation>
    </Shell>
  );
}
export const getLayout = (page: React.ReactElement) => <InstalledAppsLayout>{page}</InstalledAppsLayout>;
