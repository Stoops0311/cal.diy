import { useLocale } from "@calcom/lib/hooks/useLocale";
import classNames from "@calcom/ui/classNames";

type StepWithNav = {
  maxSteps: number;
  currentStep: number;
  navigateToStep: (step: number) => void;
  disableNavigation?: false;
  stepLabel?: (currentStep: number, maxSteps: number) => string;
};

type StepWithoutNav = {
  maxSteps: number;
  currentStep: number;
  navigateToStep?: undefined;
  disableNavigation: true;
  stepLabel?: (currentStep: number, maxSteps: number) => string;
};

// Discriminative union on disableNavigation prop
type StepsProps = StepWithNav | StepWithoutNav;

const Steps = (props: StepsProps) => {
  const { maxSteps, currentStep, navigateToStep, disableNavigation = false, stepLabel } = props;
  const { t } = useLocale();
  const getStepLabel = (step: number) =>
    stepLabel?.(step, maxSteps) ?? t("step_of", { step, total: maxSteps });
  return (
    <div className="mt-6 stack-y-2">
      <p className="text-subtle text-xs font-medium">{getStepLabel(currentStep)}</p>
      <div data-testid="step-indicator-container" className="flex w-full space-x-2 rtl:space-x-reverse">
        {new Array(maxSteps).fill(0).map((_s, index) => {
          return index <= currentStep - 1 ? (
            <button
              type="button"
              key={`step-${index}`}
              onClick={() => navigateToStep?.(index)}
              disabled={disableNavigation || index >= currentStep - 1}
              aria-label={getStepLabel(index + 1)}
              className={classNames(
                "bg-inverted h-1 w-full rounded-[1px]",
                index < currentStep - 1 && !disableNavigation ? "cursor-pointer" : ""
              )}
              data-testid={`step-indicator-${index}`}
            />
          ) : (
            <div
              key={`step-${index}`}
              className="bg-emphasis h-1 w-full rounded-[1px] opacity-25"
              data-testid={`step-indicator-${index}`}
            />
          );
        })}
      </div>
    </div>
  );
};
export { Steps };
