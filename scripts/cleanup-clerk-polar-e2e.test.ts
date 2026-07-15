import { describe, expect, it } from "vitest";
import { parseCleanupArguments } from "./cleanup-clerk-polar-e2e";

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
});
