"use client";

import { useLocale } from "@calcom/lib/hooks/useLocale";
import { SkeletonButton, SkeletonContainer, SkeletonText } from "@calcom/ui/components/skeleton";
import AppsLayout from "@components/apps/layouts/AppsLayout";

function AppRowSkeleton() {
  return (
    <div className="flex min-h-[72px] items-center gap-4 px-3 py-4">
      <div className="bg-emphasis h-10 w-10 shrink-0 rounded-sm" />
      <div className="min-w-0 flex-1">
        <SkeletonText className="h-4 w-32" />
        <SkeletonText className="mt-1 h-3 w-64 max-w-full" />
      </div>
      <SkeletonButton className="h-9 w-24 rounded-md" />
    </div>
  );
}

function AppRowListSkeleton({ rows }: { rows: number }) {
  return (
    <div>
      <SkeletonText className="h-4 w-40" />
      <div className="border-subtle divide-subtle mt-3 divide-y border-b border-t">
        {Array(rows)
          .fill(0)
          .map((_, i) => (
            <AppRowSkeleton key={i} />
          ))}
      </div>
    </div>
  );
}

export function AppHomePageSkeleton() {
  const { t } = useLocale();

  return (
    <AppsLayout
      isPublic
      eyebrow={t("integrations")}
      heading={t("app_store")}
      subtitle={t("app_store_description")}
      isAdmin={false}>
      <SkeletonContainer>
        <div className="flex flex-col gap-y-8">
          {/* Featured categories */}
          <div>
            <SkeletonText className="h-4 w-40" />
            <div className="mt-3 flex gap-3 overflow-hidden pb-2">
              {Array(5)
                .fill(0)
                .map((_, i) => (
                  <div
                    key={`category-${i}`}
                    className="border-subtle w-44 shrink-0 rounded-lg border px-5 py-4">
                    <div className="bg-emphasis h-20 w-20 rounded-sm" />
                    <SkeletonText className="mt-2 h-5 w-24" />
                    <SkeletonText className="mt-1 h-3 w-16" />
                  </div>
                ))}
            </div>
          </div>

          {/* Most popular */}
          <AppRowListSkeleton rows={5} />

          {/* Recently added */}
          <AppRowListSkeleton rows={5} />

          {/* All apps */}
          <AppRowListSkeleton rows={6} />
        </div>
      </SkeletonContainer>
    </AppsLayout>
  );
}
