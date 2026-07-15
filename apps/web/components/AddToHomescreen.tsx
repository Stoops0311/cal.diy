import { useLocale } from "@calcom/lib/hooks/useLocale";
import { XIcon } from "@coss/ui/icons";
import { useState } from "react";

export default function AddToHomescreen() {
  const { t } = useLocale();
  const [closeBanner, setCloseBanner] = useState(false);

  if (typeof window !== "undefined") {
    if (window.matchMedia("(display-mode: standalone)").matches) {
      return null;
    }
  }
  return !closeBanner ? (
    <div className="fixed inset-x-0 bottom-0 pb-2 sm:hidden sm:pb-5">
      <div className="mx-auto max-w-7xl px-2 sm:px-6 lg:px-8">
        <div className="rounded-2xl border border-inverted/15 bg-inverted p-2 shadow-xl sm:p-3">
          <div className="flex flex-wrap items-center justify-between">
            <div className="flex w-0 flex-1 items-center">
              <span className="flex rounded-lg bg-default/10 p-2 text-inverted">
                <svg
                  className="h-7 w-7 fill-current"
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 50 50"
                  enableBackground="new 0 0 50 50">
                  <path d="M30.3 13.7L25 8.4l-5.3 5.3-1.4-1.4L25 5.6l6.7 6.7z" />
                  <path d="M24 7h2v21h-2z" />
                  <path d="M35 40H15c-1.7 0-3-1.3-3-3V19c0-1.7 1.3-3 3-3h7v2h-7c-.6 0-1 .4-1 1v18c0 .6.4 1 1 1h20c.6 0 1-.4 1-1V19c0-.6-.4-1-1-1h-7v-2h7c1.7 0 3 1.3 3 3v18c0 1.7-1.3 3-3 3z" />
                </svg>
              </span>
              <p className="ms-3 font-medium text-inverted text-xs">
                <span className="inline">{t("add_to_homescreen")}</span>
              </p>
            </div>

            <div className="order-2 shrink-0 sm:order-3">
              <button
                onClick={() => setCloseBanner(true)}
                type="button"
                className="-mr-1 flex rounded-md p-2 text-inverted hover:bg-default/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inverted">
                <span className="sr-only">{t("dismiss")}</span>
                <XIcon className="h-6 w-6 text-inverted" aria-hidden="true" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  ) : null;
}
