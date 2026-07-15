"use client";

import { useLayoutEffect } from "react";

import "@calcom/embed-core/src/embed-iframe";
import { SUPPORT_MAIL_ADDRESS } from "@calcom/lib/constants";
import { useLocale } from "@calcom/lib/hooks/useLocale";
import { HttpError } from "@calcom/lib/http-error";
import { Button } from "@calcom/ui/components/button";

type Props = {
  statusCode?: number | null;
  error?: Error | HttpError | null;
  message?: string;
  /** Display debugging information */
  displayDebug?: boolean;
  children?: never;
  reset?: () => void;
};

const defaultProps = {
  displayDebug: false,
};

const ErrorDebugPanel: React.FC<{ error: Props["error"]; children?: never }> = (props) => {
  const { error: e } = props;

  const debugMap = [
    ["error.message", e?.message],
    ["error.name", e?.name],
    ["error.class", e instanceof Error ? e.constructor.name : undefined],
    ["http.url", e instanceof HttpError ? e.url : undefined],
    ["http.status", e instanceof HttpError ? e.statusCode : undefined],
    ["http.cause", e instanceof HttpError ? e.cause?.message : undefined],
    ["error.stack", e instanceof Error ? e.stack : undefined],
  ];

  return (
    <div className="bg-default overflow-hidden shadow sm:rounded-lg">
      <div className="border-subtle border-t px-4 py-5 sm:p-0">
        <dl className="sm:divide-subtle sm:divide-y">
          {debugMap.map(([key, value]) => {
            if (value !== undefined) {
              return (
                <div key={key} className="py-4 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6 sm:py-5">
                  <dt className="text-emphasis text-sm font-bold">{key}</dt>
                  <dd className="text-emphasis mt-1 text-sm sm:col-span-2 sm:mt-0">{value}</dd>
                </div>
              );
            }
          })}
        </dl>
      </div>
    </div>
  );
};

export const ErrorPage: React.FC<Props> = (props) => {
  const { t } = useLocale();
  const { message, statusCode, error, displayDebug } = { ...defaultProps, ...props };
  const handleReset = () => {
    window.location.reload();
    props.reset?.();
  };

  // useLayoutEffect runs synchronously before browser paint, ensuring it's set early
  useLayoutEffect(() => {
    if (statusCode && typeof window !== "undefined") {
      window.CalComPageStatus = statusCode.toString();
    }
  }, [statusCode]);

  return (
    <>
      <div className="bg-subtle flex min-h-screen p-4 sm:p-8">
        <main className="border-subtle bg-default m-auto grid w-full max-w-5xl overflow-hidden rounded-3xl border shadow-2xl md:grid-cols-[0.9fr_1.1fr]">
          <section className="bg-inverted flex min-h-72 flex-col justify-between p-8 text-inverted sm:p-12">
            <p className="font-mono text-xs uppercase tracking-[0.2em]">{statusCode ?? t("error")}</p>
            <div>
              <h1 className="font-cal text-5xl tracking-tight sm:text-6xl">{t("error_page_heading")}</h1>
              <p className="mt-5 max-w-md text-sm leading-6 text-inverted/75">
                {t("something_went_wrong_on_our_end")}
              </p>
            </div>
          </section>

          <section className="p-8 text-right ltr:text-left sm:p-12">
            <p className="text-subtle max-w-2xl text-sm leading-6">
              {t("please_provide_following_text_to_suppport")}
            </p>
            <pre className="border-subtle bg-subtle text-emphasis mt-4 w-full max-w-2xl whitespace-pre-wrap wrap-break-word rounded-xl border p-4 font-mono text-xs">
              {message || t("something_went_wrong")}
            </pre>

            <div className="mt-8 flex flex-wrap gap-2">
              <Button onClick={handleReset}>{t("try_again")}</Button>
              <Button color="secondary" href={`mailto:${SUPPORT_MAIL_ADDRESS}`}>
                {t("contact_support")}
              </Button>
            </div>
          </section>
        </main>
      </div>
      {displayDebug && (
        <div className="flex-wrap">
          <ErrorDebugPanel error={error} />
        </div>
      )}
    </>
  );
};
