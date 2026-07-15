"use client";

import { useCurrentSession as useSession } from "@calcom/features/auth/lib/useCurrentSession";
import { useLocale } from "@calcom/lib/hooks/useLocale";
import classNames from "@calcom/ui/classNames";
import { Button } from "@calcom/ui/components/button";
import { ErrorBoundary } from "@calcom/ui/components/errorBoundary";
import { SkeletonText } from "@calcom/ui/components/skeleton";
import { useRedirectToLoginIfUnauthenticated } from "@calcom/web/modules/auth/hooks/useRedirectToLoginIfUnauthenticated";
import { useRedirectToOnboardingIfNeeded } from "@calcom/web/modules/auth/hooks/useRedirectToOnboardingIfNeeded";
import { BillingStatusWidget } from "@calcom/web/modules/billing/BillingStatusWidget";
import { UpgradePromptProvider } from "@calcom/web/modules/billing/UpgradePromptProvider";
import { useFormbricks } from "@calcom/web/modules/formbricks/hooks/useFormbricks";
import { useRouter } from "next/navigation";
import type React from "react";
import type { Dispatch, ReactElement, ReactNode, SetStateAction } from "react";
import { cloneElement } from "react";
import { Toaster } from "sonner";
import { BannerContainer } from "./banners/LayoutBanner";
import { useBanners } from "./banners/useBanners";
import { DockContainer } from "./Dock";
import { DynamicModals } from "./DynamicModals";
import { KBarContent, KBarRoot } from "./Kbar";
import { useAppTheme } from "./useAppTheme";

type InternalLayoutProps = LayoutProps & { billingStatus?: ReactNode };

const Layout = (props: InternalLayoutProps) => {
  const { banners, bannersHeight } = useBanners();

  useFormbricks();

  return (
    <>
      <div>
        <Toaster position="bottom-right" />
      </div>

      <DynamicModals />

      <div className="flex min-h-screen flex-col">
        {banners && <BannerContainer banners={banners} />}

        <div className="flex flex-1" data-testid="dashboard-shell">
          {props.SidebarContainer && cloneElement(props.SidebarContainer, { bannersHeight })}
          <div className="flex w-0 flex-1 flex-col">
            <MainContainer {...props} />
          </div>
        </div>
      </div>

      <DockContainer />
    </>
  );
};

type DrawerState = [isOpen: boolean, setDrawerOpen: Dispatch<SetStateAction<boolean>>];

export type LayoutProps = {
  centered?: boolean;
  title?: string;
  description?: string;
  heading?: ReactNode;
  /** Short uppercase mono label rendered above the heading (masthead grammar). */
  eyebrow?: ReactNode;
  subtitle?: ReactNode;
  headerClassName?: string;
  children: ReactNode;
  CTA?: ReactNode;
  large?: boolean;
  SidebarContainer?: ReactElement;
  TopNavContainer?: ReactNode;
  drawerState?: DrawerState;
  HeadingLeftIcon?: ReactNode;
  backPath?: string | boolean; // renders back button to specified path
  // use when content needs to expand with flex
  flexChildrenContainer?: boolean;
  isPublic?: boolean;
  withoutMain?: boolean;
  // Gives the ability to include actions to the right of the heading
  actions?: JSX.Element;
  beforeCTAactions?: JSX.Element;
  afterHeading?: ReactNode;
  smallHeading?: boolean;
  disableSticky?: boolean;
};

const KBarWrapper = ({ children, withKBar = false }: { withKBar: boolean; children: React.ReactNode }) =>
  withKBar ? (
    <KBarRoot>
      {children}
      <KBarContent />
    </KBarRoot>
  ) : (
    <>{children}</>
  );

const PublicShell = (props: LayoutProps) => {
  const { status } = useSession();
  return (
    <KBarWrapper withKBar={status === "authenticated"}>
      <Layout {...props} />
    </KBarWrapper>
  );
};

