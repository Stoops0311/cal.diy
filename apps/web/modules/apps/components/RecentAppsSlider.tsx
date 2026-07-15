import { useLocale } from "@calcom/lib/hooks/useLocale";
import type { AppFrontendPayload as App } from "@calcom/types/App";
import { AppCard } from "./AppCard";

export const RecentAppsSlider = <T extends App>({ items }: { items: T[] }) => {
  const { t } = useLocale();
  const recentApps = [...items]
    .sort((a, b) => new Date(b?.createdAt || 0).valueOf() - new Date(a?.createdAt || 0).valueOf())
    .slice(0, 5);

  return (
    <section>
      <h2 className="text-emphasis pb-3 text-base font-semibold leading-none">{t("recently_added")}</h2>
      <div className="border-subtle divide-subtle divide-y border-b border-t">
        {recentApps.map((app) => (
          <AppCard key={app.name} app={app} />
        ))}
      </div>
    </section>
  );
};
