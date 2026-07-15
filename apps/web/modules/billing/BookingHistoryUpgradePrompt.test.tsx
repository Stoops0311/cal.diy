import { fireEvent, render, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ openUpgradePrompt: vi.fn() }));

vi.mock("@calcom/lib/hooks/useLocale", () => ({
  useLocale: () => ({
    t: (key: string) =>
      ({
        billing_upgrade_booking_audit_description:
          "Keep the decisions behind every booking visible to the people responsible for it.",
        billing_upgrade_booking_audit_title: "Booking history belongs in Team.",
        billing_upgrade_choose_team: "Choose Team",
        booking_history: "Booking history",
      })[key] ?? key,
  }),
}));

vi.mock("./UpgradePromptProvider", () => ({
  useUpgradePrompt: () => ({ openUpgradePrompt: mocks.openUpgradePrompt }),
}));

import { BookingHistoryUpgradePrompt } from "./BookingHistoryUpgradePrompt";

const request = {
  capability: "bookingAudit",
  featureName: "Booking history",
  requiredPlan: "TEAM",
  returnTo: "/booking/book_123/logs",
  resume: { kind: "openBookingAudit", bookingUid: "book_123" },
};

describe("BookingHistoryUpgradePrompt", () => {
  beforeEach(() => mocks.openUpgradePrompt.mockReset());

  it("opens the Team prompt in context and leaves a visible way to reopen it", async () => {
    const view = render(<BookingHistoryUpgradePrompt bookingUid="book_123" />);

    await waitFor(() => expect(mocks.openUpgradePrompt).toHaveBeenCalledWith(request));
    expect(view.getByText("Booking history belongs in Team.")).toBeInTheDocument();
    expect(
      view.getByText("Keep the decisions behind every booking visible to the people responsible for it.")
    ).toBeInTheDocument();

    mocks.openUpgradePrompt.mockClear();
    fireEvent.click(view.getByRole("button", { name: "Choose Team" }));
    expect(mocks.openUpgradePrompt).toHaveBeenCalledWith(request);
  });

  it("encodes reserved route characters without changing the resume booking UID", async () => {
    render(<BookingHistoryUpgradePrompt bookingUid="book/123 ?" />);

    await waitFor(() =>
      expect(mocks.openUpgradePrompt).toHaveBeenCalledWith({
        ...request,
        returnTo: "/booking/book%2F123%20%3F/logs",
        resume: { kind: "openBookingAudit", bookingUid: "book/123 ?" },
      })
    );
  });
});
