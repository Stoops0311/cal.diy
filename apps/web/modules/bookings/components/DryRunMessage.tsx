import { useLocale } from "@calcom/lib/hooks/useLocale";
import { InfoIcon } from "@coss/ui/icons";
import { useState } from "react";

export const DryRunMessage = ({ isEmbed }: { isEmbed?: boolean }) => {
  const { t } = useLocale();
  const [isVisible, setIsVisible] = useState(true);

  if (!isVisible) return null;

  return (
    <button
      type="button"
      aria-label={t("dismiss_dry_run_notice")}
      onClick={() => setIsVisible(false)}
      className={`bg-semantic-attention-subtle border-semantic-attention-subtle fixed left-1/2 text-left ${
        !isEmbed ? "top-4" : "top-0"
      } z-50 -translate-x-1/2 transform cursor-pointer items-center gap-3 rounded-xl border p-3 text-sm shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emphasis`}>
      <div className="flex items-center gap-3">
        <div className="relative">
          <InfoIcon className="text-attention h-5 w-5" aria-hidden="true" />
        </div>
        <div className="text-emphasis font-medium" data-testid="dry-run-msg">
          {t("dry_run_mode_active")}
        </div>
      </div>
    </button>
  );
};
