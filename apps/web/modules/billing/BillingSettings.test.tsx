import type { RouterOutputs } from "@calcom/trpc/react";
import { fireEvent, render, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

type BillingProjection = RouterOutputs["viewer"]["billing"]["get"];

const mocks = vi.hoisted(() => ({
  consumeUpgradeIntent: vi.fn(),
  queryInput: undefined as { organizationId?: number } | undefined,
  queryOptions: undefined as
    | { enabled?: boolean; initialData?: BillingProjection; refetchInterval?: unknown }
    | undefined,
  projection: undefined as BillingProjection | undefined,
  readUpgradeIntent: vi.fn(),
  reconcileIsPending: false,
  reconcileIsSuccess: false,
  reconcileMutate: vi.fn(),
  replace: vi.fn(),
}));

vi.mock("@calcom/lib/hooks/useLocale", () => ({
  useLocale: () => ({
    t: (key: string, values?: { count?: number }) =>
      values?.count === undefined ? key : `${key}:${values.count}`,
  }),
}));

vi.mock("@calcom/trpc/react", () => ({
  trpc: {
    useUtils: () => ({ viewer: { billing: { get: { invalidate: vi.fn() } } } }),
    viewer: {
      billing: {
        cancelAtPeriodEnd: { useMutation: () => ({ isPending: false, mutate: vi.fn() }) },
        changePlan: { useMutation: () => ({ isPending: false, mutate: vi.fn() }) },
        createPortalSession: { useMutation: () => ({ isPending: false, mutate: vi.fn() }) },
        get: {
          useQuery: (input: { organizationId?: number }, options: typeof mocks.queryOptions) => {
            mocks.queryInput = input;
            mocks.queryOptions = options;
            return { data: mocks.projection, isError: false, isPending: !mocks.projection };
          },
        },
        reconcile: {
          useMutation: () => ({
            isPending: mocks.reconcileIsPending,
            isSuccess: mocks.reconcileIsSuccess,
            mutate: mocks.reconcileMutate,
          }),
        },
      },
    },
  },
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: mocks.replace }) }));

vi.mock("./upgradeIntent", () => ({
  addUpgradeSuccessMarker: (path: string) => `${path}?upgrade=complete`,
  consumeUpgradeIntent: mocks.consumeUpgradeIntent,
  readUpgradeIntent: mocks.readUpgradeIntent,
}));

import { BillingSettings, BillingSettingsView } from "./BillingSettings";

const freeProjection = {
  cancelAtPeriodEnd: false,
  currentPeriodEnd: null,
  currentPeriodStart: null,
  interval: null,
  plan: "FREE" as const,
  seatCount: 1,
  status: "NONE" as const,
  subject: { id: 7, type: "USER" as const },
};

const teamIntent = {
  capability: "bookingAudit" as const,
  createdAt: 1_000,
  requiredPlan: "TEAM" as const,
  resume: { bookingUid: "book_123", kind: "openBookingAudit" as const },
  returnTo: "/booking/book_123/logs",
  subject: { kind: "organization" as const, organizationId: 41 },
  version: 1 as const,
};

beforeEach(() => {
  mocks.consumeUpgradeIntent.mockReset();
  mocks.projection = freeProjection;
  mocks.queryInput = undefined;
  mocks.queryOptions = undefined;
  mocks.readUpgradeIntent.mockReset();
  mocks.reconcileIsPending = false;
  mocks.reconcileIsSuccess = false;
  mocks.reconcileMutate.mockReset();
  mocks.replace.mockReset();
});

describe("BillingSettingsView", () => {
  it("keeps checkout return pending until the verified projection changes", () => {
    const view = render(
      <BillingSettingsView
        checkoutPending
        isMutating={false}
        onCancel={vi.fn()}
        onChangeInterval={vi.fn()}
        onOpenPortal={vi.fn()}
        onReconcile={vi.fn()}
        projection={freeProjection}
      />
    );

    expect(view.getByText("billing_checkout_pending_title")).toBeInTheDocument();
    expect(view.getByText("billing_plan_free")).toBeInTheDocument();
    expect(view.queryByText("billing_checkout_active_title")).not.toBeInTheDocument();
  });

  it("shows active Team seats and routes interval changes through an app action", () => {
    const onChangeInterval = vi.fn();
    const view = render(
      <BillingSettingsView
        checkoutPending={false}
        isMutating={false}
        onCancel={vi.fn()}
        onChangeInterval={onChangeInterval}
        onOpenPortal={vi.fn()}
        onReconcile={vi.fn()}
        projection={{
          ...freeProjection,
          currentPeriodEnd: new Date("2026-08-15T12:00:00.000Z"),
          interval: "MONTH",
          plan: "TEAM",
          seatCount: 4,
          status: "ACTIVE",
          subject: { id: 41, type: "ORGANIZATION" },
        }}
      />
    );

    expect(view.getByText("billing_plan_team")).toBeInTheDocument();
    expect(view.getByText("billing_seat_count:4")).toBeInTheDocument();
    fireEvent.click(view.getByRole("button", { name: "billing_switch_to_annual" }));
    expect(onChangeInterval).toHaveBeenCalledWith("YEAR");
  });

  it("shows period-end cancellation without offering a second cancellation", () => {
    const view = render(
      <BillingSettingsView
        checkoutPending={false}
        isMutating={false}
        onCancel={vi.fn()}
        onChangeInterval={vi.fn()}
        onOpenPortal={vi.fn()}
        onReconcile={vi.fn()}
        projection={{
          ...freeProjection,
          cancelAtPeriodEnd: true,
          currentPeriodEnd: new Date("2026-08-15T12:00:00.000Z"),
          interval: "YEAR",
          plan: "PRO",
          status: "ACTIVE",
        }}
      />
    );

    expect(view.getByText("billing_cancels_at_period_end")).toBeInTheDocument();
    expect(view.queryByRole("button", { name: "billing_cancel_plan" })).not.toBeInTheDocument();
  });
});

