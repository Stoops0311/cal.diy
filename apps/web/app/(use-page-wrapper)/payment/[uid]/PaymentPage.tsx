"use client";

import { getPaymentAppData } from "@calcom/app-store/_utils/payments/getPaymentAppData";
import { getSuccessPageLocationMessage } from "@calcom/app-store/locations";
import dayjs from "@calcom/dayjs";
import { sdkActionManager, useIsEmbed } from "@calcom/embed-core/embed-iframe";
import { PayIcon } from "@calcom/features/bookings/components/event-meta/PayIcon";
import { Price } from "@calcom/features/bookings/components/event-meta/Price";
import { APP_NAME, WEBSITE_URL } from "@calcom/lib/constants";
import { useLocale } from "@calcom/lib/hooks/useLocale";
import useTheme from "@calcom/lib/hooks/useTheme";
import { getIs24hClockFromLocalStorage, isBrowserLocale24h } from "@calcom/lib/timeFormat";
import { CURRENT_TIMEZONE } from "@calcom/lib/timezoneConstants";
import { localStorage } from "@calcom/lib/webstorage";
import dynamic from "next/dynamic";
import type { FC } from "react";
import { useEffect, useState } from "react";

type PaymentPageProps = {
  payment: {
    id: number;
    success: boolean;
    refunded: boolean;
    amount: number;
    currency: string;
    paymentOption: string | null;
    data: Record<string, unknown>;
    appId?: string | null;
  };
  clientSecret?: string | null;
  booking: {
    id: number;
    uid: string;
    title: string;
    startTime: string;
    endTime: string;
    status: string;
    paid: boolean;
    description?: string | null;
    location?: string | null;
  };
  eventType: {
    id: number;
    title: string;
    length: number;
    price: number;
    currency: string;
    metadata: Record<string, unknown> | null;
    successRedirectUrl?: string | null;
    forwardParamsSuccessRedirect?: boolean | null;
    recurringEvent?: unknown;
  };
  profile: { theme?: string | null; hideBranding?: boolean };
  user?: { name?: string | null; username?: string | null } | null;
};

const PaypalPaymentComponent = dynamic(
  () =>
    import("@calcom/web/components/apps/paypal/PaypalPaymentComponent").then((m) => m.PaypalPaymentComponent),
  {
    ssr: false,
  }
);

const AlbyPaymentComponent = dynamic(
  () => import("@calcom/web/components/apps/alby/AlbyPaymentComponent").then((m) => m.AlbyPaymentComponent),
  {
    ssr: false,
  }
);

const HitpayPaymentComponent = dynamic(
  () =>
    import("@calcom/web/components/apps/hitpay/HitpayPaymentComponent").then((m) => m.HitpayPaymentComponent),
  {
    ssr: false,
  }
);

const BtcpayPaymentComponent = dynamic(
  () =>
    import("@calcom/web/components/apps/btcpayserver/BtcpayPaymentComponent").then(
      (m) => m.BtcpayPaymentComponent
    ),
  {
    ssr: false,
  }
);

