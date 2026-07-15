import { useLocale } from "@calcom/lib/hooks/useLocale";
import { Icon } from "@calcom/ui/components/icon";
import { useRouter } from "next/navigation";
import type { Dispatch, SetStateAction } from "react";

const StepDone = (props: {
  currentStep: number;
  nextStepPath: string;
  setIsPending: Dispatch<SetStateAction<boolean>>;
}) => {
  const router = useRouter();
  const { t } = useLocale();

  return (
    <form
      id={`wizard-step-${props.currentStep}`}
      name={`wizard-step-${props.currentStep}`}
      className="flex justify-center stack-y-4"
      onSubmit={(e) => {
        props.setIsPending(true);
        e.preventDefault();
        router.replace(props.nextStepPath);
      }}>
      <div className="min-h-36 my-6 flex flex-col items-center justify-center">
        <div className="flex h-[72px] w-[72px] items-center justify-center rounded-full bg-inverted">
          <Icon name="check" className="inline-block h-10 w-10 text-inverted" />
        </div>
        <div className="max-w-[420px] text-center">
          <h2 className="mt-6 mb-1 font-cal text-2xl text-emphasis">{t("all_done")}</h2>
        </div>
      </div>
    </form>
  );
};

export default StepDone;
