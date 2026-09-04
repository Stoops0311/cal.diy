import { beforeEach, describe, expect, test, vi } from "vitest";

const { createRouterCaller, getTRPCContext, getBilling, redirect } = vi.hoisted(() => ({
  createRouterCaller: vi.fn(),
  getTRPCContext: vi.fn(),
  getBilling: vi.fn(),
  redirect: vi.fn(),
}));

vi.mock("@calcom/trpc/server/routers/viewer/billing/_router", () => ({ billingRouter: {} }));
vi.mock("app/_trpc/context", () => ({ createRouterCaller, getTRPCContext }));
vi.mock("app/_utils", () => ({ _generateMetadata: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect }));
vi.mock("@calcom/web/modules/billing/BillingSettings", () => ({ BillingSettings: vi.fn() }));

import BillingPage from "./page";

describe("BillingPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createRouterCaller.mockResolvedValue({ get: getBilling });
    getBilling.mockResolvedValue({ plan: "FREE" });
  });

  test("accepts an authenticated session from the App Router tRPC context", async () => {
    getTRPCContext.mockResolvedValue({ session: { user: { id: 7 } } });

    await BillingPage({ searchParams: Promise.resolve({}) });

    expect(redirect).not.toHaveBeenCalled();
    expect(getBilling).toHaveBeenCalledWith({});
  });
});
