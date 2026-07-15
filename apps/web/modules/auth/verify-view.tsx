"use client";

import { WEBAPP_URL } from "@calcom/lib/constants";
import { useCompatSearchParams } from "@calcom/lib/hooks/useCompatSearchParams";
import { useLocale } from "@calcom/lib/hooks/useLocale";
import { useRouterQuery } from "@calcom/lib/hooks/useRouterQuery";
import { Button } from "@calcom/ui/components/button";
import { showToast } from "@calcom/ui/components/toast";
import { CheckIcon, MailOpenIcon, TriangleAlertIcon } from "@coss/ui/icons";
import { usePathname, useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { useEffect, useRef, useState } from "react";
import z from "zod";
import AuthShell from "./components/AuthShell";

async function sendVerificationLogin(email: string, username: string, t: (key: string) => string) {
  await signIn("email", {
    email: email.toLowerCase(),
    username: username.toLowerCase(),
    redirect: false,
    callbackUrl: WEBAPP_URL || "/",
  })
    .then(() => {
      showToast(t("verification_email_sent"), "success");
    })
    .catch((err) => {
      showToast(err, "error");
    });
}

function useSendFirstVerificationLogin({
  email,
  username,
}: {
  email: string | undefined;
  username: string | undefined;
}) {
  const sent = useRef(false);
  const { t } = useLocale();
  useEffect(() => {
    if (!email || !username || sent.current) {
      return;
    }
    (async () => {
      await sendVerificationLogin(email, username, t);
      sent.current = true;
    })();
  }, [email, username, t]);
}

const querySchema = z.object({
  email: z.string().optional(),
  username: z.string().optional(),
  paymentStatus: z.string().optional(),
  t: z.string().optional(),
});

const PaymentFailedIcon = () => (
  <div className="bg-error flex h-12 w-12 shrink-0 items-center justify-center rounded-full">
    <TriangleAlertIcon className="text-error h-6 w-6" />
  </div>
);

const PaymentSuccess = () => (
  <div className="bg-cal-success flex h-12 w-12 shrink-0 items-center justify-center rounded-full">
    <CheckIcon className="text-success h-6 w-6" />
  </div>
);

const MailOpenIconWrapper = () => (
  <div className="border-subtle bg-default flex h-12 w-12 shrink-0 items-center justify-center rounded-full border">
    <MailOpenIcon className="text-emphasis h-6 w-6" />
  </div>
);

export default function Verify({ EMAIL_FROM }: { EMAIL_FROM?: string }) {
  const searchParams = useCompatSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const routerQuery = useRouterQuery();
  const { email, username, paymentStatus, t: lastSentTimestamp } = querySchema.parse(routerQuery);
  const { t } = useLocale();
  const [secondsLeft, setSecondsLeft] = useState(30);

  // Derive payment failed status from payment status
  const hasPaymentFailed = paymentStatus !== undefined && paymentStatus !== "paid";
  const isPremiumUsername = !!paymentStatus; // If paymentStatus exists, it's from premium username flow

  // Only send verification login if we DON'T have the email yet (for resend button)
  // The email is already sent server-side in paymentCallback
  useSendFirstVerificationLogin({
    email: !isPremiumUsername ? email : undefined,
    username: !isPremiumUsername ? username : undefined,
  });
  // @note: check for t=timestamp and apply disabled state and secondsLeft accordingly
  // to avoid refresh to skip waiting 30 seconds to re-send email
  useEffect(() => {
    if (!lastSentTimestamp) return;
    const lastSent = new Date(parseInt(lastSentTimestamp, 10));
    const difference = Math.round((new Date().getTime() - lastSent.getTime()) / 1000);
    if (difference < 30) {
      setSecondsLeft(30 - difference);
    } else {
      setSecondsLeft(0);
    }
  }, [lastSentTimestamp]);
  // @note: here we make sure each second is decremented if disabled up to 0.
  useEffect(() => {
    if (secondsLeft > 0) {
      const interval = setInterval(() => {
        if (secondsLeft > 0) {
          setSecondsLeft(secondsLeft - 1);
        }
      }, 1000);
      return () => clearInterval(interval);
    }
  }, [secondsLeft]);

  if (!email) {
    return (
      <AuthShell>
        <p className="text-subtle font-mono text-[11px] uppercase tracking-[0.22em]">
          {t("verification_status")}
        </p>
        <div className="mt-5 flex items-start gap-4">
          <PaymentFailedIcon />
          <div className="min-w-0">
            <h1 className="font-cal text-emphasis text-3xl leading-none">{t("invalid_link")}</h1>
            <p className="text-subtle mt-4 text-sm leading-relaxed">{t("invalid_link_description")}</p>
          </div>
        </div>
        <div className="border-muted mt-8 border-t pt-6">
          <Button href="/auth/login">{t("back_to_signin")}</Button>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell>
      <div className="flex w-full flex-col">
        <p className="text-subtle font-mono text-[11px] uppercase tracking-[0.22em]">
          {t("verification_status")}
        </p>
        <div className="mt-5 flex items-start gap-4">
          {hasPaymentFailed ? (
            <PaymentFailedIcon />
          ) : isPremiumUsername ? (
            <PaymentSuccess />
          ) : (
            <MailOpenIconWrapper />
          )}
          <div className="min-w-0">
            <h1 className="font-cal text-emphasis text-3xl leading-none text-balance">
              {hasPaymentFailed
                ? t("your_payment_failed")
                : isPremiumUsername
                  ? t("payment_successful")
                  : t("check_your_inbox")}
            </h1>
            {hasPaymentFailed && (
              <p className="text-default mt-4 text-sm leading-relaxed">
                {t("account_created_premium_not_reserved")}
              </p>
            )}
          </div>
        </div>

        <div className="border-subtle bg-subtle mt-8 rounded-2xl border p-5">
          <p className="text-default break-words text-sm leading-relaxed">
            {t("email_sent_with_activation_link", { email })}{" "}
            {hasPaymentFailed && t("activate_account_to_purchase_username")}
          </p>
          <Button
            className="mt-5"
            color="secondary"
            href={
              EMAIL_FROM
                ? `https://mail.google.com/mail/u/0/#search/from:${encodeURIComponent(EMAIL_FROM)}`
                : "https://mail.google.com/mail/u/0/"
            }
            target="_blank"
            rel="noopener noreferrer"
            EndIcon="external-link">
            {t("open_in_gmail")}
          </Button>
        </div>

        <div className="border-muted mt-8 flex flex-wrap items-center gap-2 border-t pt-6">
          <p className="text-subtle text-sm">{t("dont_see_email")}</p>
          <Button
            color="minimal"
            className="font-mono tabular-nums"
            disabled={secondsLeft > 0}
            onClick={async (e) => {
              if (!email || !username) {
                return;
              }
              e.preventDefault();
              setSecondsLeft(30);
              // Update query params with t:timestamp, shallow: true doesn't re-render the page
              const _searchParams = new URLSearchParams(searchParams?.toString());
              _searchParams.set("t", `${Date.now()}`);
              router.replace(`${pathname}?${_searchParams.toString()}`);
              return await sendVerificationLogin(email, username, t);
            }}>
            {secondsLeft > 0 ? t("resend_in_seconds", { seconds: secondsLeft }) : t("resend")}
          </Button>
        </div>
      </div>
    </AuthShell>
  );
}
