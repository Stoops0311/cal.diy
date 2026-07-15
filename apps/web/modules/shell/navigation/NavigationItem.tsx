import type { IconName } from "@calcom/ui/components/icon";
import type React from "react";

export type NavigationItemType = {
  name: string;
  href: string;
  isLoading?: boolean;
  onClick?: React.MouseEventHandler<HTMLAnchorElement | HTMLButtonElement>;
  target?: HTMLAnchorElement["target"];
  badge?: React.ReactNode;
  icon?: IconName;
  isCurrent?: ({
    item,
    pathname,
  }: {
    item: Pick<NavigationItemType, "href">;
    pathname: string | null;
  }) => boolean;
};
