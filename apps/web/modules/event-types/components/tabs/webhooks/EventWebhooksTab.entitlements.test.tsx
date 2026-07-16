import { fireEvent, render, screen } from "@testing-library/react";
import type { ComponentProps, ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  createOptions: undefined as undefined | { onError: (error: { message: string }) => void },
  editOptions: undefined as undefined | { onError: (error: { message: string }) => void },
  openFromError: vi.fn(),
  session: { user: { org: { id: 41, role: "ADMIN" } } },
  toast: vi.fn(),
  values: {
    active: true,
    eventTriggers: ["BOOKING_CREATED"],
    id: "",
    payloadTemplate: '{"private":"payload"}',
    secret: "webhook-secret-value",
    subscriberUrl: "https://example.test/private-hook",
    time: null,
    timeUnit: null,
  },
}));

vi.mock("@calcom/features/auth/lib/useCurrentSession", () => ({
  useCurrentSession: () => ({ data: mocks.session }),
}));
vi.mock("../../../../billing/useEntitlementUpgrade", () => ({
  useEntitlementUpgrade: () => ({ openFromError: mocks.openFromError }),
}));
vi.mock("@calcom/lib/hooks/useLocale", () => ({ useLocale: () => ({ t: (key: string) => key }) }));
vi.mock("@calcom/features/webhooks/lib/subscriberUrlReserved", () => ({
  subscriberUrlReserved: () => false,
}));
vi.mock("@calcom/trpc/react", () => ({
  trpc: {
    useUtils: () => ({
      viewer: {
        eventTypes: { get: { invalidate: vi.fn() } },
        webhook: { list: { invalidate: vi.fn() } },
      },
    }),
    viewer: {
      apps: { integrations: { useQuery: () => ({ data: { items: [] }, isLoading: false }) } },
      webhook: {
        create: {
          useMutation: (options: { onError: (error: { message: string }) => void }) => {
            mocks.createOptions = options;
            return { mutate: mocks.create };
          },
        },
        edit: {
          useMutation: (options: { onError: (error: { message: string }) => void }) => {
            mocks.editOptions = options;
            return { mutate: vi.fn() };
          },
        },
        list: { useQuery: () => ({ data: [] }) },
      },
    },
  },
}));
vi.mock("@calcom/ui/components/toast", () => ({ showToast: mocks.toast }));
vi.mock("@calcom/features/components/controlled-dialog", () => ({
  Dialog: ({ children, open }: { children: ReactNode; open: boolean }) => (open ? children : null),
}));
vi.mock("@calcom/ui/components/dialog", () => ({
  DialogContent: ({ children }: { children: ReactNode }) => <>{children}</>,
}));
vi.mock("@calcom/ui/components/button", () => ({
  Button: ({ children, onClick }: { children: ReactNode; onClick?: () => void }) => (
    <button type="button" onClick={onClick}>
      {children}
    </button>
  ),
}));
vi.mock("@calcom/ui/components/empty-screen", () => ({
  EmptyScreen: ({ buttonRaw }: { buttonRaw: ReactNode }) => <>{buttonRaw}</>,
}));
vi.mock("react-hook-form", () => ({ useFormContext: () => ({}) }));
vi.mock("../../../../webhooks/components", () => ({
  WebhookForm: ({ onSubmit }: { onSubmit: (values: typeof mocks.values) => void }) => (
    <button type="button" onClick={() => onSubmit({ ...mocks.values })}>
      submit webhook
    </button>
  ),
}));

import { EventWebhooksTab, getEventWebhookUpgradeContext } from "./EventWebhooksTab";

const entitlementError = {
  data: {
    entitlement: { capability: "canCreateWebhooks", effectivePlan: "FREE", kind: "capability" },
  },
  message: "Webhooks are unavailable",
};

type EventType = ComponentProps<typeof EventWebhooksTab>["eventType"];

function renderCreateBoundary(teamId: number | null, parentId: number | null) {
  const eventType = { id: 17, team: teamId ? { id: teamId, parentId } : null, teamId } as EventType;
  render(<EventWebhooksTab eventType={eventType} />);
  fireEvent.click(screen.getByRole("button", { name: "new_webhook" }));
  fireEvent.click(screen.getByRole("button", { name: "submit webhook" }));
}

describe("EventWebhooksTab entitlement prompt", () => {
  beforeEach(() => {
    sessionStorage.clear();
    mocks.create.mockReset();
    mocks.createOptions = undefined;
    mocks.editOptions = undefined;
    mocks.openFromError.mockReset().mockReturnValue(true);
    mocks.toast.mockReset();
  });

  it("routes a subteam create denial through its authoritative organization without form values", () => {
    renderCreateBoundary(73, 41);
    mocks.createOptions?.onError(entitlementError);

    expect(mocks.create).toHaveBeenCalledTimes(1);
    expect(mocks.openFromError).toHaveBeenCalledWith(entitlementError, {
      organizationId: 41,
      returnTo: "/event-types/17?tabName=webhooks",
      teamId: 73,
    });
    expect(mocks.toast).not.toHaveBeenCalled();
    const promptInput = JSON.stringify(mocks.openFromError.mock.calls);
    expect(promptInput).not.toContain(mocks.values.secret);
    expect(promptInput).not.toContain(mocks.values.subscriberUrl);
    expect(promptInput).not.toContain(mocks.values.payloadTemplate);
    const storedUpgradeState = JSON.stringify(sessionStorage);
    expect(storedUpgradeState).not.toContain(mocks.values.secret);
    expect(storedUpgradeState).not.toContain(mocks.values.subscriberUrl);
    expect(storedUpgradeState).not.toContain(mocks.values.payloadTemplate);
  });

  it("keeps a generic create rejection on the existing toast path", () => {
    const forbidden = { data: { code: "FORBIDDEN" }, message: "Forbidden" };
    mocks.openFromError.mockReturnValue(false);
    renderCreateBoundary(null, null);
    mocks.createOptions?.onError(forbidden);

    expect(mocks.create).toHaveBeenCalledTimes(1);
    expect(mocks.openFromError).toHaveBeenCalledWith(forbidden, {
      organizationId: undefined,
      returnTo: "/event-types/17?tabName=webhooks",
      teamId: undefined,
    });
    expect(mocks.toast).toHaveBeenCalledWith("Forbidden", "error");
  });

  it("restores edit errors to their generic toast behavior", () => {
    renderCreateBoundary(41, null);
    mocks.editOptions?.onError(entitlementError);

    expect(mocks.openFromError).not.toHaveBeenCalled();
    expect(mocks.toast).toHaveBeenCalledWith("Webhooks are unavailable", "error");
  });

  it("accepts only exact organization billing context", () => {
    expect(getEventWebhookUpgradeContext(19, 41, null, 41).organizationId).toBe(41);
    expect(getEventWebhookUpgradeContext(19, 73, 41, 41).organizationId).toBe(41);
    expect(getEventWebhookUpgradeContext(19, 99, 77, 41).organizationId).toBeUndefined();
  });
});
