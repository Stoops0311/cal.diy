import { useLocale } from "@calcom/lib/hooks/useLocale";
import { UserCalendarSwitch } from "@calcom/web/modules/calendars/components/CalendarSwitch";

interface IConnectedCalendarItem {
  name: string;
  logo: string;
  externalId?: string;
  integrationType: string;
  calendars?: {
    primary: boolean | null;
    isSelected: boolean;
    credentialId: number;
    name?: string | undefined;
    readOnly?: boolean | undefined;
    userId?: number | undefined;
    integration?: string | undefined;
    externalId: string;
    delegationCredentialId: string | null;
  }[];
}

const ConnectedCalendarItem = (prop: IConnectedCalendarItem): JSX.Element => {
  const { t } = useLocale();
  const { name, logo, externalId, calendars, integrationType } = prop;

  return (
    <>
      <div className="flex flex-row items-center p-4">
        <img src={logo} alt={name} className="m-1 h-8 w-8" />
        <div className="mx-4">
          <p className="font-bold font-sans text-sm leading-5">{name}</p>
          <div className="fle-row flex">
            <span
              title={externalId}
              className="mt-1 max-w-44 overflow-hidden text-ellipsis whitespace-nowrap font-sans text-sm text-subtle">
              {externalId}{" "}
            </span>
          </div>
        </div>
      </div>
      <div className="h-px w-full border-subtle border-b" />
      <div>
        <ul className="p-4">
          {calendars?.map((calendar, i) => (
            <UserCalendarSwitch
              credentialId={calendar.credentialId}
              key={calendar.externalId}
              externalId={calendar.externalId}
              title={calendar.name || t("nameless_calendar")}
              name={calendar.name || t("nameless_calendar")}
              type={integrationType}
              isChecked={calendar.isSelected}
              isLastItemInList={i === calendars.length - 1}
              delegationCredentialId={calendar.delegationCredentialId}
            />
          ))}
        </ul>
      </div>
    </>
  );
};

export { ConnectedCalendarItem };
