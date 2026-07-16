import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createOptions: undefined as undefined | { onError: (error: { message: string }) => void },
  mutate: vi.fn(),
  openFromError: vi.fn(),
  searchParams: new URLSearchParams(),
  session: { user: { id: 7, org: { id: 41, role: "ADMIN" } } } as {
    user: { id: number; org?: { id: number; role: string } };
  },
  toast: vi.fn(),
  values: {
    active: true,
    eventTriggers: ["BOOKING_CREATED"],
    payloadTemplate: '{"confidential":"body"}',
    secret: "new-webhook-secret",
    subscriberUrl: "https://example.test/confidential-hook",
    time: null,
    timeUnit: null,
    version: "2021-10-20",
  },
}));

vi.mock("../../billing/useEntitlementUpgrade", () => ({
  useEntitlementUpgrade: () => ({ openFromError: mocks.openFromError }),
}));
vi.mock("@calcom/features/auth/lib/useCurrentSession", () => ({
  useCurrentSession: () => ({ data: mocks.session }),
}));
vi.mock("@calcom/lib/hooks/useCompatSearchParams", () => ({
  useCompatSearchParams: () => mocks.searchParams,
}));
vi.mock("@calcom/features/webhooks/lib/subscriberUrlReserved", () => ({
  subscriberUrlReserved: () => false,
}));
vi.mock("@calcom/lib/hooks/useLocale", () => ({ useLocale: () => ({ t: (key: string) => key }) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@coss/ui/components/toast", () => ({ toastManager: { add: mocks.toast } }));
vi.mock("@calcom/trpc/react", () => ({
  trpc: {
    useUtils: () => ({ viewer: { webhook: { list: { invalidate: vi.fn() } } } }),
    viewer: {
      webhook: {
        create: {
          useMutation: (options: { onError: (error: { message: string }) => void }) => {
            mocks.createOptions = options;
            return { mutate: mocks.mutate };
          },
        },
      },
    },
  },
}));
vi.mock("../components/WebhookForm", () => ({
  default: ({ onSubmit }: { onSubmit: (values: typeof mocks.values) => void }) => (
    <button type="button" onClick={() => onSubmit({ ...mocks.values })}>
      submit webhook
    </button>
  ),
}));
vi.mock("../components/WebhookVersionCTA", () => ({ WebhookVersionCTA: () => null }));
vi.mock("./webhook-form-header", () => ({ WebhookFormHeader: () => null }));
vi.mock(
  "@calcom/web/app/(use-page-wrapper)/settings/(settings-layout)/developer/webhooks/(with-loader)/actions",
  () => ({ revalidateWebhooksList: vi.fn() })
);

import { NewWebhookView } from "./webhook-new-view";

const entitlementError = {
  data: {
    entitlement: { capability: "canCreateWebhooks", effectivePlan: "FREE", kind: "capability" },
  },
  message: "Webhooks are unavailable",
};

describe("NewWebhookView entitlement prompts", () => {
  beforeEach(() => {
    sessionStorage.clear();
    mocks.mutate.mockReset();
    mocks.openFromError.mockReset().mockReturnValue(true);
    mocks.searchParams = new URLSearchParams();
    mocks.session = { user: { id: 7, org: { id: 41, role: "ADMIN" } } };
    mocks.toast.mockReset();
  });

  it.each([
    ["personal", "", { returnTo: "/settings/developer/webhooks/new" }],
    [
      "organization",
      "teamId=41",
      {
        organizationId: 41,
        returnTo: "/settings/developer/webhooks/new?teamId=41",
        teamId: 41,
      },
    ],
  ])("opens a safe %s webhook prompt", (_scope, query, expectedContext) => {
    mocks.searchParams = new URLSearchParams(query);
    render(<NewWebhookView webhooks={[]} installedApps={{ items: [] }} />);
    fireEvent.click(screen.getByRole("button", { name: "submit webhook" }));
    mocks.createOptions?.onError(entitlementError);

    expect(mocks.openFromError).toHaveBeenCalledWith(entitlementError, expectedContext);
    expect(JSON.stringify(mocks.openFromError.mock.calls)).not.toContain(mocks.values.secret);
    expect(JSON.stringify(mocks.openFromError.mock.calls)).not.toContain(mocks.values.subscriberUrl);
    expect(JSON.stringify(mocks.openFromError.mock.calls)).not.toContain(mocks.values.payloadTemplate);
    expect(JSON.stringify(sessionStorage)).not.toContain(mocks.values.secret);
    expect(mocks.mutate).toHaveBeenCalledTimes(1);
    expect(mocks.toast).not.toHaveBeenCalled();
  });

  it("declines Team when a subteam query has no authoritative parent organization", () => {
    mocks.searchParams = new URLSearchParams("teamId=99");
    mocks.openFromError.mockReturnValue(false);
    render(<NewWebhookView webhooks={[]} installedApps={{ items: [] }} />);
    mocks.createOptions?.onError(entitlementError);

    expect(mocks.openFromError).toHaveBeenCalledWith(entitlementError, {
      organizationId: undefined,
      returnTo: "/settings/developer/webhooks/new?teamId=99",
      teamId: 99,
    });
    expect(mocks.toast).toHaveBeenCalledWith({ title: entitlementError.message, type: "error" });
  });

  it("keeps plain forbidden errors on the existing toast path", () => {
    const forbidden = { data: { code: "FORBIDDEN" }, message: "Forbidden" };
    mocks.openFromError.mockReturnValue(false);
    render(<NewWebhookView webhooks={[]} installedApps={{ items: [] }} />);
    mocks.createOptions?.onError(forbidden);

    expect(mocks.toast).toHaveBeenCalledWith({ title: "Forbidden", type: "error" });
  });
});
