import classNames from "@calcom/ui/classNames";
import type { VariantProps } from "class-variance-authority";
import { cva } from "class-variance-authority";

const progressBarStyles = cva("h-2 rounded-full", {
  variants: {
    color: {
      green: "bg-semantic-success-emphasis",
      blue: "bg-semantic-info-emphasis",
      red: "bg-semantic-error-emphasis",
      yellow: "bg-semantic-attention-emphasis",
      gray: "bg-inverted",
    },
  },
  defaultVariants: {
    color: "gray",
  },
});

export interface ProgressBarProps extends VariantProps<typeof progressBarStyles> {
  percentageValue: number;
  label?: string;
  className?: string;
}

export function ProgressBar({ color, percentageValue, label, className }: ProgressBarProps) {
  const clampedPercentage = Math.min(100, Math.max(0, percentageValue));

  return (
    <div className={classNames("flex w-full items-center gap-3", className)}>
      <div className="bg-subtle h-2 flex-1 rounded-full">
        <div className={progressBarStyles({ color })} style={{ width: `${clampedPercentage}%` }} />
      </div>
      {label && <span className="text-default text-sm font-medium">{label}</span>}
    </div>
  );
}
