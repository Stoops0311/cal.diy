import {
  type EntitlementDeniedHandler,
  EntitlementUpgradeBridgeProvider,
} from "@calcom/app-store/_utils/EntitlementUpgradeBridge";
import { TooltipProvider } from "@radix-ui/react-tooltip";
import { fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentType, ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  back: vi.fn(),
  push: vi.fn(),
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ back: mocks.back, push: mocks.push }) }));
vi.mock("@calcom/lib/hooks/useLocale", () => ({
  useLocale: () => ({ t: (key: string) => key }),
}));
vi.mock("@calcom/web/components/apps/SetupShell", () => ({
  default: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

import AppleCalendarSetup from "./applecalendar/Setup";
import CalDavCalendarSetup from "./caldavcalendar/Setup";
import Exchange2013CalendarSetup from "./exchange2013calendar/Setup";
import Exchange2016CalendarSetup from "./exchange2016calendar/Setup";
import ExchangeSetup from "./exchangecalendar/Setup";
import ICSFeedSetup from "./ics-feedcalendar/Setup";
import { useCalendarIntegrationFetch } from "./useCalendarIntegrationFetch";

const denial = {
  currentCount: 1,
  effectivePlan: "FREE",
  kind: "limit",
  limit: 1,
  resource: "connectedCalendars",
} as const;

function response(body: unknown, status = 403): Response {
  return new Response(JSON.stringify(body), {
    headers: { "Content-Type": "application/json" },
    status,
  });
}

function bridge(handler: EntitlementDeniedHandler) {
  return function Bridge({ children }: { children: ReactNode }) {
    return (
      <EntitlementUpgradeBridgeProvider onEntitlementDenied={handler}>
        {children}
      </EntitlementUpgradeBridgeProvider>
    );
  };
}

beforeEach(() => {
  mocks.back.mockReset();
  mocks.push.mockReset();
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => vi.unstubAllGlobals());

describe("useCalendarIntegrationFetch", () => {
  it("notifies for an exact calendar limit without consuming the response", async () => {
    vi.mocked(fetch).mockResolvedValue(response({ entitlement: denial, message: "Calendar limit reached" }));
    const handler = vi.fn();
    const { result } = renderHook(() => useCalendarIntegrationFetch(), { wrapper: bridge(handler) });

    const resultResponse = await result.current("/api/integrations/calendar/add");

    expect(handler).toHaveBeenCalledOnce();
    expect(handler).toHaveBeenCalledWith(denial);
    await expect(resultResponse.json()).resolves.toEqual({
      entitlement: denial,
      message: "Calendar limit reached",
    });
  });

  it.each([
    ["generic forbidden", response({ message: "Forbidden" })],
    ["provider failure", response({ message: "Provider unavailable", provider: "private" }, 500)],
    ["message-like failure", response({ message: "Another calendar belongs in Pro" })],
    ["wrong resource", response({ entitlement: { ...denial, resource: "activePersonalEventTypes" } })],
    ["extra denial data", response({ entitlement: { ...denial, providerToken: "private" } })],
    ["invalid JSON", new Response("not-json", { status: 500 })],
  ])("ignores a %s response", async (_name, failedResponse) => {
    vi.mocked(fetch).mockResolvedValue(failedResponse);
    const handler = vi.fn();
    const { result } = renderHook(() => useCalendarIntegrationFetch(), { wrapper: bridge(handler) });

    expect(await result.current("/api/integrations/calendar/add")).toBe(failedResponse);
    expect(handler).not.toHaveBeenCalled();
  });

  it("keeps the bridge optional", async () => {
    vi.mocked(fetch).mockResolvedValue(response({ entitlement: denial, message: "Calendar limit reached" }));
    const { result } = renderHook(() => useCalendarIntegrationFetch());

    await expect(result.current("/api/integrations/calendar/add")).resolves.toBeInstanceOf(Response);
  });
});

type SetupCase = {
  Component: ComponentType;
  expectedBody: Record<string, unknown>;
  fields: Array<[label: string, value: string]>;
  path: string;
};

const setupCases: SetupCase[] = [
  {
    Component: AppleCalendarSetup,
    fields: [
      ["apple_id", "user@example.com"],
      ["password", "secret"],
    ],
    expectedBody: { password: "secret", username: "user@example.com" },
    path: "/api/integrations/applecalendar/add",
  },
  {
    Component: CalDavCalendarSetup,
    fields: [
      ["calendar_url", "https://calendar.test"],
      ["username", "user"],
      ["password", "secret"],
    ],
    expectedBody: { password: "secret", url: "https://calendar.test", username: "user" },
    path: "/api/integrations/caldavcalendar/add",
  },
  {
    Component: Exchange2013CalendarSetup,
    fields: [
      ["calendar_url", "https://exchange.test/Ews/Exchange.asmx"],
      ["email", "user@example.com"],
      ["password", "secret"],
    ],
    expectedBody: {
      password: "secret",
      url: "https://exchange.test/Ews/Exchange.asmx",
      username: "user@example.com",
    },
    path: "/api/integrations/exchange2013calendar/add",
  },
  {
    Component: Exchange2016CalendarSetup,
    fields: [
      ["calendar_url", "https://exchange.test/Ews/Exchange.asmx"],
      ["email", "user@example.com"],
      ["password", "secret"],
    ],
    expectedBody: {
      password: "secret",
      url: "https://exchange.test/Ews/Exchange.asmx",
      username: "user@example.com",
    },
    path: "/api/integrations/exchange2016calendar/add",
  },
  {
    Component: ExchangeSetup,
    fields: [
      ["url", "https://exchange.test/Ews/Exchange.asmx"],
      ["email_address", "user@example.com"],
      ["password", "secret"],
    ],
    expectedBody: {
      authenticationMethod: 1,
      exchangeVersion: 7,
      password: "secret",
      url: "https://exchange.test/Ews/Exchange.asmx",
      useCompression: false,
      username: "user@example.com",
    },
    path: "/api/integrations/exchangecalendar/add",
  },
  {
    Component: ICSFeedSetup,
    expectedBody: { urls: ["https://calendar.test/feed.ics"] },
    fields: [["https://example.com/calendar.ics", "https://calendar.test/feed.ics"]],
    path: "/api/integrations/ics-feedcalendar/add",
  },
];

describe.each(setupCases)("$path", ({ Component, expectedBody, fields, path }) => {
  it("delivers a structured denial without storing credentials or redirecting", async () => {
    vi.mocked(fetch).mockImplementation(() =>
      Promise.resolve(response({ entitlement: denial, message: "Calendar limit reached" }))
    );
    const handler = vi.fn();
    const storageSet = vi.spyOn(Storage.prototype, "setItem");
    try {
      render(
        <TooltipProvider>
          <EntitlementUpgradeBridgeProvider onEntitlementDenied={handler}>
            <Component />
          </EntitlementUpgradeBridgeProvider>
        </TooltipProvider>
      );

      for (const [labelOrPlaceholder, value] of fields) {
        const input =
          screen.queryByLabelText(labelOrPlaceholder) ?? screen.getByPlaceholderText(labelOrPlaceholder);
        fireEvent.change(input, { target: { value } });
      }
      await userEvent.click(screen.getByRole("button", { name: "save" }));

      await waitFor(() => expect(handler).toHaveBeenCalledOnce());
      expect(fetch).toHaveBeenCalledWith(path, expect.objectContaining({ method: "POST" }));
      const request = vi.mocked(fetch).mock.calls[0]?.[1];
      expect(JSON.parse(String(request?.body))).toEqual(expectedBody);
      expect(await screen.findByText("Calendar limit reached")).toBeVisible();
      expect(storageSet).not.toHaveBeenCalled();
      expect(mocks.push).not.toHaveBeenCalled();
    } finally {
      storageSet.mockRestore();
    }
  });
});
