import { ShellMainAppDirBackButton } from "app/(use-page-wrapper)/(main-nav)/ShellMainAppDirBackButton";
import classNames from "classnames";
import type { LayoutProps } from "~/shell/Shell";

// Copied from `ShellMain` but with a different `ShellMainAppDirBackButton` import
// for client/server component separation
export function ShellMainAppDir(props: LayoutProps) {
  return (
    <>
      {(props.heading || !!props.backPath) && (
        <div
          className={classNames(
            "border-subtle mb-4 flex items-center border-b pb-3 md:mb-6 md:mt-0 md:pb-4",
            props.smallHeading ? "lg:mb-7" : "lg:mb-8"
          )}>
          {!!props.backPath && <ShellMainAppDirBackButton backPath={props.backPath} />}
          {props.heading && (
            <header
              className={classNames(
                props.large && "py-8",
                "flex w-full max-w-full items-center flex-wrap md:flex-nowrap gap-2 md:gap-0"
              )}>
              {props.HeadingLeftIcon && <div className="ltr:mr-4">{props.HeadingLeftIcon}</div>}
              <div className={classNames("min-w-0 flex-1 ltr:mr-4 rtl:ml-4 md:block", props.headerClassName)}>
                {props.eyebrow && (
                  <p className="text-subtle font-mono text-[11px] uppercase tracking-[0.18em]">
                    {props.eyebrow}
                  </p>
                )}
                {props.heading && (
                  <h1
                    className={classNames(
                      "font-cal text-emphasis truncate font-bold tracking-tight xl:max-w-full",
                      props.smallHeading ? "text-base" : "text-xl sm:text-2xl"
                    )}>
                    {props.heading}
                  </h1>
                )}
                {props.subtitle && (
                  <p className="text-subtle hidden text-sm md:block" data-testid="subtitle">
                    {props.subtitle}
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
                  {props.CTA}
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
