import { describe, expect, it } from "vitest";
import {
  isMissingProviderObject,
  isTerminalPolarSubscriptionValidation,
  parseCleanupArguments,
} from "./cleanup-clerk-polar-e2e";

describe("cleanup Clerk and Polar E2E CLI", () => {
  it("requires one exact run tag", () => {
    expect(() => parseCleanupArguments([])).toThrow("--run-tag is required");
    expect(() => parseCleanupArguments(["--run-tag=convenio-e2e"])).toThrow("invalid E2E run tag");
    expect(() =>
      parseCleanupArguments([
        "--run-tag=convenio-e2e-20260715T120000Z-ab12cd",
        "--run-tag=convenio-e2e-20260715T120001Z-cd34ef",
      ])
    ).toThrow("exactly one --run-tag");
  });

  it("accepts only the tagged fixture namespace", () => {
    expect(parseCleanupArguments(["--run-tag=convenio-e2e-20260715T120000Z-ab12cd"])).toEqual({
      runTag: "convenio-e2e-20260715T120000Z-ab12cd",
    });
  });

  it("recognizes missing objects from Clerk and Polar error shapes", () => {
    expect(isMissingProviderObject({ status: 404 })).toBe(true);
    expect(isMissingProviderObject({ statusCode: 404 })).toBe(true);
    expect(isMissingProviderObject({ name: "ResourceNotFound" })).toBe(true);
    expect(isMissingProviderObject({ response$: { status: 404 } })).toBe(true);
    expect(isMissingProviderObject({ response$: { status: 500 } })).toBe(false);
  });

  it("treats only the exact terminal Polar subscription validation response as absent", () => {
    const error = {
      name: "ResponseValidationError",
      rawValue: { ended_at: "2026-07-15T13:44:06Z", id: "sub_fixture", status: "canceled" },
      statusCode: 200,
    };

    expect(isTerminalPolarSubscriptionValidation(error, "sub_fixture")).toBe(true);
    expect(isTerminalPolarSubscriptionValidation(error, "sub_different")).toBe(false);
    expect(
      isTerminalPolarSubscriptionValidation(
        { ...error, rawValue: { ...error.rawValue, status: "active" } },
        "sub_fixture"
      )
    ).toBe(false);
    expect(isTerminalPolarSubscriptionValidation({ ...error, statusCode: 500 }, "sub_fixture")).toBe(false);
  });
});
