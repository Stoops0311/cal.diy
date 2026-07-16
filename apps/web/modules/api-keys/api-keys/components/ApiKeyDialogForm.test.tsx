import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  formValues: {
    expiresAt: new Date("2026-08-15T00:00:00.000Z"),
    neverExpires: false,
    note: "private deployment note",
  },
  openFromError: vi.fn(),
}));

vi.mock("../../../billing/useEntitlementUpgrade", () => ({
  useEntitlementUpgrade: () => ({ openFromError: mocks.openFromError }),
}));
vi.mock("@calcom/lib/hooks/useLocale", () => ({ useLocale: () => ({ t: (key: string) => key }) }));
vi.mock("@calcom/trpc/react", () => ({
  trpc: {
    useUtils: () => ({
      client: { viewer: { apiKeys: { create: { mutate: mocks.create } } } },
      viewer: { apiKeys: { list: { invalidate: vi.fn() } } },
    }),
    viewer: { apiKeys: { edit: { useMutation: () => ({ mutate: vi.fn() }) } } },
  },
}));
vi.mock("@calcom/web/app/(use-page-wrapper)/settings/(settings-layout)/developer/api-keys/actions", () => ({
  revalidateApiKeysList: vi.fn(),
}));
vi.mock("@calcom/ui/components/form", () => ({
  Form: ({ handleSubmit }: { handleSubmit: (values: typeof mocks.formValues) => Promise<void> }) => (
    <button type="button" onClick={() => void handleSubmit(mocks.formValues).catch(() => undefined)}>
      submit
    </button>
  ),
  SelectField: () => null,
  Switch: () => null,
  TextField: () => null,
}));
vi.mock("@calcom/ui/components/button", () => ({
  Button: ({ children }: { children: ReactNode }) => <button type="button">{children}</button>,
}));
vi.mock("@calcom/ui/components/dialog", () => ({
  DialogFooter: ({ children }: { children: ReactNode }) => <>{children}</>,
}));
vi.mock("@calcom/ui/components/tooltip", () => ({
  Tooltip: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

import ApiKeyDialogForm from "./ApiKeyDialogForm";

const entitlementError = {
  data: {
    entitlement: { capability: "canCreateApiKeys", effectivePlan: "FREE", kind: "capability" },
  },
};

describe("ApiKeyDialogForm entitlement prompts", () => {
  beforeEach(() => {
    sessionStorage.clear();
    mocks.create.mockReset().mockRejectedValue(entitlementError);
    mocks.openFromError.mockReset().mockReturnValue(true);
  });

  it("opens a safe personal API-key prompt", async () => {
    render(<ApiKeyDialogForm handleClose={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "submit" }));

    await waitFor(() =>
      expect(mocks.openFromError).toHaveBeenCalledWith(entitlementError, {
        returnTo: "/settings/developer/api-keys",
      })
    );
    expect(mocks.create).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(mocks.openFromError.mock.calls)).not.toContain(mocks.formValues.note);
    expect(JSON.stringify(sessionStorage)).not.toContain(mocks.formValues.note);
  });

  it("leaves a plain forbidden rejection on the existing error path", async () => {
    const forbidden = { data: { code: "FORBIDDEN" }, message: "Forbidden" };
    mocks.create.mockRejectedValue(forbidden);
    mocks.openFromError.mockReturnValue(false);
    render(<ApiKeyDialogForm handleClose={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "submit" }));

    await waitFor(() => expect(mocks.openFromError).toHaveBeenCalledWith(forbidden, expect.any(Object)));
    expect(mocks.openFromError).toHaveReturnedWith(false);
  });
});
