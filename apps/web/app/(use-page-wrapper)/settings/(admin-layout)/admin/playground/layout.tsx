"use client";

import { useLocale } from "@calcom/lib/hooks/useLocale";
import { Button } from "@calcom/ui/components/button";
import { usePathname } from "next/navigation";

export default function PlaygroundLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { t } = useLocale();

  const isPlaygroundRoot = pathname === "/settings/admin/playground";

  return isPlaygroundRoot ? (
    children
  ) : (
    <div>
      <Button color="minimal" href="/settings/admin/playground" StartIcon="arrow-left">
        {t("playground")}
      </Button>
      <div className="h-8" />
      <div>{children}</div>
    </div>
  );
}
