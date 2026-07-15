"use client";

import { useCurrentSession as useSession } from "@calcom/features/auth/lib/useCurrentSession";
import { useLocale } from "@calcom/lib/hooks/useLocale";
import type { inferSSRProps } from "@calcom/types/inferSSRProps";
import { Button } from "@calcom/ui/components/button";
import { showToast } from "@calcom/ui/components/toast";
import { TriangleAlertIcon } from "@coss/ui/icons";
import type { getServerSideProps } from "@server/lib/auth/verify-email-change/getServerSideProps";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Toaster } from "sonner";
import AuthShell from "./components/AuthShell";

export type PageProps = inferSSRProps<typeof getServerSideProps>;

function VerifyEmailChange(props: PageProps) {
  const { update } = useSession();
  const { t, isLocaleReady } = useLocale();
  const router = useRouter();
  const [status, setStatus] = useState<"processing" | "failed">("processing");

  useEffect(() => {
    async function updateSessionAndDisplayToast() {
      await update({ email: props.updatedEmail });
      if (isLocaleReady) {
        showToast(t("verify_email_change_success_toast", { email: props.updatedEmail }), "success");
      }
      router.push("/event-types");
    }
    if (props.updateSession) {
      updateSessionAndDisplayToast();
    } else {
      if (isLocaleReady) {
        showToast(t("verify_email_change_failure_toast"), "error");
      }
      setStatus("failed");
    }
    // We only need this to run on initial mount. These props can't and won't change due to it being fetched serverside.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <AuthShell>
      <Toaster position="bottom-right" />
      <p className="text-subtle font-mono text-[11px] uppercase tracking-[0.22em]">
        {t("verify_email_change")}
      </p>
      {status === "failed" ? (
        <>
          <div className="mt-5 flex items-start gap-4">
            <div className="bg-error flex h-12 w-12 shrink-0 items-center justify-center rounded-full">
              <TriangleAlertIcon className="text-error h-6 w-6" />
            </div>
            <div className="min-w-0">
              <h1 className="font-cal text-emphasis text-3xl leading-none text-balance">
                {t("verify_email_change_failure_title")}
              </h1>
              <p className="text-subtle mt-4 text-sm leading-relaxed">
                {t("verify_email_change_failure_description")}
              </p>
            </div>
          </div>
          <div className="border-muted mt-8 border-t pt-6">
            <Button href="/settings/my-account/profile">{t("return_to_settings")}</Button>
          </div>
        </>
      ) : (
        <div className="border-subtle bg-subtle mt-5 rounded-2xl border p-6" aria-live="polite">
          <div className="flex items-center gap-4">
            <div className="bg-inverted h-3 w-3 rounded-full motion-safe:animate-pulse" aria-hidden="true" />
            <div>
              <h1 className="font-cal text-emphasis text-2xl leading-none">
                {t("verify_email_change_processing_title")}
              </h1>
              <p className="text-subtle mt-3 text-sm leading-relaxed">
                {t("verify_email_change_processing_description")}
              </p>
            </div>
          </div>
        </div>
      )}
    </AuthShell>
  );
}

export default VerifyEmailChange;
