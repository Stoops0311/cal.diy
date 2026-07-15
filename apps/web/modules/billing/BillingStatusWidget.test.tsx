import { fireEvent, render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  data: undefined as
    | {
        canManageBilling: boolean;
        plan: "FREE" | "PRO" | "TEAM";
        seats: { accepted: number; billed: number | null; limit: number } | null;
        status: "NONE" | "TRIALING" | "ACTIVE" | "PAST_DUE" | "CANCELED" | "UNPAID";
        subject: { id: number; type: "USER" | "ORGANIZATION" };
      }
    | undefined,
  isError: false,
  isPending: true,
  queryInput: null as unknown,
  queryOptions: undefined as { retry?: number; staleTime?: number } | undefined,
  refetch: vi.fn(),
}));

vi.mock("@calcom/lib/hooks/useLocale", () => ({
  useLocale: () => ({
    t: (key: string, values?: Record<string, number | string>) =>
      values ? `${key}:${Object.values(values).join(":")}` : key,
  }),
}));

vi.mock("@calcom/trpc/react", () => ({
  trpc: {
    viewer: {
      billing: {
        summary: {
          useQuery: (input: unknown, options: { retry?: number; staleTime?: number }) => {
            mocks.queryInput = input;
            mocks.queryOptions = options;
            return {
              data: mocks.data,
              isError: mocks.isError,
              isPending: mocks.isPending,
              refetch: mocks.refetch,
            };
          },
        },
      },
    },
  },
}));

import { BillingStatusWidget } from "./BillingStatusWidget";

beforeEach(() => {
  mocks.data = undefined;
  mocks.isError = false;
  mocks.isPending = true;
  mocks.queryInput = null;
  mocks.queryOptions = undefined;
  mocks.refetch.mockReset();
});

describe("BillingStatusWidget", () => {
  it("shows a quiet fixed-height skeleton while loading", () => {
    const view = render(<BillingStatusWidget />);

    expect(view.getByLabelText("billing_status_widget_loading")).toHaveClass("min-h-24");
    expect(view.queryByRole("link")).not.toBeInTheDocument();
    expect(mocks.queryInput).toBeUndefined();
    expect(mocks.queryOptions).toEqual({ retry: 1, staleTime: 60_000 });
  });

  it("keeps the page usable and retries without showing a billing action", () => {
    mocks.isPending = false;
    mocks.isError = true;
    const view = render(<BillingStatusWidget />);

    expect(view.getByText("billing_status_widget_unavailable")).toBeInTheDocument();
    expect(view.queryByRole("link")).not.toBeInTheDocument();
    const retry = view.getByRole("button", { name: "billing_status_widget_retry" });
    expect(retry).toHaveClass("[@media(pointer:coarse)]:min-h-11", "[@media(pointer:coarse)]:min-w-11");
    fireEvent.click(retry);
    expect(mocks.refetch).toHaveBeenCalledOnce();
  });

  it("links a personal Free user to plan comparison", () => {
    mocks.isPending = false;
    mocks.data = {
      canManageBilling: true,
      plan: "FREE",
      seats: null,
      status: "NONE",
      subject: { id: 7, type: "USER" },
    };
    const view = render(<BillingStatusWidget />);

    expect(view.getByText("billing_plan_free")).toBeInTheDocument();
    expect(view.getByRole("link", { name: "billing_compare_plans" })).toHaveAttribute("href", "/pricing");
  });

  it("shows accepted Team usage to a member without a management link or billed quantity", () => {
    mocks.isPending = false;
    mocks.data = {
      canManageBilling: false,
      plan: "TEAM",
      seats: { accepted: 4, billed: null, limit: 50 },
      status: "ACTIVE",
      subject: { id: 41, type: "ORGANIZATION" },
    };
    const view = render(<BillingStatusWidget />);

    expect(view.getByText("billing_status_widget_seats:4:50")).toBeInTheDocument();
    expect(view.queryByRole("link")).not.toBeInTheDocument();
    expect(view.queryByText(/billed/i)).not.toBeInTheDocument();
  });

  it("links a Team manager to organization billing", () => {
    mocks.isPending = false;
    mocks.data = {
      canManageBilling: true,
      plan: "TEAM",
      seats: { accepted: 4, billed: 5, limit: 50 },
      status: "ACTIVE",
      subject: { id: 41, type: "ORGANIZATION" },
    };
    const view = render(<BillingStatusWidget />);

    expect(view.getByRole("link", { name: "billing_manage_plan" })).toHaveAttribute(
      "href",
      "/settings/billing?organizationId=41"
    );
    expect(view.queryByText("5")).not.toBeInTheDocument();
  });

  it("links a Free organization manager to organization-aware pricing", () => {
    mocks.isPending = false;
    mocks.data = {
      canManageBilling: true,
      plan: "FREE",
      seats: null,
      status: "NONE",
      subject: { id: 41, type: "ORGANIZATION" },
    };
    const view = render(<BillingStatusWidget />);

    expect(view.getByRole("link", { name: "billing_compare_plans" })).toHaveAttribute(
      "href",
      "/pricing?organizationId=41"
    );
  });

  it("links a personal paid user to personal billing", () => {
    mocks.isPending = false;
    mocks.data = {
      canManageBilling: true,
      plan: "PRO",
      seats: null,
      status: "ACTIVE",
      subject: { id: 7, type: "USER" },
    };
    const view = render(<BillingStatusWidget />);

    expect(view.getByRole("link", { name: "billing_manage_plan" })).toHaveAttribute(
      "href",
      "/settings/billing"
    );
  });
});
