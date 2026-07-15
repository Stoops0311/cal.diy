import { useLocale } from "@calcom/lib/hooks/useLocale";
import { Avatar } from "@calcom/ui/components/avatar";
import { Button } from "@calcom/ui/components/button";
import { EmptyScreen } from "@calcom/ui/components/empty-screen";
import { Label, Select } from "@calcom/ui/components/form";
import { useAutoAnimate } from "@formkit/auto-animate/react";
import type { Props } from "react-select";

export type CheckedUserSelectOption = {
  avatar: string;
  label: string;
  value: string;
  disabled?: boolean;
};

export const CheckedUserSelect = ({
  options = [],
  value = [],
  ...props
}: Omit<Props<CheckedUserSelectOption, true>, "value" | "onChange"> & {
  value?: readonly CheckedUserSelectOption[];
  onChange: (value: readonly CheckedUserSelectOption[]) => void;
}) => {
  const { t } = useLocale();

  const [animationRef] = useAutoAnimate<HTMLUListElement>();

  return (
    <>
      <Select
        name={props.name}
        placeholder={props.placeholder || t("select")}
        isSearchable={false}
        options={options}
        value={value}
        isMulti
        {...props}
      />
      {value.length > 0 ? (
        <div className="mt-6">
          <Label>{t("assigned_to")}</Label>
          <div className="flex overflow-hidden rounded-2xl border border-subtle bg-default">
            <ul
              className="w-full divide-y divide-subtle"
              data-testid="managed-event-types"
              ref={animationRef}>
              {value.map((option) => {
                return (
                  <li key={option.value} className="flex items-center px-3 py-2.5">
                    <Avatar size="sm" imageSrc={option.avatar} alt={option.label} />
                    <p className="ml-3 text-emphasis text-sm">{option.label}</p>
                    <Button
                      type="button"
                      variant="icon"
                      color="minimal"
                      StartIcon="x"
                      tooltip={t("remove_member_name", { name: option.label })}
                      onClick={() => props.onChange(value.filter((item) => item.value !== option.value))}
                      className="ml-auto"
                    />
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      ) : (
        <div className="mt-6">
          <EmptyScreen
            Icon="user-plus"
            headline={t("no_assigned_members")}
            description={t("start_assigning_members_above")}
          />
        </div>
      )}
    </>
  );
};

export default CheckedUserSelect;
