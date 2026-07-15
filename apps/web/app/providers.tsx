"use client";

import process from "node:process";
import { getClientAuthProvider } from "@calcom/features/auth/lib/clientAuthProvider";
import { NotificationSoundHandler } from "@calcom/web/components/notification-sound-handler";
import { WebPushProvider } from "@calcom/web/modules/notifications/components/WebPushContext";
import { ToastProvider } from "@coss/ui/components/toast";
import useIsBookingPage from "@lib/hooks/useIsBookingPage";
import { TrpcProvider } from "app/_trpc/trpc-provider";
import { SessionProvider } from "next-auth/react";
import CacheProvider from "react-inlinesvg/provider";
import { GeoProvider } from "./GeoContext";

type ProvidersProps = {
  isEmbed: boolean;
  children: React.ReactNode;
  nonce: string | undefined;
  country: string;
};
export function Providers({ isEmbed, children, country }: ProvidersProps) {
  const isBookingPage = useIsBookingPage();
  const content = (
    <TrpcProvider>
      <ToastProvider position="bottom-center">
        {!isEmbed && !isBookingPage && <NotificationSoundHandler />}
        {/* @ts-expect-error FIXME remove this comment when upgrading typescript to v5 */}
        <CacheProvider>
          <WebPushProvider>{children}</WebPushProvider>
        </CacheProvider>
      </ToastProvider>
    </TrpcProvider>
  );

  return (
    <GeoProvider country={country}>
      {getClientAuthProvider(process.env.NEXT_PUBLIC_AUTH_PROVIDER) === "clerk" ? (
        content
      ) : (
        <SessionProvider>{content}</SessionProvider>
      )}
    </GeoProvider>
  );
}
