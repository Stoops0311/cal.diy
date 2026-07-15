import { useLocale } from "@calcom/lib/hooks/useLocale";

const UnAvailableMessage = ({
  children,
  title,
  testId,
}: {
  children: React.ReactNode;
  title: string;
  testId?: string;
}) => {
  const { t } = useLocale();

  return (
    <div className="mx-auto w-full max-w-2xl" data-testid={testId}>
      <div className="overflow-hidden rounded-3xl border border-subtle bg-subtle p-8 shadow-xl sm:p-10">
        <p className="font-mono text-[10px] text-subtle uppercase tracking-[0.18em]">{t("availability")}</p>
        <h1 className="mt-3 mb-4 font-cal text-3xl text-emphasis">{title}</h1>
        {children}
      </div>
    </div>
  );
};

export const Away = () => {
  const { t } = useLocale();

  return (
    <UnAvailableMessage title={`😴 ${t("user_away")}`}>
      <p className="max-w-[50ch]">{t("user_away_description")}</p>
    </UnAvailableMessage>
  );
};

export const NotFound = () => {
  const { t } = useLocale();

  return (
    <UnAvailableMessage title={t("404_page_not_found")}>
      <p className="max-w-[50ch]">{t("booker_event_not_found")}</p>
    </UnAvailableMessage>
  );
};

export const PlanInactive = () => {
  const { t } = useLocale();

  return (
    <UnAvailableMessage title={t("team_booking_plan_inactive_title")} testId="team-plan-inactive">
      <p className="max-w-[50ch]">{t("team_booking_plan_inactive_description")}</p>
    </UnAvailableMessage>
  );
};
