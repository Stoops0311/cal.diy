import { fireEvent, render, screen } from "@testing-library/react";
import { vi } from "vitest";
import { ConfirmationContent } from "./ConfirmationDialogContent";
import { Dialog, DialogClose, DialogContent, DialogFooter, DialogHeader, DialogTrigger } from "./Dialog";

vi.mock("@calcom/lib/hooks/useCompatSearchParams", () => ({
  useCompatSearchParams() {
    return new URLSearchParams();
  },
}));

vi.mock("next/navigation", () => ({
  usePathname() {
    return "";
  },
  useSearchParams() {
    return new URLSearchParams();
  },
  useRouter() {
    return {
      push: vi.fn(),
      beforePopState: vi.fn(() => null),
      prefetch: vi.fn(() => null),
    };
  },
}));

describe("Dialog", () => {
  const title = "Dialog Title";
  const subtitle = "Dialog Subtitle";
  const content = "Dialog Content";
  const footerContent = "Dialog Footer";

  const TestDialog = (props: {
    open?: boolean;
    title?: string;
    subtitle?: string;
    type?: "creation" | "confirmation";
    showDivider?: boolean;
    color?: "primary" | "secondary" | "minimal" | "destructive";
    preventCloseOnOutsideClick?: boolean;
    enableOverflow?: boolean;
  }) => (
    <Dialog open={props.open}>
      <DialogContent
        type={props.type}
        title={props.title}
        preventCloseOnOutsideClick={props.preventCloseOnOutsideClick}
        enableOverflow={props.enableOverflow}>
        <div className="flex flex-row space-x-4">
          <DialogHeader title={props.title} subtitle={props.subtitle} />
          <p>{content}</p>
          <DialogFooter showDivider={props.showDivider}>
            <DialogClose color={props.color}>{props.color ? "Custom Close" : undefined}</DialogClose>
            <p>{footerContent}</p>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );

  describe("Rendering", () => {
    it("renders without header when no title provided", () => {
      render(<TestDialog open />);

      expect(screen.queryByTestId("dialog-title")).not.toBeInTheDocument();
      expect(screen.getByText(content)).toBeInTheDocument();
    });

    it("renders creation type dialog", () => {
      render(<TestDialog open type="creation" />);

      expect(screen.getByTestId("dialog-creation")).toBeInTheDocument();
    });

    it("renders confirmation type dialog", () => {
      render(<TestDialog open type="confirmation" />);

      expect(screen.getByTestId("dialog-confirmation")).toBeInTheDocument();
    });

    it("keeps custom-layout dialogs named for assistive technology", () => {
      render(
        <Dialog open>
          <DialogContent type={null} title="Choose a time">
            <p>{content}</p>
          </DialogContent>
        </Dialog>
      );

      expect(screen.getByText("Choose a time")).toHaveClass("sr-only");
    });

    it("uses the visible heading as the dialog's accessible name", () => {
      render(
        <Dialog open>
          <DialogContent title="Create webhook">
            <p>{content}</p>
          </DialogContent>
        </Dialog>
      );

      expect(screen.getByRole("dialog", { name: "Create webhook" })).toBeInTheDocument();
    });

    it("lifts the dialog above the page with a distinct surface", () => {
      render(<TestDialog open />);

      expect(screen.getByRole("dialog")).toHaveClass("bg-subtle", "border-subtle", "overscroll-contain");
    });
  });

  describe("Visibility", () => {
    it("shows content when open", () => {
      render(<TestDialog open />);

      expect(screen.getByText(content)).toBeInTheDocument();
    });

    it("hides content when closed", () => {
      render(<TestDialog open={false} />);

      expect(screen.queryByText(content)).not.toBeInTheDocument();
    });

    it("toggles visibility with DialogTrigger", () => {
      render(
        <Dialog>
          <DialogTrigger asChild>
            <button>Open Dialog</button>
          </DialogTrigger>
          <DialogContent>
            <p>{content}</p>
          </DialogContent>
        </Dialog>
      );

      expect(screen.queryByText(content)).not.toBeInTheDocument();
      fireEvent.click(screen.getByText("Open Dialog"));
      expect(screen.getByText(content)).toBeInTheDocument();
    });
  });

  describe("Footer", () => {
    it("shows divider when showDivider is true", () => {
      render(<TestDialog open showDivider />);

      expect(screen.getByTestId("divider")).toBeInTheDocument();
    });

    it("uses a contrasting action plane", () => {
      render(<TestDialog open />);

      expect(screen.getByTestId("dialog-footer")).toHaveClass("bg-default", "border-t");
    });
  });

  describe("Behavior", () => {
    it("enables overflow when enableOverflow is true", () => {
      render(<TestDialog open enableOverflow />);

      const dialogContent = screen.getByRole("dialog");
      expect(dialogContent.className).toContain("overflow-y-auto");
    });
  });

  describe("Confirmation", () => {
    it("keeps destructive confirmation actions semantically red", () => {
      render(
        <Dialog open>
          <DialogContent>
            <ConfirmationContent title="Delete account" variety="danger">
              This cannot be undone.
            </ConfirmationContent>
          </DialogContent>
        </Dialog>
      );

      expect(screen.getByTestId("dialog-confirmation")).toHaveClass("text-error");
    });
  });
});
