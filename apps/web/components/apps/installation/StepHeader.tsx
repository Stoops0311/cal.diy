import { useLocale } from "@calcom/lib/hooks/useLocale";
import type { FC, ReactNode } from "react";

type StepHeaderProps = {
  children?: ReactNode;
  title: string;
  subtitle: string;
};
export const StepHeader: FC<StepHeaderProps> = ({ children, title, subtitle }) => {
  const { t } = useLocale();
  return (
    <div>
      <header>
        <p className="text-subtle font-mono text-[11px] uppercase tracking-[0.18em]">{t("install")}</p>
        <h1 className="font-cal mb-3 mt-1 text-[28px] font-bold leading-7 tracking-tight">{title}</h1>

        <p className="text-subtle font-sans text-sm font-normal">{subtitle}</p>
      </header>
      {children}
    </div>
  );
};
