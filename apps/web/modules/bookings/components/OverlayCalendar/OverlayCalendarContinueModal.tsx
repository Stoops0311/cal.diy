import { Dialog } from "@calcom/features/components/controlled-dialog";
import { APP_NAME } from "@calcom/lib/constants";
import { useLocale } from "@calcom/lib/hooks/useLocale";
import { Button } from "@calcom/ui/components/button";
import { DialogContent } from "@calcom/ui/components/dialog";

interface IOverlayCalendarContinueModalProps {
  open?: boolean;
  onClose?: (state: boolean) => void;
  onContinue: () => void;
}

export function OverlayCalendarContinueModal(props: IOverlayCalendarContinueModalProps) {
  const { t } = useLocale();
  return (
    <Dialog open={props.open} onOpenChange={props.onClose}>
      <DialogContent
        type="creation"
        title={t("overlay_my_calendar")}
        description={t("overlay_my_calendar_toc")}>
        <div className="border-subtle bg-default mt-5 rounded-xl border p-2 shadow-sm">
          <Button
            data-testid="overlay-calendar-continue-button"
            onClick={() => {
              props.onContinue();
            }}
            className="w-full items-center justify-center font-semibold"
            StartIcon="calendar-search">
            {t("continue_with", { appName: APP_NAME })}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
