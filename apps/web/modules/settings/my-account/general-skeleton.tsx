"use client";

import SettingsHeader from "@calcom/features/settings/appDir/SettingsHeader";
import { useLocale } from "@calcom/lib/hooks/useLocale";
import { Skeleton } from "@coss/ui/components/skeleton";

export const SkeletonLoader = () => {
  const { t } = useLocale();
  return (
    <SettingsHeader
      eyebrow={t("my_account")}
      title={t("general")}
      description={t("general_description")}
      borderInShellHeader={true}>
      <div className="space-y-6">
        <div className="stack-y-6 py-8">
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-full" />
          <Skeleton className="ml-auto h-8 w-20 rounded-md p-5" />
        </div>
      </div>
    </SettingsHeader>
  );
};
