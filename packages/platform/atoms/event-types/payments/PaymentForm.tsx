import { getPaymentAppData } from "@calcom/app-store/_utils/payments/getPaymentAppData";
import { getSuccessPageLocationMessage } from "@calcom/app-store/locations";
import dayjs from "@calcom/dayjs";
import { PayIcon } from "@calcom/features/bookings/components/event-meta/PayIcon";
import { Price } from "@calcom/features/bookings/components/event-meta/Price";
import { APP_NAME, WEBSITE_URL } from "@calcom/lib/constants";
import { useLocale } from "@calcom/lib/hooks/useLocale";
import { isBrowserLocale24h } from "@calcom/lib/timeFormat";
import { CURRENT_TIMEZONE } from "@calcom/lib/timezoneConstants";
import { localStorage } from "@calcom/lib/webstorage";
import React, { Suspense } from "react";
import { AtomsWrapper } from "../../src/components/atoms-wrapper";
import { useAtomsEventTypePaymentInfo } from "../hooks/useAtomEventTypePaymentInfo";

const StripePaymentForm = React.lazy(() => import("./StripePaymentForm"));

export const PaymentForm = ({
  paymentUid,
  onPaymentSuccess,
  onPaymentCancellation,
  onEventTypePaymentInfoSuccess,
  onEventTypePaymentInfoFailure,
}: {
  paymentUid: string;
  onPaymentSuccess?: (input: PaymentPageProps) => void;
  onPaymentCancellation?: (input: PaymentPageProps) => void;
  onEventTypePaymentInfoSuccess?: () => void;
  onEventTypePaymentInfoFailure?: () => void;
}) => {
  const { t } = useLocale();
  const { data: paymentInfo, isLoading } = useAtomsEventTypePaymentInfo({
    uid: paymentUid,
    onEventTypePaymentInfoSuccess,
    onEventTypePaymentInfoFailure,
  });

  const eventName = paymentInfo?.booking.title;

  const is24h = isBrowserLocale24h();
  const timezone = localStorage.getItem("timeOption.preferredTimeZone") || CURRENT_TIMEZONE;
  const date = dayjs.utc(paymentInfo?.booking.startTime).tz(timezone);

  if (isLoading)
    return (
      <p className="text-subtle p-4 text-sm" aria-live="polite">
        {t("loading")}
      </p>
    );

  if (!paymentInfo)
    return (
      <div className="border-subtle bg-default m-4 rounded-2xl border p-6 shadow-sm">
        <h1 className="font-cal text-emphasis text-2xl">{t("payment_not_found")}</h1>
        <p className="text-subtle mt-2 font-mono text-xs">{paymentUid}</p>
      </div>
    );

  const paymentAppData = getPaymentAppData(paymentInfo?.eventType);

  return (
    <AtomsWrapper>
      <Suspense
        fallback={
          <p className="p-4 text-subtle text-sm" role="status">
            {t("loading")}
          </p>
        }>
        <main className="mx-auto grid w-full max-w-4xl overflow-hidden rounded-3xl border border-subtle shadow-xl md:grid-cols-[0.86fr_1.14fr]">
          <section className="bg-inverted p-7 text-inverted sm:p-9">
            <div className="flex items-center justify-between">
              <p className="font-mono text-[10px] text-inverted/55 uppercase tracking-[0.2em]">
                {t("terms")}
              </p>
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-default">
                <PayIcon currency={paymentAppData.currency} className="h-5 w-5 text-emphasis" />
              </div>
            </div>
            <h1 className="mt-8 font-cal text-3xl leading-none" id="atom-payment-heading">
              {paymentAppData.paymentOption === "HOLD" ? t("complete_your_booking") : t("payment")}
            </h1>
            <dl className="mt-8 space-y-5 border-inverted/15 border-t pt-6 text-sm">
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
                  {date.format("dddd, DD MMMM YYYY")}
                  <br />
                  {date.format(is24h ? "H:mm" : "h:mma")} · {paymentInfo.eventType.length} {t("minutes")} ·{" "}
                  {timezone}
                </dd>
              </div>
              {paymentInfo.booking.location ? (
                <div>
                  <dt className="font-mono text-[10px] text-inverted/45 uppercase tracking-[0.18em]">
                    {t("where")}
                  </dt>
                  <dd className="mt-1.5">{getSuccessPageLocationMessage(paymentInfo.booking.location, t)}</dd>
                </div>
              ) : null}
              <div>
                <dt className="font-mono text-[10px] text-inverted/45 uppercase tracking-[0.18em]">
                  {paymentInfo.payment.paymentOption === "HOLD" ? t("no_show_fee") : t("price")}
                </dt>
                <dd className="mt-1.5 font-cal text-2xl">
                  <Price
                    currency={paymentAppData.currency}
                    price={paymentAppData.price}
                    displayAlternateSymbol={false}
                  />
                </dd>
              </div>
            </dl>
          </section>

          <section
            className="flex flex-col justify-between bg-subtle p-7 sm:p-9"
            aria-labelledby="atom-payment-heading">
            <div>
              <p className="font-mono text-[10px] text-subtle uppercase tracking-[0.2em]">{t("decision")}</p>
              <h2 className="mt-2 font-cal text-2xl text-emphasis">
                {paymentInfo.payment.refunded
                  ? t("refunded")
                  : paymentInfo.payment.success
                    ? t("paid")
                    : t("secure_payment")}
              </h2>
            </div>
            <div className="mt-8 rounded-2xl border border-subtle bg-default p-5" role="status">
              {paymentInfo.payment.success && !paymentInfo.payment.refunded ? (
                <p className="font-medium text-success">{t("paid")}</p>
              ) : null}
              {paymentInfo.payment.appId === "stripe" && !paymentInfo.payment.success ? (
                <StripePaymentForm
                  clientSecret={paymentInfo.clientSecret}
                  payment={paymentInfo.payment}
                  eventType={paymentInfo.eventType}
                  user={paymentInfo.user}
                  location={paymentInfo.booking.location}
                  booking={paymentInfo.booking}
                  uid={paymentUid}
                  onPaymentSuccess={onPaymentSuccess}
                  onPaymentCancellation={onPaymentCancellation}
                />
              ) : null}
              {paymentInfo.payment.refunded ? (
                <p className="font-medium text-default">{t("refunded")}</p>
              ) : null}
            </div>
            {!paymentInfo.profile.hideBranding ? (
              <a
                className="mt-8 w-fit text-muted text-xs underline-offset-4 hover:text-emphasis hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emphasis"
                href={`${WEBSITE_URL}/signup`}>
                {t("create_booking_link_with_calcom", { appName: APP_NAME })}
              </a>
            ) : null}
          </section>
        </main>
      </Suspense>
    </AtomsWrapper>
  );
};
