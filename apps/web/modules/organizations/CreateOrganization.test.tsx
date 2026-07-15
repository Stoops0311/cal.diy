import { fireEvent, render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@calcom/lib/hooks/useLocale", () => ({
  useLocale: () => ({ t: (key: string) => key }),
}));

import { CreateOrganizationForm, safeReturnTo, withOrganizationId } from "./CreateOrganization";

describe("CreateOrganizationForm", () => {
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
  });
});