const PaymentPage: FC<PaymentPageProps> = (props) => {
  const { t, i18n } = useLocale();
  const [is24h, setIs24h] = useState(isBrowserLocale24h());
  const [date, setDate] = useState(dayjs.utc(props.booking.startTime));
  const [timezone, setTimezone] = useState<string | null>(null);
  useTheme(props.profile.theme);
  const isEmbed = useIsEmbed();
  const paymentAppData = getPaymentAppData(props.eventType);

  useEffect(() => {
    let embedIframeWidth = 0;
    const _timezone = localStorage.getItem("timeOption.preferredTimeZone") || CURRENT_TIMEZONE;
    setTimezone(_timezone);
    setDate(dayjs.utc(props.booking.startTime).tz(_timezone));
    setIs24h(!!getIs24hClockFromLocalStorage());

    let animationFrameId: number | null = null;
    const handleDimensionChange = (event: CustomEvent<{ data: { iframeWidth: number } }>) => {
      embedIframeWidth = event.detail.data.iframeWidth;
    };

    if (isEmbed) {
      const fixStripeIframe = () => {
        // HACK: Look for stripe iframe and center position it just above the embed content
        const stripeIframeWrapper = document.querySelector(
          'iframe[src*="https://js.stripe.com/v3/authorize-with-url-inner"]'
        )?.parentElement;
        if (stripeIframeWrapper) {
          stripeIframeWrapper.style.margin = "0 auto";
          stripeIframeWrapper.style.width = `${embedIframeWidth}px`;
        }
        animationFrameId = requestAnimationFrame(fixStripeIframe);
      };
      animationFrameId = requestAnimationFrame(fixStripeIframe);
      sdkActionManager?.on("__dimensionChanged", handleDimensionChange);
    }

    return () => {
      if (animationFrameId !== null) cancelAnimationFrame(animationFrameId);
      sdkActionManager?.off("__dimensionChanged", handleDimensionChange);
    };
  }, [isEmbed, props.booking.startTime]);

  const eventName = props.booking.title;

  return (
    <main className="flex min-h-screen items-center bg-muted px-4 py-8 sm:px-6 sm:py-12">
      <div className="mx-auto grid w-full max-w-5xl overflow-hidden rounded-3xl border border-subtle lg:grid-cols-[0.88fr_1.12fr]">
        <section className="flex flex-col bg-inverted p-7 text-inverted sm:p-10">
          <div className="flex items-center justify-between">
            <p className="font-mono text-[11px] text-inverted/55 uppercase tracking-[0.22em]">{t("terms")}</p>
            <div className="flex h-11 w-11 items-center justify-center rounded-full bg-default">
              <PayIcon currency={paymentAppData.currency} className="h-6 w-6 text-emphasis" />
            </div>
          </div>

          <h1 className="mt-10 max-w-sm font-cal text-4xl leading-none" id="payment-heading">
            {paymentAppData.paymentOption === "HOLD" ? t("complete_your_booking") : t("payment")}
          </h1>

          <dl className="mt-10 space-y-5 border-inverted/15 border-t pt-6 text-sm">
            <div>
              <dt className="font-mono text-[10px] text-inverted/45 uppercase tracking-[0.18em]">
                {t("what")}
              </dt>
              <dd className="mt-1.5 font-medium">{eventName}</dd>
            </div>
            <div>
              <dt className="font-mono text-[10px] text-inverted/45 uppercase tracking-[0.18em]">
                {t("when")}
              </dt>
              <dd className="mt-1.5 leading-relaxed">
                {date.locale(i18n.language ?? "en").format("dddd, DD MMMM YYYY")}
                <br />
                {date.format(is24h ? "H:mm" : "h:mma")} · {props.eventType.length} {t("minutes")}
                {timezone ? <span className="text-inverted/55"> · {timezone}</span> : null}
              </dd>
            </div>
            {props.booking.location ? (
              <div>
                <dt className="font-mono text-[10px] text-inverted/45 uppercase tracking-[0.18em]">
                  {t("where")}
                </dt>
                <dd className="mt-1.5">{getSuccessPageLocationMessage(props.booking.location, t)}</dd>
              </div>
            ) : null}
            <div>
              <dt className="font-mono text-[10px] text-inverted/45 uppercase tracking-[0.18em]">
                {props.payment.paymentOption === "HOLD" ? t("no_show_fee") : t("price")}
              </dt>
              <dd className="mt-1.5 font-cal text-2xl">
                <Price
                  currency={paymentAppData.currency}
                  price={props.payment.amount ?? paymentAppData.price}
                  displayAlternateSymbol={false}
                />
              </dd>
            </div>
          </dl>
        </section>

        <section
          className="flex min-h-[420px] flex-col justify-between bg-subtle p-7 sm:p-10"
          aria-labelledby="payment-heading">
          <div>
            <p className="font-mono text-[11px] text-subtle uppercase tracking-[0.2em]">{t("decision")}</p>
            <h2 className="mt-3 font-cal text-3xl text-emphasis">
              {props.payment.refunded
                ? t("refunded")
                : props.payment.success
                  ? t("paid")
                  : t("secure_payment")}
            </h2>
            <p className="mt-3 max-w-md text-default text-sm leading-relaxed">
              {props.payment.success || props.payment.refunded
                ? t("payment_status_recorded")
                : t("complete_payment_to_confirm")}
            </p>
          </div>

          <div className="mt-8 rounded-2xl border border-subtle bg-default p-5 sm:p-6" role="status">
            {props.payment.success && !props.payment.refunded ? (
              <p className="font-medium text-success">{t("paid")}</p>
            ) : null}
            {props.payment.appId === "paypal" && !props.payment.success ? (
              <PaypalPaymentComponent payment={props.payment} />
            ) : null}
            {props.payment.appId === "alby" && !props.payment.success ? (
              <AlbyPaymentComponent payment={props.payment} paymentPageProps={props} />
            ) : null}
            {props.payment.appId === "hitpay" && !props.payment.success ? (
              <HitpayPaymentComponent payment={props.payment} />
            ) : null}
            {props.payment.appId === "btcpayserver" && !props.payment.success ? (
              <BtcpayPaymentComponent payment={props.payment} paymentPageProps={props} />
            ) : null}
            {props.payment.refunded ? <p className="font-medium text-default">{t("refunded")}</p> : null}
          </div>

          {!props.profile.hideBranding ? (
            <a
              className="mt-8 inline-flex w-fit rounded-md text-muted text-xs underline-offset-4 hover:text-emphasis hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emphasis"
              href={`${WEBSITE_URL}/signup`}>
              {t("create_booking_link_with_calcom", { appName: APP_NAME })}
            </a>
          ) : null}
        </section>
      </div>
    </main>
  );
};

export default PaymentPage;
