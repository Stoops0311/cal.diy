"use client";

import classNames from "@calcom/ui/classNames";
import { Button, type ButtonProps } from "@calcom/ui/components/button";
import { Icon, type IconName } from "@calcom/ui/components/icon";
import type { Table } from "@tanstack/react-table";
import { forwardRef, useEffect, useState } from "react";
import { createPortal } from "react-dom";

export type ActionItem<TData> =
  | {
      type: "action";
      label: string;
      onClick: () => void;
      icon?: IconName;
      needsXSelected?: number;
    }
  | {
      type: "render";
      render: (table: Table<TData>) => React.ReactNode;
      needsXSelected?: number;
    };

type ResponsiveButtonProps = {
  className?: string;
  icon: IconName;
  onClick?: () => void;
  children: string;
} & ButtonProps;

const ResponsiveButton = forwardRef<HTMLButtonElement, ResponsiveButtonProps>(
  ({ icon, onClick, children, ...rest }, ref) => {
    return (
      <Button ref={ref} onClick={onClick} title={children} {...rest}>
        <Icon name={icon} size={18} className="sm:hidden" />
        <Icon name={icon} size={16} className="mr-2 hidden shrink-0 sm:inline" />
        <span className="sr-only shrink-0 md:not-sr-only">{children}</span>
      </Button>
    );
  }
);

ResponsiveButton.displayName = "ResponsiveButton";

const Root = forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & { showSelectionCount?: boolean }
>(({ children, ...props }, ref) => {
  const { className, style, ...rest } = props;
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null);

  useEffect(() => {
    setPortalTarget(document.body);
  }, []);

  if (!portalTarget) return null;

  return createPortal(
    <div
      ref={ref}
      className={classNames(
        "bg-default text-emphasis border-subtle fixed left-0 right-0 flex items-center space-x-1 overflow-x-auto rounded-2xl border px-2 py-2 shadow-xl sm:space-x-2 md:left-1/2 md:z-auto md:w-fit md:-translate-x-1/2 md:transform md:space-x-3 md:overflow-x-hidden md:px-4",
        className
      )}
      style={{ ...style }}
      {...rest}>
      {children}
    </div>,
    portalTarget
  );
});

Root.displayName = "Root";

export const DataTableSelectionBar = {
  Root,
  Button: ResponsiveButton,
};
