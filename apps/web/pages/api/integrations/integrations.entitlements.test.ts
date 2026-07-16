import { ErrorCode } from "@calcom/lib/errorCodes";
import { ErrorWithCode } from "@calcom/lib/errors";
import type { NextApiRequest, NextApiResponse } from "next";
import { createMocks } from "node-mocks-http";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  assertCanConnectApp: vi.fn(),
  integrationHandler: vi.fn(),
}));

vi.mock("@calcom/features/auth/lib/getServerSession", () => ({
  getServerSession: () => Promise.resolve({ user: { id: 7 } }),
}));
vi.mock("@calcom/features/calendars/services/CalendarConnectionEntitlementService", () => ({
  CalendarConnectionEntitlementService: class {
    assertCanConnectApp = mocks.assertCanConnectApp;
  },
}));
vi.mock("@calcom/app-store/apps.metadata.generated", () => ({
  appStoreMetadata: { calendar: { categories: ["calendar"] } },
}));
vi.mock("@calcom/app-store/apps.server.generated", () => ({
  apiHandlers: { calendar: { add: mocks.integrationHandler } },
}));
vi.mock("@calcom/lib/deriveAppDictKeyFromType", () => ({
  deriveAppDictKeyFromType: () => "calendar",
}));

import handler from "./[...args]";

function createRequest() {
  return createMocks<NextApiRequest, NextApiResponse>({
    method: "POST",
    query: { args: ["calendar", "add"] },
  });
}

describe("calendar integration entitlement responses", () => {
  beforeEach(() => {
    mocks.assertCanConnectApp.mockReset();
    mocks.integrationHandler.mockReset();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  it("serializes an exact connected-calendar limit denial", async () => {
    mocks.assertCanConnectApp.mockRejectedValue(
      new ErrorWithCode(ErrorCode.EntitlementLimitExceeded, "Calendar limit reached", {
        currentCount: 1,
        effectivePlan: "FREE",
        limit: 1,
        resource: "connectedCalendars",
      })
    );
    const { req, res } = createRequest();

    await handler(req, res);

    expect(res.statusCode).toBe(403);
    expect(res._getJSONData()).toEqual({
      entitlement: {
        currentCount: 1,
        effectivePlan: "FREE",
        kind: "limit",
        limit: 1,
        resource: "connectedCalendars",
      },
      message: "Calendar limit reached",
    });
    expect(mocks.integrationHandler).not.toHaveBeenCalled();
  });

  it.each([
    ["generic authorization", new ErrorWithCode(ErrorCode.Forbidden, "Forbidden")],
    ["provider failure", new Error("Calendar limit reached")],
    [
      "malformed entitlement data",
      new ErrorWithCode(ErrorCode.EntitlementLimitExceeded, "Calendar limit reached", {
        currentCount: 1,
        effectivePlan: "FREE",
        limit: 1,
        providerToken: "private",
        resource: "connectedCalendars",
      }),
    ],
  ])("keeps %s responses message-only", async (_name, error) => {
    mocks.assertCanConnectApp.mockRejectedValue(error);
    const { req, res } = createRequest();

    await handler(req, res);

    expect(res._getJSONData()).toEqual({ message: error.message });
  });
});
