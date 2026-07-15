"use client";

import { SUPPORT_MAIL_ADDRESS } from "@calcom/lib/constants";
import { useLocale } from "@calcom/lib/hooks/useLocale";
import { Button } from "@calcom/ui/components/button";
import AuthShell from "../auth/components/AuthShell";

export default function MaintenancePage() {
  const { t } = useLocale();
  return (
    <AuthShell>
      <p className="text-subtle font-mono text-[11px] uppercase tracking-[0.22em]">{t("system_status")}</p>
      <div className="border-subtle bg-subtle mt-5 rounded-2xl border p-6 shadow-sm">
        <h1 className="font-cal text-emphasis text-3xl leading-none text-balance">
          {t("under_maintenance")}
        </h1>
        <p className="text-default mt-4 text-sm leading-relaxed">{t("maintenance_message")}</p>
        <div className="border-muted bg-default -mx-6 -mb-6 mt-6 rounded-b-2xl border-t px-6 py-5">
          <Button href={`mailto:${SUPPORT_MAIL_ADDRESS}`}>{t("contact_support")}</Button>
        </div>
      </div>
    </AuthShell>
  );
}
