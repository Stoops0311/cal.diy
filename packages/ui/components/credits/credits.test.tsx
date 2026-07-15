/* eslint-disable playwright/missing-playwright-await */
import { render, screen } from "@testing-library/react";
import { vi } from "vitest";
import Credits from "./Credits";

vi.mock("@calcom/lib/constants", async () => {
  const actual = (await vi.importActual("@calcom/lib/constants")) as typeof import("@calcom/lib/constants");
  return {
    ...actual,
    CALCOM_VERSION: "mockedVersion",
    COMPANY_NAME: "Convenio",
  };
});

describe("Tests for Credits component", () => {
  test("Should render company name and version", () => {
    render(<Credits />);

    expect(screen.getByText(/Convenio/i)).toBeInTheDocument();
    expect(screen.getByText(/mockedVersion/i)).toBeInTheDocument();
  });

  test("Should render copyright with current year", () => {
    render(<Credits />);

    const currentYear = new Date().getFullYear();
    expect(screen.getByText(new RegExp(`${currentYear}`))).toBeInTheDocument();
  });
});
