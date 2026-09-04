import { render } from "@testing-library/react";
import { expect, test, vi } from "vitest";

vi.mock("@calcom/features/auth/lib/useCurrentSession", () => ({
  useCurrentSession: () => ({ data: null, status: "unauthenticated" }),
}));

vi.mock("@calcom/embed-core/embed-iframe", () => ({
  useIsEmbed: () => false,
}));

vi.mock("@calcom/lib/hooks/useIsStandalone", () => ({
  useIsStandalone: () => false,
}));

import { DockContainer } from "./Dock";

test("renders outside a NextAuth session provider", () => {
  expect(() => render(<DockContainer />)).not.toThrow();
});
