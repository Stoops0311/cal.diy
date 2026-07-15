import { describe, expect, it } from "vitest";
import { generateTOTP } from "./totp";

const rfcSecret = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";

describe("Clerk E2E TOTP generator", () => {
  it.each([
    [59_000, "94287082"],
    [1_111_111_109_000, "07081804"],
    [1_111_111_111_000, "14050471"],
    [1_234_567_890_000, "89005924"],
    [2_000_000_000_000, "69279037"],
    [20_000_000_000_000, "65353130"],
  ])("matches RFC 6238 at %i milliseconds", (timestamp, expected) => {
    expect(generateTOTP(rfcSecret, timestamp, 8)).toBe(expected);
  });

  it("normalizes spaces and base32 padding", () => {
    expect(generateTOTP("GEZD GNBV GY3T QOJQ GEZD GNBV GY3T QOJQ ====", 59_000, 8)).toBe("94287082");
  });
});
