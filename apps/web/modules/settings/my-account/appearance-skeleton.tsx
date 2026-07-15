"use client";

import SettingsHeader from "@calcom/features/settings/appDir/SettingsHeader";
import SectionBottomActions from "@calcom/features/settings/SectionBottomActions";
import { useLocale } from "@calcom/lib/hooks/useLocale";
import { SkeletonButton, SkeletonContainer, SkeletonText } from "@calcom/ui/components/skeleton";

export const SkeletonLoader = () => {
  const { t } = useLocale();
  return (
    <SettingsHeader
      eyebrow={t("my_account")}
      title={t("appearance")}
      description={t("appearance_description")}>
      <SkeletonContainer>
        <div className="flex items-center text-sm">
          <SkeletonText className="h-8 w-1/3" />
        </div>
        <div className="stack-y-6 py-6">
          <div className="[&>*]:bg-emphasis flex w-full items-center justify-center gap-x-2 *:animate-pulse">
            <div className="h-32 flex-1 rounded-md p-5" />
            <div className="h-32 flex-1 rounded-md p-5" />
            <div className="h-32 flex-1 rounded-md p-5" />
          </div>
          <div className="flex justify-between">
            <SkeletonText className="h-8 w-1/3" />
            <SkeletonText className="h-8 w-1/3" />
          </div>

          <SkeletonText className="h-8 w-full" />
        </div>
        <SectionBottomActions align="end">
          <SkeletonButton className="h-8 w-20 rounded-md p-5" />
        </SectionBottomActions>
      </SkeletonContainer>
    </SettingsHeader>
  );
};
