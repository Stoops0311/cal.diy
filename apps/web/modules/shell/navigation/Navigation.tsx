import { useMemo } from "react";
import UnconfirmedBookingBadge from "../../bookings/components/UnconfirmedBookingBadge";
import type { NavigationItemType } from "./NavigationItem";

const getNavigationItems = (): NavigationItemType[] => [
  {
    name: "event_types_page_title",
    href: "/event-types",
    icon: "link",
  },
  {
    name: "bookings",
    href: "/bookings/upcoming",
    icon: "calendar",
    badge: <UnconfirmedBookingBadge />,
    isCurrent: ({ pathname }) => pathname?.startsWith("/bookings") ?? false,
  },
  {
    name: "availability",
    href: "/availability",
    icon: "clock",
  },
  {
    name: "apps",
    href: "/apps",
    icon: "grid-3x3",
    isCurrent: ({ pathname: path, item }) => {
      // During Server rendering path is /v2/apps but on client it becomes /apps(weird..)
      return path?.startsWith(item.href) ?? false;
    },
  },
];

export const useNavigationItems = () => {
  return useMemo(() => ({ desktopNavigationItems: getNavigationItems() }), []);
};
