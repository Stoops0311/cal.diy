import { useLocale } from "@calcom/lib/hooks/useLocale";
import { SkeletonText } from "@calcom/ui/components/skeleton";
import Image from "next/image";
import Link from "next/link";

export function AppStoreCategories({
  categories,
}: {
  categories: {
    name: string;
    count: number;
  }[];
}) {
  const { t, isLocaleReady } = useLocale();
  return (
    <section>
      <h2 className="text-emphasis pb-3 text-base font-semibold leading-none">
        {isLocaleReady ? t("featured_categories") : <SkeletonText className="h-4 w-40" />}
      </h2>
      <ul className="flex snap-x gap-3 overflow-x-auto pb-2">
        {categories.map((category) => (
          <li key={category.name} className="w-44 shrink-0 snap-start">
            <Link
              href={`/apps/categories/${category.name}`}
              data-testid={`app-store-category-${category.name}`}
              className="border-subtle hover:bg-muted focus-visible:ring-emphasis block h-full rounded-lg border px-5 py-4 transition-colors focus-visible:outline-none focus-visible:ring-2">
              <Image
                src={`/app-categories/${category.name}.svg`}
                width={80}
                height={80}
                alt={t("category_icon", { category: category.name })}
                className="dark:invert"
              />
              {isLocaleReady ? (
                <h3 className="font-cal text-emphasis mt-2 text-base capitalize">{category.name}</h3>
              ) : (
                <SkeletonText invisible />
              )}
              <p className="text-subtle mt-1 font-mono text-[11px] uppercase tracking-[0.18em]">
                {isLocaleReady ? t("number_apps", { count: category.count }) : <SkeletonText invisible />}
              </p>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
