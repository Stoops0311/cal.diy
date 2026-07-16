import { ErrorCode } from "@calcom/lib/errorCodes";
import { ErrorWithCode } from "@calcom/lib/errors";
import { describe, expect, it } from "vitest";
import { getEntitlementDenialFromError, parseEntitlementDenial } from "./entitlementDenial";

describe("parseEntitlementDenial", () => {
  it("returns a fresh capability denial", () => {
    const input = {
      kind: "capability",
      capability: "canCreateApiKeys",
      effectivePlan: "FREE",
    };

    const result = parseEntitlementDenial(input);

    expect(result).toEqual(input);
    expect(result).not.toBe(input);
  });

  it("returns a fresh limit denial", () => {
    const input = {
      kind: "limit",
      resource: "connectedCalendars",
      currentCount: 1,
      limit: 1,
      effectivePlan: "FREE",
    };

    const result = parseEntitlementDenial(input);

    expect(result).toEqual(input);
    expect(result).not.toBe(input);
  });

  it.each([
    {
      kind: "capability",
      capability: "notACapability",
      effectivePlan: "FREE",
    },
    {
      kind: "capability",
      capability: "canCreateApiKeys",
      effectivePlan: "ENTERPRISE",
    },
    {
      kind: "limit",
      resource: "notALimit",
      currentCount: 1,
      limit: 1,
      effectivePlan: "FREE",
    },
    {
      kind: "limit",
      resource: "connectedCalendars",
      currentCount: "1",
      limit: 1,
      effectivePlan: "FREE",
    },
    {
      kind: "limit",
      resource: "connectedCalendars",
      currentCount: 1,
      effectivePlan: "FREE",
    },
    {
      kind: "capability",
      capability: "canCreateApiKeys",
      effectivePlan: "FREE",
      provider: "polar",
    },
  ])("rejects malformed or non-allowlisted data %#", (input) => {
    expect(parseEntitlementDenial(input)).toBeNull();
  });
});

describe("getEntitlementDenialFromError", () => {
  it("recognizes an entitlement capability error", () => {
    const error = new ErrorWithCode(ErrorCode.EntitlementRequired, "Paid plan required", {
      capability: "canCreateApiKeys",
      effectivePlan: "FREE",
    });

    expect(getEntitlementDenialFromError(error)).toEqual({
      kind: "capability",
      capability: "canCreateApiKeys",
      effectivePlan: "FREE",
    });
  });

  it("recognizes an entitlement limit error", () => {
    const error = new ErrorWithCode(ErrorCode.EntitlementLimitExceeded, "Limit reached", {
      currentCount: 1,
      effectivePlan: "FREE",
      limit: 1,
      resource: "connectedCalendars",
    });

    expect(getEntitlementDenialFromError(error)).toEqual({
      kind: "limit",
      currentCount: 1,
      effectivePlan: "FREE",
      limit: 1,
      resource: "connectedCalendars",
    });
  });

  it.each([
    new ErrorWithCode(ErrorCode.Forbidden, "Paid plan required", {
      capability: "canCreateApiKeys",
      effectivePlan: "FREE",
    }),
    new ErrorWithCode(ErrorCode.Unauthorized, "Paid plan required", {
      capability: "canCreateApiKeys",
      effectivePlan: "FREE",
    }),
    new ErrorWithCode(ErrorCode.EntitlementRequired, "Paid plan required", {
      capability: "canCreateApiKeys",
      effectivePlan: "FREE",
      provider: "polar",
    }),
    new Error("This capability requires a paid plan"),
    {
      code: ErrorCode.EntitlementRequired,
      data: { capability: "canCreateApiKeys", effectivePlan: "FREE" },
      message: "Paid plan required",
    },
  ])("rejects non-entitlement, malformed, message-only, and structural errors %#", (error) => {
    expect(getEntitlementDenialFromError(error)).toBeNull();
  });
});
