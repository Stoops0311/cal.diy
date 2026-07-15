import { render, screen } from "@testing-library/react";
import { vi } from "vitest";
import MeetingUnavailable from "./videos-meeting-ended-single-view";

vi.mock("@calcom/lib/hooks/useLocale", () => ({
  useLocale: () => ({
    t: (key: string) => ({ event_is_in_the_past: "The event is in the past" })[key] ?? key,
  }),
}));

describe("MeetingUnavailable", () => {
  it("renders a page state rather than a modal impersonating a page", () => {
    render(
      <MeetingUnavailable
        booking={{
          title: "Decision review",
          startTime: "2026-07-13T08:00:00.000Z",
          endTime: "2026-07-13T08:15:00.000Z",
        }}
      />
    );

    expect(screen.getByRole("heading", { name: "The event is in the past" })).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
