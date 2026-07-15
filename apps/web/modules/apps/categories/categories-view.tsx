"use client";

import { useLocale } from "@calcom/lib/hooks/useLocale";
import type { inferSSRProps } from "@calcom/types/inferSSRProps";
import type { getServerSideProps } from "@lib/apps/categories/getServerSideProps";
import Link from "next/link";
import Shell from "~/shell/Shell";

export type PageProps = inferSSRProps<typeof getServerSideProps>;

export default function Apps({ categories }: PageProps) {
  const { t } = useLocale();

  return (
    <Shell
      isPublic
      backPath="/apps"
      title={t("app_store")}
      description={t("app_store_description")}
      eyebrow={t("integrations")}
      heading={t("featured_categories")}>
      <div className="mb-16 grid w-full grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {categories.map((category) => (
          <Link
            key={category.name}
            href={`/apps/categories/${category.name}`}
            data-testid={`app-store-category-${category.name}`}
            className="border-subtle hover:bg-muted focus-visible:ring-emphasis block rounded-lg border px-5 py-4 transition-colors focus-visible:outline-none focus-visible:ring-2">
            <h3 className="text-emphasis font-medium capitalize">{category.name}</h3>
            <p className="text-subtle mt-1 font-mono text-[11px] uppercase tracking-[0.18em]">
              {t("number_apps", { count: category.count })}
            </p>
          </Link>
        ))}
      </div>
    </Shell>
  );
}
