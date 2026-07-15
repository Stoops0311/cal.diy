"use client";

import { useLocale } from "@calcom/lib/hooks/useLocale";
import { CheckIcon } from "@coss/ui/icons";

export default function DryRunSuccessful() {
  const { t } = useLocale();

  return (
    <main className="flex min-h-screen items-center bg-muted px-4 py-12 sm:px-6">
      <div className="mx-auto grid w-full max-w-4xl overflow-hidden rounded-3xl border border-subtle shadow-xl md:min-h-[480px] md:grid-cols-[0.82fr_1.18fr]">
        <section className="flex flex-col justify-between bg-inverted p-8 text-inverted sm:p-10">
          <p className="font-mono text-[11px] text-inverted/55 uppercase tracking-[0.22em]">
            {t("booking_test")}
          </p>
          <div className="py-16 md:py-0">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-default">
              <CheckIcon className="h-7 w-7 text-success" aria-hidden="true" />
            </div>
            <p className="mt-7 max-w-xs font-cal text-4xl leading-none">{t("flow_complete")}</p>
          </div>
          <span className="font-mono text-[10px] text-inverted/45 uppercase tracking-[0.2em]">Convenio</span>
        </section>

        <section className="flex flex-col justify-center bg-subtle p-8 sm:p-12">
          <p className="font-mono text-[11px] text-subtle uppercase tracking-[0.2em]">{t("result")}</p>
          <h1
            className="mt-4 max-w-lg font-cal text-3xl text-emphasis leading-tight sm:text-4xl"
            data-testid="dry-run-success-msg">
            {t("booking_dry_run_successful")}
          </h1>
          <p className="mt-5 max-w-xl text-default text-sm leading-relaxed">
            {t("booking_dry_run_successful_description")}
          </p>
          <div className="mt-8 rounded-2xl border border-subtle bg-default p-5">
            <p className="font-medium text-emphasis text-sm">{t("no_invitation_was_sent")}</p>
            <p className="mt-1 text-subtle text-xs leading-relaxed">{t("dry_run_is_safe_to_repeat")}</p>
          </div>
        </section>
      </div>
    </main>
  );
}
