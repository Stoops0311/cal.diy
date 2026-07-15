import { useLocale } from "@calcom/lib/hooks/useLocale";
import type { ApiErrorResponse } from "@calcom/platform-types";
import { Button } from "@calcom/ui/components/button";
import { useState } from "react";
import { AtomsWrapper } from "../../src/components/atoms-wrapper";
import { type ActionButtonsClassNames, CreateScheduleForm } from "../CreateScheduleForm";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export const CreateSchedulePlatformWrapper = ({
  name,
  customClassNames,
  onSuccess,
  onError,
  disableToasts = false,
}: {
  name?: string;
  onSuccess?: (scheduleId: number) => void;
  onError?: (err: ApiErrorResponse) => void;
  customClassNames?: {
    createScheduleButton?: string;
    inputField?: string;
    formWrapper?: string;
    actionsButtons?: ActionButtonsClassNames;
  };
  disableToasts?: boolean;
}) => {
  const { t } = useLocale();
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  return (
    <AtomsWrapper>
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogTrigger asChild>
          <Button
            type="button"
            data-testid={name}
            className={customClassNames?.createScheduleButton}
            StartIcon="plus"
            onClick={() => setIsDialogOpen(true)}>
            {name ?? t("new")}
          </Button>
        </DialogTrigger>
        <DialogContent className="bg-subtle text-default overflow-hidden rounded-2xl border p-0 shadow-2xl">
          <DialogHeader className="border-subtle border-b p-6 text-left">
            <DialogTitle className="font-cal text-2xl tracking-tight">
              {t("new_schedule_heading")}
            </DialogTitle>
            <DialogDescription className="text-subtle text-sm">
              {t("new_schedule_description")}
            </DialogDescription>
          </DialogHeader>
          <div className="bg-default p-6">
            <CreateScheduleForm
              customClassNames={{
                formWrapper: customClassNames?.formWrapper,
                inputField: customClassNames?.inputField,
                actionsButtons: {
                  container: customClassNames?.actionsButtons?.container,
                  continue: customClassNames?.actionsButtons?.continue,
                  close: customClassNames?.actionsButtons?.close,
                },
              }}
              onSuccess={(scheduleId) => {
                setIsDialogOpen(false);
                onSuccess?.(scheduleId);
              }}
              onError={onError}
              onCancel={() => setIsDialogOpen(false)}
              disableToasts={disableToasts}
            />
          </div>
        </DialogContent>
      </Dialog>
    </AtomsWrapper>
  );
};
