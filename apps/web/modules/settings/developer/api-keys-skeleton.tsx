"use client";

import SettingsHeader from "@calcom/features/settings/appDir/SettingsHeader";
import { useLocale } from "@calcom/lib/hooks/useLocale";
import { SkeletonContainer, SkeletonText } from "@calcom/ui/components/skeleton";

export const SkeletonLoader = () => {
  const { t } = useLocale();

  return (
    <SettingsHeader
      eyebrow={t("developer")}
      title={t("api_keys")}
      description={t("api_keys_description")}
      borderInShellHeader={true}>
      <SkeletonContainer>
        <div className="divide-subtle stack-y-6 py-4">
          <SkeletonText className="h-8 w-full" />
          <SkeletonText className="h-8 w-full" />
        </div>
      </SkeletonContainer>
    </SettingsHeader>
  );
};