export default function Shell(props: LayoutProps) {
  // if a page is unauthed and isPublic is true, the redirect does not happen.
  useRedirectToLoginIfUnauthenticated(props.isPublic);
  useRedirectToOnboardingIfNeeded();
  useAppTheme();

  return !props.isPublic ? (
    <UpgradePromptProvider>
      <KBarWrapper withKBar>
        <Layout {...props} billingStatus={<BillingStatusWidget />} />
      </KBarWrapper>
    </UpgradePromptProvider>
  ) : (
    <PublicShell {...props} />
  );
}

export function ShellMain(props: LayoutProps) {
  const router = useRouter();
  const { isLocaleReady, t } = useLocale();

  return (
    <>
      {(props.heading || !!props.backPath) && (
        <div
          className={classNames(
            "bg-default border-subtle mb-4 flex items-center border-b pb-3 md:mb-6 md:mt-0 md:pb-4",
            props.smallHeading ? "lg:mb-7" : "lg:mb-8",
            !props.disableSticky && "sticky top-0 z-10"
          )}>
          {!!props.backPath && (
            <Button
              variant="icon"
              size="sm"
              color="minimal"
              onClick={() =>
                typeof props.backPath === "string" ? router.push(props.backPath as string) : router.back()
              }
              StartIcon="arrow-left"
              aria-label={t("go_back")}
              className="rounded-md ltr:mr-2 rtl:ml-2"
              data-testid="go-back-button"
            />
          )}
          {props.heading && (
            <header
              className={classNames(props.large && "py-8", "flex w-full max-w-full items-center truncate")}>
              {props.HeadingLeftIcon && <div className="ltr:mr-4">{props.HeadingLeftIcon}</div>}
              <div
                className={classNames("w-full truncate ltr:mr-4 rtl:ml-4 md:block", props.headerClassName)}>
                {props.eyebrow && (
                  <p className="text-subtle font-mono text-[11px] uppercase tracking-[0.18em]">
                    {!isLocaleReady ? <SkeletonText invisible /> : props.eyebrow}
                  </p>
                )}
                {props.heading && (
                  <h1
                    className={classNames(
                      "font-cal text-emphasis truncate font-bold tracking-tight xl:max-w-full",
                      props.smallHeading ? "text-base" : "text-xl sm:text-2xl"
                    )}>
                    {!isLocaleReady ? <SkeletonText invisible /> : props.heading}
                  </h1>
                )}
                {props.subtitle && (
                  <p className="text-subtle hidden text-sm md:block" data-testid="subtitle">
                    {!isLocaleReady ? <SkeletonText invisible /> : props.subtitle}
                  </p>
                )}
              </div>
              {props.beforeCTAactions}
              {props.CTA && (
                <div
                  className={classNames(
                    props.backPath
                      ? "relative"
                      : "pwa:bottom-[max(7rem,_calc(5rem_+_env(safe-area-inset-bottom)))] fixed bottom-20 z-40 ltr:right-4 rtl:left-4 md:z-auto md:ltr:right-0 md:rtl:left-0",
                    "shrink-0 [-webkit-app-region:no-drag] md:relative md:bottom-auto md:right-auto"
                  )}>
                  {isLocaleReady && props.CTA}
                </div>
              )}
              {props.actions && props.actions}
            </header>
          )}
        </div>
      )}
      {props.afterHeading && <>{props.afterHeading}</>}
      <div className={classNames(props.flexChildrenContainer && "flex flex-1 flex-col")}>
        {props.children}
      </div>
    </>
  );
}

function MainContainer({
  TopNavContainer: TopNavContainerProp = null,
  billingStatus,
  ...props
}: InternalLayoutProps) {
  return (
    <main className="bg-default relative z-0 flex-1 focus:outline-none">
      {TopNavContainerProp}
      {/* bottom padding keeps the floating dock clear of interactive content */}
      <div className="mx-auto max-w-[1200px] p-2 pb-28 sm:p-4 sm:pb-28 lg:p-6 lg:pb-28">
        <ErrorBoundary>
          {!props.withoutMain ? <ShellMain {...props}>{props.children}</ShellMain> : props.children}
        </ErrorBoundary>
        {billingStatus}
      </div>
    </main>
  );
}
