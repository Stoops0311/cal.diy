import type { IncomingMessage } from "node:http";
import { getClientAuthProvider } from "@calcom/features/auth/lib/clientAuthProvider";
import { trpc } from "@calcom/trpc/react";
import { WebPushProvider } from "@calcom/web/modules/notifications/components/WebPushContext";
import { ClerkProvider } from "@clerk/nextjs";
import type { AppProps } from "@lib/app-providers";
import type { NextPageContext } from "next";
import { SessionProvider } from "next-auth/react";
import type { ComponentType, ReactNode } from "react";
import CacheProvider from "react-inlinesvg/provider";

import "../styles/globals.css";
import process from "node:process";

const ClerkProviderCompat = ClerkProvider as unknown as ComponentType<{ children: ReactNode }>;

function MyApp(props: AppProps) {
  const { Component, pageProps } = props;
  const content = (
    <WebPushProvider>
      {/* @ts-expect-error FIXME remove this comment when upgrading typescript to v5 */}
      <CacheProvider>
        {Component.PageWrapper ? <Component.PageWrapper {...props} /> : <Component {...pageProps} />}
      </CacheProvider>
    </WebPushProvider>
  );

  if (getClientAuthProvider(process.env.NEXT_PUBLIC_AUTH_PROVIDER) === "clerk") {
    return <ClerkProviderCompat>{content}</ClerkProviderCompat>;
  }
  return <SessionProvider session={pageProps.session ?? undefined}>{content}</SessionProvider>;
}

declare global {
  interface Window {
    calNewLocale: string;
  }
}

MyApp.getInitialProps = async ({ ctx }: { ctx: NextPageContext }) => {
  const { req } = ctx;

  let newLocale = "en";

  if (req) {
    const { getLocale } = await import("@calcom/features/auth/lib/getLocale");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    newLocale = await getLocale(req as IncomingMessage & { cookies: Record<string, any> });
  } else if (typeof window !== "undefined" && window.calNewLocale) {
    newLocale = window.calNewLocale;
  }

  return {
    pageProps: {
      newLocale,
    },
  };
};

const WrappedMyApp = trpc.withTRPC(MyApp);

export default WrappedMyApp;