describe("BillingSettings checkout restoration", () => {
  it("reconciles the stored organization subject before restoring booking history", async () => {
    mocks.readUpgradeIntent.mockReturnValue(teamIntent);
    mocks.consumeUpgradeIntent.mockReturnValue(teamIntent);
    const view = render(<BillingSettings checkoutId="checkout_123" initialProjection={freeProjection} />);

    await waitFor(() => expect(mocks.reconcileMutate).toHaveBeenCalledWith({ organizationId: 41 }));
    expect(mocks.reconcileMutate).not.toHaveBeenCalledWith({});
    expect(mocks.queryInput).toEqual({ organizationId: 41 });
    expect(mocks.queryOptions?.initialData).toBeUndefined();
    expect(mocks.consumeUpgradeIntent).not.toHaveBeenCalled();

    mocks.reconcileIsSuccess = true;
    mocks.projection = {
      ...freeProjection,
      interval: "YEAR",
      plan: "TEAM",
      status: "ACTIVE",
      subject: { id: 41, type: "ORGANIZATION" },
    };
    view.rerender(<BillingSettings checkoutId="checkout_123" initialProjection={freeProjection} />);

    await waitFor(() => expect(mocks.consumeUpgradeIntent).toHaveBeenCalledOnce());
    expect(mocks.replace).toHaveBeenCalledWith("/booking/book_123/logs?upgrade=complete");
  });

  it("does not restore from an old active projection before reconciliation succeeds", async () => {
    const proIntent = {
      ...teamIntent,
      requiredPlan: "PRO" as const,
      subject: { kind: "user" as const },
    };
    const activePro = {
      ...freeProjection,
      interval: "YEAR" as const,
      plan: "PRO" as const,
      status: "ACTIVE" as const,
    };
    mocks.projection = activePro;
    mocks.readUpgradeIntent.mockReturnValue(proIntent);
    mocks.consumeUpgradeIntent.mockReturnValue(proIntent);

    render(<BillingSettings checkoutId="checkout_123" initialProjection={activePro} />);

    await waitFor(() => expect(mocks.reconcileMutate).toHaveBeenCalledWith({}));
    expect(mocks.consumeUpgradeIntent).not.toHaveBeenCalled();
    expect(mocks.replace).not.toHaveBeenCalled();
  });

  it("does not restore a projection for a different billing subject", async () => {
    mocks.readUpgradeIntent.mockReturnValue(teamIntent);
    mocks.consumeUpgradeIntent.mockReturnValue(teamIntent);
    mocks.reconcileIsSuccess = true;
    mocks.projection = {
      ...freeProjection,
      interval: "YEAR",
      plan: "TEAM",
      status: "ACTIVE",
      subject: { id: 99, type: "ORGANIZATION" },
    };

    render(<BillingSettings checkoutId="checkout_123" initialProjection={freeProjection} />);

    await waitFor(() => expect(mocks.reconcileMutate).toHaveBeenCalledWith({ organizationId: 41 }));
    expect(mocks.consumeUpgradeIntent).not.toHaveBeenCalled();
    expect(mocks.replace).not.toHaveBeenCalled();
  });

  it("keeps a malformed or expired intent on billing settings", async () => {
    mocks.readUpgradeIntent.mockReturnValue(null);

    render(<BillingSettings checkoutId="checkout_123" initialProjection={freeProjection} />);

    await waitFor(() => expect(mocks.reconcileMutate).toHaveBeenCalledWith({}));
    expect(mocks.consumeUpgradeIntent).not.toHaveBeenCalled();
    expect(mocks.replace).not.toHaveBeenCalled();
  });
});
