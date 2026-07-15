"use client";

import { useCurrentSession as useSession } from "@calcom/features/auth/lib/useCurrentSession";
import { useFlagMap } from "@calcom/features/flags/context/provider";
import { APP_NAME } from "@calcom/lib/constants";
import { useLocale } from "@calcom/lib/hooks/useLocale";
import { trpc } from "@calcom/trpc/react";
import useEmailVerifyCheck from "@calcom/trpc/react/hooks/useEmailVerifyCheck";
import { Button } from "@calcom/ui/components/button";
import { showToast } from "@calcom/ui/components/toast";
import { useRouter } from "next/navigation";
import { signOut } from "next-auth/react";
import posthog from "posthog-js";
import { useEffect } from "react";
import AuthShell from "./components/AuthShell";

const EMAIL_CLIENTS = [
  {
    name: "Gmail",
    icon: "/email-clients/gmail.svg",
    href: "https://mail.google.com/mail/u/0/#search/Convenio",
  },
  {
    name: "Outlook",
    icon: "/email-clients/outlook.svg",
    href: "https://outlook.live.com/mail/0/",
  },
  {
    name: "Yahoo",
    icon: "/email-clients/yahoo.svg",
    href: "https://mail.yahoo.com/d/search?p=Convenio",
  },
  {
    name: "Proton",
    icon: "/email-clients/proton.svg",
    href: "https://mail.proton.me",
  },
] as const;

function VerifyEmailPage() {
  const { data } = useEmailVerifyCheck();
  const { data: session } = useSession();
  const router = useRouter();
  const { t, isLocaleReady } = useLocale();
  const mutation = trpc.viewer.auth.resendVerifyEmail.useMutation();
  const flags = useFlagMap();

  useEffect(() => {
    if (data?.isVerified) {
      posthog.capture("verify_email_already_verified", {
        onboarding_v3_enabled: flags["onboarding-v3"],
      });
      const gettingStartedPath = flags["onboarding-v3"] ? "/onboarding/getting-started" : "/getting-started";
      router.replace(gettingStartedPath);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.isVerified, flags]);
  if (!isLocaleReady) {
    return null;
  }
  return (
    <AuthShell>
      <div className="flex w-full flex-col">
        <p className="font-mono text-[11px] text-subtle uppercase tracking-[0.22em]">
          {t("verify_email_button")}
        </p>
        <h1 className="mt-4 font-cal text-[32px] leading-none text-emphasis">{t("check_your_email")}</h1>
        <p className="mt-4 text-sm leading-relaxed text-subtle">
          {t("verify_email_page_body", { email: session?.user?.email, appName: APP_NAME })}
        </p>

        <div className="mt-8 rounded-2xl border border-subtle bg-subtle p-2">
          <div className="grid grid-cols-2 gap-2">
            {EMAIL_CLIENTS.map(({ name, icon, href }) => (
              <Button
                key={name}
                color="secondary"
                className="justify-center bg-default"
                href={href}
                target="_blank"
                rel="noopener noreferrer">
                <img src={icon} alt="" className="me-1 h-4 w-4" /> {name}
              </Button>
            ))}
          </div>
        </div>

        <div className="mt-8 flex items-center gap-3 border-muted border-t pt-6">
          <Button
            color="primary"
            loading={mutation.isPending}
            onClick={() => {
              posthog.capture("verify_email_resend_clicked");
              showToast(t("send_email"), "success");
              mutation.mutate();
            }}>
            {t("resend_email")}
          </Button>
          <Button
            color="minimal"
            onClick={() => {
              signOut({ callbackUrl: "/signup" });
            }}>
            {t("use_different_email")}
          </Button>
        </div>
      </div>
    </AuthShell>
  );
}

export default VerifyEmailPage;
