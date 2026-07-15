import type { DialogProps as ControlledDialogProps } from "@calcom/features/components/controlled-dialog";
import { Dialog } from "@calcom/features/components/controlled-dialog";
import { useLocale } from "@calcom/lib/hooks/useLocale";
import { Button } from "@calcom/ui/components/button";
import { DialogClose, DialogContent, DialogFooter } from "@calcom/ui/components/dialog";

export function AccountDialog(
  props: ControlledDialogProps & {
    handleSubmit: () => void;
  }
) {
  const { t } = useLocale();
  return (
    <Dialog name="Account check" open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent
        type="creation"
        title={t("ms_teams_work_account_required")}
        description={t("ms_teams_personal_account_error")}>
        <DialogFooter showDivider className="mt-6">
          <>
            <DialogClose
              type="button"
              color="secondary"
              onClick={() => {
                props.onOpenChange?.(false);
              }}>
              {t("cancel")}
            </DialogClose>

            <Button type="button" onClick={props.handleSubmit}>
              {t("continue")}
            </Button>
          </>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default AccountDialog;
