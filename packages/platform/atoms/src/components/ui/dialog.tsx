/* 
In this file we can edit all the Primitives from radix-ui/react-dialog
when building atoms package this will automatically replace the DialogPrimitives used in components from all over the monorepo
ensuring that we don't have issues with atoms.
*/

import { useLocale } from "@calcom/lib/hooks/useLocale";
import { XIcon } from "@coss/ui/icons";
import * as DialogPrimitives from "@radix-ui/react-dialog-atoms";
import * as React from "react";
import { cn } from "../../lib/utils";

const Dialog = DialogPrimitives.Root;

const DialogTrigger = DialogPrimitives.Trigger;

const DialogPortal = DialogPrimitives.Portal;

const DialogClose = DialogPrimitives.Close;

const Portal = ({ children }: { children: React.ReactElement | React.ReactElement[] }) => {
  return (
    <DialogPrimitives.Portal className="calcom-atoms">
      <div className="calcom-atoms">{children}</div>
    </DialogPrimitives.Portal>
  );
};
const Root = DialogPrimitives.Root;
const Trigger = DialogPrimitives.Trigger;
const Overlay = DialogPrimitives.Overlay;
const Content = DialogPrimitives.Content;
const Title = DialogPrimitives.Title;
const Description = DialogPrimitives.Description;

const Close = DialogPrimitives.Close;

const DialogOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitives.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitives.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitives.Overlay
    ref={ref}
    className={cn(
      "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 fixed inset-0 z-50 bg-overlay motion-reduce:animate-none",
      className
    )}
    {...props}
  />
));
DialogOverlay.displayName = DialogPrimitives.Overlay.displayName;

const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitives.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitives.Content>
>(({ className, children, ...props }, ref) => {
  const { t } = useLocale();

  return (
    <DialogPortal>
      <div className="calcom-atoms">
        <DialogOverlay />
        <DialogPrimitives.Content
          ref={ref}
          className={cn(
            "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 fixed top-1/2 left-1/2 z-50 grid max-h-[min(90vh,760px)] w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 gap-4 overflow-y-auto rounded-2xl border border-subtle bg-subtle p-6 shadow-xl duration-200 motion-reduce:animate-none sm:p-7",
            className
          )}
          {...props}>
          {children}
          <DialogPrimitives.Close
            className="absolute top-4 right-4 rounded-md p-1.5 text-subtle transition-colors hover:bg-muted hover:text-emphasis focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emphasis disabled:pointer-events-none"
            aria-label={t("close")}>
            <XIcon className="h-4 w-4" aria-hidden="true" />
          </DialogPrimitives.Close>
        </DialogPrimitives.Content>
      </div>
    </DialogPortal>
  );
});
DialogContent.displayName = DialogPrimitives.Content.displayName;

const DialogHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("flex flex-col stack-y-1.5 text-center sm:text-left", className)} {...props} />
);
DialogHeader.displayName = "DialogHeader";

const DialogFooter = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn("flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2", className)}
    {...props}
  />
);
DialogFooter.displayName = "DialogFooter";

const DialogTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitives.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitives.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitives.Title
    ref={ref}
    className={cn("text-lg font-semibold leading-none tracking-tight", className)}
    {...props}
  />
));
DialogTitle.displayName = DialogPrimitives.Title.displayName;

const DialogDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitives.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitives.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitives.Description
    ref={ref}
    className={cn("text-muted-foreground text-sm", className)}
    {...props}
  />
));
DialogDescription.displayName = DialogPrimitives.Description.displayName;

export {
  Dialog,
  DialogPortal,
  DialogOverlay,
  DialogClose,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
  Portal,
  Root,
  Overlay,
  Trigger,
  Close,
  Content,
  Description,
  Title,
};
