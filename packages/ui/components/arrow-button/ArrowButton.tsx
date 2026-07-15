import { useLocale } from "@calcom/lib/hooks/useLocale";
import { ArrowDownIcon, ArrowUpIcon } from "@coss/ui/icons";

export type ArrowButtonProps = {
  arrowDirection: "up" | "down";
  onClick: () => void;
};

export function ArrowButton(props: ArrowButtonProps) {
  const { t } = useLocale();

  return (
    <>
      {props.arrowDirection === "up" ? (
        <button
          type="button"
          aria-label={t("move_up")}
          className="bg-default text-muted hover:text-emphasis border-default hover:border-emphasis absolute left-0 -ml-4 -mt-4 mb-4 hidden h-6 w-6 scale-0 items-center justify-center rounded-md border p-1 opacity-0 transition-transform after:absolute after:-inset-2.5 after:content-[''] group-hover:scale-100 group-hover:opacity-100 focus-visible:scale-100 focus-visible:opacity-100 sm:ml-0 sm:flex lg:left-3"
          onClick={props.onClick}>
          <ArrowUpIcon aria-hidden="true" className="h-5 w-5" />
        </button>
      ) : (
        <button
          type="button"
          aria-label={t("move_down")}
          className="bg-default text-muted border-default hover:text-emphasis hover:border-emphasis absolute left-0 -ml-4 mt-8 hidden h-6 w-6 scale-0 items-center justify-center rounded-md border p-1 opacity-0 transition-transform after:absolute after:-inset-2.5 after:content-[''] group-hover:scale-100 group-hover:opacity-100 focus-visible:scale-100 focus-visible:opacity-100 sm:ml-0 sm:flex lg:left-3"
          onClick={props.onClick}>
          <ArrowDownIcon aria-hidden="true" className="h-5 w-5" />
        </button>
      )}
    </>
  );
}
