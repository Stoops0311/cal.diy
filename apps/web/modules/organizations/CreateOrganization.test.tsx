import { fireEvent, render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

type CreateOptions = {
  onError(error: { message?: string }): void;
  onSuccess(result: { organizationId: number }): void;
};

const mocks = vi.hoisted(() => ({
  bindUpgradeIntentToOrganization: vi.fn(),
  createMutate: vi.fn(),
  createOptions: undefined as CreateOptions | undefined,
  onBeforeNavigate: undefined as
    | ((context: {
        organizationId?: number;
        selection: { interval: "MONTH" | "YEAR"; plan: "TEAM" };
      }) => void)
    | undefined,
  paidCheckoutPendingPlan: undefined as "PRO" | "TEAM" | undefined,
  push: vi.fn(),
  startCheckout: vi.fn(),
}));

vi.mock("@calcom/lib/hooks/useLocale", () => ({
  useLocale: () => ({ t: (key: string) => key }),
}));

vi.mock("@calcom/features/settings/appDir/SettingsHeader", () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock("@calcom/trpc/react", () => ({
  trpc: {
    viewer: {
      organizations: {
        create: {
          useMutation: (options: CreateOptions) => {
            mocks.createOptions = options;
            return { isPending: false, mutate: mocks.createMutate };
          },
        },
      },
    },
  },
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mocks.push }) }));

vi.mock("../billing/upgradeIntent", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../billing/upgradeIntent")>()),
  bindUpgradeIntentToOrganization: mocks.bindUpgradeIntentToOrganization,
}));

vi.mock("../billing/usePaidPlanCheckout", () => ({
  usePaidPlanCheckout: (options: { onBeforeNavigate?(context: unknown): void }) => {
    mocks.onBeforeNavigate = options.onBeforeNavigate;
    return {
      pendingPlan: mocks.paidCheckoutPendingPlan,
      startCheckout: (selection: { interval: "MONTH" | "YEAR"; plan: "TEAM" }, organizationId?: number) => {
        mocks.onBeforeNavigate?.({ selection, organizationId });
        mocks.startCheckout(selection, organizationId);
      },
    };
  },
}));

import {
  CreateOrganization,
  CreateOrganizationForm,
  safeReturnTo,
  withOrganizationId,
} from "./CreateOrganization";

beforeEach(() => {
  mocks.bindUpgradeIntentToOrganization.mockClear();
  mocks.createMutate.mockClear();
  mocks.createOptions = undefined;
  mocks.onBeforeNavigate = undefined;
  mocks.paidCheckoutPendingPlan = undefined;
  mocks.push.mockClear();
  mocks.startCheckout.mockClear();
});

describe("CreateOrganizationForm", () => {
  it("accepts onboarding-specific submit copy", () => {
    const view = render(
      <CreateOrganizationForm isPending={false} onSubmit={vi.fn()} submitLabel="Create team and continue ›" />
    );

    expect(view.getByRole("button", { name: "Create team and continue ›" })).toBeVisible();
  });

  it("derives a stable slug and submits the provisional organization", () => {
    const onSubmit = vi.fn();
    const view = render(<CreateOrganizationForm isPending={false} onSubmit={onSubmit} />);

    fireEvent.change(view.getByLabelText("organization_name"), { target: { value: "Acme Labs" } });
    expect(view.getByLabelText("slug")).toHaveValue("acme-labs");

    fireEvent.click(view.getByRole("button", { name: "organization_bootstrap_create" }));

    expect(onSubmit).toHaveBeenCalledWith({ name: "Acme Labs", slug: "acme-labs" });
  });

  it("preserves an explicitly edited slug when the name changes", () => {
    const onSubmit = vi.fn();
    const view = render(<CreateOrganizationForm isPending={false} onSubmit={onSubmit} />);

    fireEvent.change(view.getByLabelText("organization_name"), { target: { value: "Acme" } });
    fireEvent.change(view.getByLabelText("slug"), { target: { value: "customer-success" } });
    fireEvent.change(view.getByLabelText("organization_name"), { target: { value: "Acme Labs" } });
    fireEvent.click(view.getByRole("button", { name: "organization_bootstrap_create" }));

    expect(onSubmit).toHaveBeenCalledWith({ name: "Acme Labs", slug: "customer-success" });
  });
});

describe("organization return paths", () => {
  it("keeps same-origin paths and appends the organization subject", () => {
    expect(safeReturnTo("/pricing?interval=MONTH")).toBe("/pricing?interval=MONTH");
    expect(withOrganizationId("/pricing?interval=MONTH", 41)).toBe(
      "/pricing?interval=MONTH&organizationId=41"
    );
  });

  it("rejects external and protocol-relative return paths", () => {
    expect(safeReturnTo("https://example.com/steal")).toBe("/settings/billing");
    expect(safeReturnTo("//example.com/steal")).toBe("/settings/billing");
    expect(safeReturnTo("/\\evil.test/x")).toBe("/settings/billing");
  });
});

describe("CreateOrganization checkout", () => {
  it("binds the new organization before starting shared Team checkout", () => {
    render(<CreateOrganization checkoutInterval="YEAR" returnTo="/booking/book_123/logs" />);

    mocks.createOptions?.onSuccess({ organizationId: 41 });

    expect(mocks.bindUpgradeIntentToOrganization).toHaveBeenCalledWith(41);
    expect(mocks.startCheckout).toHaveBeenCalledWith({ interval: "YEAR", plan: "TEAM" }, 41);
    expect(mocks.bindUpgradeIntentToOrganization.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.startCheckout.mock.invocationCallOrder[0]
    );
  });
});
