import { useLocale } from "@calcom/lib/hooks/useLocale";
import type { AppFrontendPayload as App } from "@calcom/types/App";
import { AppCard } from "./AppCard";

export const PopularAppsSlider = <T extends App>({ items }: { items: T[] }) => {
  const { t } = useLocale();
  const popularApps = [...items].sort((a, b) => (b.installCount || 0) - (a.installCount || 0)).slice(0, 5);

  return (
    <section>
      <h2 className="text-emphasis pb-3 text-base font-semibold leading-none">{t("most_popular")}</h2>
      <div className="border-subtle divide-subtle divide-y border-b border-t">
        {popularApps.map((app) => (
          <AppCard key={app.name} app={app} />
        ))}
      </div>
    </section>
  );
};
