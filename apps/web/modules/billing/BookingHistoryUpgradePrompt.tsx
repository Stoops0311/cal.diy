"use client";

import { useLocale } from "@calcom/lib/hooks/useLocale";
import { Button } from "@calcom/ui/components/button";
import type React from "react";
import { useCallback, useEffect, useRef } from "react";
import { useUpgradePrompt } from "./UpgradePromptProvider";

export function BookingHistoryUpgradePrompt({ bookingUid }: { bookingUid: string }): React.ReactElement {
  const { t } = useLocale();
  const { openUpgradePrompt } = useUpgradePrompt();
  const opened = useRef(false);
  const reopenButtonRef = useRef<HTMLAnchorElement | HTMLButtonElement>(null);
  const open = useCallback(() => {
    reopenButtonRef.current?.focus();
    openUpgradePrompt({
      capability: "bookingAudit",
      featureName: t("booking_history"),
      requiredPlan: "TEAM",
      returnTo: `/booking/${encodeURIComponent(bookingUid)}/logs`,
      resume: { kind: "openBookingAudit", bookingUid },
    });
  }, [bookingUid, openUpgradePrompt, t]);

  useEffect(() => {
    if (opened.current) return;
    opened.current = true;
    open();
  }, [open]);

  return (
    <section className="rounded-xl border border-subtle bg-default p-6 text-center">
      <h2 className="font-cal font-semibold text-emphasis text-xl">
        {t("billing_upgrade_booking_audit_title")}
      </h2>
      <p className="mx-auto mt-2 max-w-lg text-sm text-subtle leading-6">
        {t("billing_upgrade_booking_audit_description")}
      </p>
      <Button className="mt-5" onClick={open} ref={reopenButtonRef}>
        <span>{t("billing_upgrade_choose_team")}</span>
        <span aria-hidden="true">›</span>
      </Button>
    </section>
  );
}
