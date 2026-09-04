"use client";

import { useIsEmbed } from "@calcom/embed-core/embed-iframe";
import { useCurrentSession as useSession } from "@calcom/features/auth/lib/useCurrentSession";
import { WEBAPP_URL } from "@calcom/lib/constants";
import { useIsStandalone } from "@calcom/lib/hooks/useIsStandalone";
import { useLocale } from "@calcom/lib/hooks/useLocale";
import classNames from "@calcom/ui/classNames";
import { Icon } from "@calcom/ui/components/icon";
import { Tooltip } from "@calcom/ui/components/tooltip";
import { Menu, MenuItem, MenuPopup, MenuTrigger } from "@coss/ui/components/menu";
import { useKBar } from "kbar";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { User as UserAuth } from "next-auth";
import posthog from "posthog-js";
import { useEffect, useState } from "react";
import { useNavigationItems } from "./navigation/Navigation";
import type { NavigationItemType } from "./navigation/NavigationItem";
import { useShouldDisplayNavigationItem } from "./navigation/useShouldDisplayNavigationItem";
import { useBottomNavItems } from "./useBottomNavItems";
import { UserDropdown } from "./user-dropdown/UserDropdown";

export function DockContainer() {
  const { status, data } = useSession();
  const isStandalone = useIsStandalone();
  const isEmbed = useIsEmbed();

  // Rendered optimistically while the session loads, mirroring the old sidebar,
  // so a refresh of SSG pages shows navigation immediately.
  if (status !== "loading" && status !== "authenticated") return null;
  if (isStandalone || isEmbed) return null;
  return <Dock user={data?.user} />;
}

/**
 * Recedes the dock while the user scrolls down through content and restores it
 * on any scroll up, so it never sits on top of what they are reading.
 */
function useDockReceded() {
  const [receded, setReceded] = useState(false);

  useEffect(() => {
    let lastY = window.scrollY;
    const onScroll = () => {
      const y = window.scrollY;
      if (Math.abs(y - lastY) < 8) return;
      setReceded(y > lastY && y > 160);
      lastY = y;
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return receded;
}

const dockItemClasses = (current: boolean) =>
  classNames(
    "relative flex h-11 w-11 items-center justify-center rounded-full",
    "transition-[transform,background-color] duration-150 ease-out motion-reduce:transform-none",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-default/70",
    current
      ? "bg-default text-emphasis"
      : "text-inverted/75 hover:scale-110 hover:bg-default/15 hover:text-inverted"
  );

const defaultIsCurrent = ({ item, pathname }: { item: { href: string }; pathname: string | null }) =>
  item.href ? (pathname?.startsWith(item.href) ?? false) : false;

function DockNavItem({ item }: { item: NavigationItemType }) {
  const { t } = useLocale();
  const pathname = usePathname();
  const shouldDisplay = useShouldDisplayNavigationItem(item);

  if (!shouldDisplay) return null;

  const current = (item.isCurrent ?? defaultIsCurrent)({ item, pathname });

  return (
    <span className="relative">
      <Tooltip side="top" content={t(item.name)}>
        <Link
          href={item.href}
          target={item.target}
          data-testid={`dock-${item.name}`}
          aria-label={t(item.name)}
          aria-current={current ? "page" : undefined}
          onClick={() => posthog.capture("navigation_item_clicked", { item_name: item.name })}
          className={dockItemClasses(current)}>
          {item.icon && <Icon name={item.icon} className="h-5 w-5 shrink-0" aria-hidden="true" />}
        </Link>
      </Tooltip>
      {item.badge && <span className="absolute -right-1 -top-1">{item.badge}</span>}
    </span>
  );
}

function DockDivider() {
  return <span aria-hidden="true" className="mx-1 hidden h-6 w-px shrink-0 bg-default/25 sm:block" />;
}

/** The Convenio mark: two arcs converging to a single point. */
function ConvergenceMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      aria-hidden="true"
      className={className}>
      <path d="M4 5c8 0 14 2.8 16 7" />
      <path d="M4 19c8 0 14-2.8 16-7" />
    </svg>
  );
}

function DockMoreMenu({ items }: { items: NavigationItemType[] }) {
  const { t } = useLocale();

  return (
    <Menu>
      <MenuTrigger
        render={
          <button
            type="button"
            aria-label={t("more")}
            data-testid="dock-more"
            className={dockItemClasses(false)}
          />
        }>
        <Icon name="ellipsis" className="h-5 w-5 shrink-0" aria-hidden="true" />
      </MenuTrigger>
      <MenuPopup align="end">
        {items.map((item) =>
          item.href ? (
            <MenuItem
              key={item.name}
              render={<Link href={item.href} target={item.target} onClick={item.onClick} />}>
              {item.icon && <Icon name={item.icon} />}
              {t(item.name)}
            </MenuItem>
          ) : (
            <MenuItem key={item.name} onClick={item.onClick}>
              {item.icon && <Icon name={item.icon} />}
              {t(item.name)}
            </MenuItem>
          )
        )}
      </MenuPopup>
    </Menu>
  );
}

function DockSearch() {
  const { t } = useLocale();
  const { query } = useKBar();

  if (!query) return null;

  return (
    <Tooltip side="top" content={`${t("search")} ⌘K`}>
      <button
        type="button"
        aria-label={t("search")}
        data-testid="dock-search"
        onClick={query.toggle}
        className={dockItemClasses(false)}>
        <Icon name="search" className="h-5 w-5 shrink-0" aria-hidden="true" />
      </button>
    </Tooltip>
  );
}

export function Dock({ user }: { user?: UserAuth | null }) {
  const { t } = useLocale();
  const { desktopNavigationItems } = useNavigationItems();
  const receded = useDockReceded();

  const publicPageUrl = `${WEBAPP_URL}/${user?.orgAwareUsername}`;
  const moreItems = useBottomNavItems({ publicPageUrl });

  return (
    <nav
      aria-label={t("primary_navigation")}
      data-testid="dock"
      className={classNames(
        "fixed inset-x-0 z-30 mx-auto w-fit",
        "bottom-[max(1rem,env(safe-area-inset-bottom))]",
        "transition-transform duration-200 ease-out",
        "motion-reduce:!translate-y-0 motion-reduce:transition-none",
        "focus-within:translate-y-0 hover:translate-y-0",
        receded ? "translate-y-[calc(100%+2px)]" : "translate-y-0"
      )}>
      <div className="bg-inverted text-inverted shadow-dropdown flex items-center gap-0.5 rounded-full p-1.5">
        <Tooltip side="top" content="Convenio">
          <Link
            href="/event-types"
            aria-label="Convenio"
            className={classNames(dockItemClasses(false), "hidden hover:bg-transparent sm:flex")}>
            <ConvergenceMark className="h-5 w-5" />
          </Link>
        </Tooltip>
        <DockDivider />
        {desktopNavigationItems.map((item) => (
          <DockNavItem key={item.name} item={item} />
        ))}
        <DockDivider />
        <DockSearch />
        <DockMoreMenu items={moreItems} />
        <UserDropdown dock />
      </div>
    </nav>
  );
}
