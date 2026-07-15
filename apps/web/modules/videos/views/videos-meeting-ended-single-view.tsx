"use client";

import dayjs from "@calcom/dayjs";
import { useLocale } from "@calcom/lib/hooks/useLocale";
import { detectBrowserTimeFormat } from "@calcom/lib/timeFormat";
import type { inferSSRProps } from "@calcom/types/inferSSRProps";
import { Button } from "@calcom/ui/components/button";
import { EmptyScreen } from "@calcom/ui/components/empty-screen";
import { CalendarIcon } from "@coss/ui/icons";
import type { getServerSideProps } from "@lib/video/meeting-ended/[uid]/getServerSideProps";

export type PageProps = inferSSRProps<typeof getServerSideProps>;
export default function MeetingUnavailable(props: PageProps) {
  const { t } = useLocale();

  return (
    <main className="bg-default flex min-h-screen items-center px-6 py-12">
      <div className="mx-auto w-full max-w-3xl">
        <EmptyScreen
          Icon="calendar-x-2"
          headline={t("event_is_in_the_past")}
          dashedBorder={false}
          description={
            <div className="border-subtle bg-default w-full rounded-xl border p-4 text-left">
              <p className="text-emphasis break-words font-medium">{props.booking.title}</p>
              <p className="text-subtle mt-2 flex items-center gap-2 font-mono text-xs tabular-nums">
                <CalendarIcon className="h-4 w-4 shrink-0" />
                {dayjs(props.booking.startTime).format(`${detectBrowserTimeFormat}, dddd DD MMMM YYYY`)}
              </p>
            </div>
          }
          buttonRaw={
            <Button data-testid="return-home" href="/event-types" EndIcon="arrow-right">
              {t("go_back")}
            </Button>
          }
        />
      </div>
    </main>
  );
}
