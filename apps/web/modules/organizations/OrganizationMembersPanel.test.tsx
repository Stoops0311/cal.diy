import type { RouterOutputs } from "@calcom/trpc/react";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import english from "../../../../packages/i18n/locales/en/common.json";

type MembersData = RouterOutputs["viewer"]["organizations"]["members"];
type MutationName = "changeRole" | "invite" | "removeMember" | "resendInvitation" | "revokeInvitation";
type MutationOptions = { onSuccess?(): Promise<void> | void };

const mocks = vi.hoisted(() => ({
  invalidate: vi.fn(),
  mutate: {
    changeRole: vi.fn(),
    invite: vi.fn(),
    removeMember: vi.fn(),
    resendInvitation: vi.fn(),
    revokeInvitation: vi.fn(),
  },
  options: {} as Partial<Record<MutationName, MutationOptions>>,
  pending: undefined as MutationName | undefined,
}));

function translate(key: string, values?: Record<string, string | number>): string {
  let result = (english as unknown as Record<string, string>)[key] ?? key;
  for (const [name, value] of Object.entries(values ?? {})) {
    result = result.replace(`{{${name}}}`, String(value));
  }
  return result;
}

vi.mock("@calcom/features/settings/appDir/SettingsHeader", () => ({
  default: ({ children }: { children: React.ReactNode }) => <main>{children}</main>,
}));

vi.mock("@calcom/lib/hooks/useLocale", () => ({ useLocale: () => ({ t: translate }) }));
vi.mock("@calcom/ui/components/toast", () => ({ showToast: vi.fn() }));
vi.mock("@calcom/trpc/react", () => {
  function useMutation(name: MutationName, options: MutationOptions = {}) {
    mocks.options[name] = options;
    return { isPending: mocks.pending === name, mutate: mocks.mutate[name] };
  }
  const hook = (name: MutationName) => ({
    useMutation: (options: MutationOptions) => useMutation(name, options),
  });
  return {
    trpc: {
      useUtils: () => ({
        viewer: { organizations: { members: { invalidate: mocks.invalidate } } },
      }),
      viewer: {
        organizations: {
          changeRole: hook("changeRole"),
          invite: hook("invite"),
          members: {
            useQuery: (_input: { organizationId: number }, options: { initialData?: MembersData }) => ({
              data: options.initialData,
              isError: false,
              isPending: false,
            }),
          },
          removeMember: hook("removeMember"),
          resendInvitation: hook("resendInvitation"),
          revokeInvitation: hook("revokeInvitation"),
        },
      },
    },
  };
});

import { OrganizationMembersPanel, organizationMemberErrorKey } from "./OrganizationMembersPanel";

const membersData: MembersData = {
  acceptedSeats: 4,
  actorRole: "OWNER",
  canManageInvitations: true,
  id: 41,
  members: [
    { avatarUrl: null, email: "owner@example.com", id: 7, name: "Owner", role: "OWNER" },
    { avatarUrl: null, email: "admin@example.com", id: 8, name: "Admin", role: "ADMIN" },
    { avatarUrl: null, email: "member@example.com", id: 9, name: null, role: "MEMBER" },
    { avatarUrl: null, email: "owner-2@example.com", id: 10, name: "Second owner", role: "OWNER" },
  ],
  name: "Acme",
  pendingInvitations: [
    {
      createdAt: new Date("2026-07-16T12:00:00.000Z"),
      email: "pending@example.com",
      id: "inv_1",
      role: "MEMBER",
    },
  ],
  seatLimit: 50,
  slug: "acme",
};

function renderPanel(data: MembersData = membersData) {
  return render(<OrganizationMembersPanel initialData={data} organizationId={41} />);
}

beforeEach(() => {
  mocks.invalidate.mockReset().mockResolvedValue(undefined);
  mocks.options = {};
  mocks.pending = undefined;
  for (const mutate of Object.values(mocks.mutate)) mutate.mockReset();
});

describe("OrganizationMembersPanel", () => {
  it("separates accepted and pending people and disables invites at 50 accepted seats", () => {
    const view = renderPanel();

    expect(screen.getByText("4 of 50 seats in use")).toBeVisible();
    expect(screen.getByText(english.organization_members_billed_seats)).toBeVisible();
    expect(screen.getByRole("heading", { name: "Accepted members" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "Pending invitations" })).toBeVisible();
    expect(screen.getByText("pending@example.com")).toBeVisible();
    view.unmount();
    renderPanel({ ...membersData, acceptedSeats: 50 });
    expect(screen.getByText("This organization has used all 50 accepted seats.")).toBeVisible();
    expect(screen.getByRole("textbox", { name: "Email address" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Send invitation" })).toBeDisabled();
  });

  it("validates invite email inline and submits the selected role", async () => {
    renderPanel();

    await userEvent.type(screen.getByRole("textbox", { name: "Email address" }), "not-an-email");
    await userEvent.click(screen.getByRole("button", { name: "Send invitation" }));
    expect(screen.getByText("Enter a valid email address.")).toBeVisible();
    expect(mocks.mutate.invite).not.toHaveBeenCalled();

    fireEvent.change(screen.getByRole("textbox", { name: "Email address" }), {
      target: { value: "new@example.com" },
    });
    await userEvent.selectOptions(screen.getByRole("combobox", { name: "Invitation role" }), "ADMIN");
    await userEvent.click(screen.getByRole("button", { name: "Send invitation" }));

    expect(mocks.mutate.invite).toHaveBeenCalledWith({
      email: "new@example.com",
      organizationId: 41,
      role: "ADMIN",
    });
  });

  it("maps duplicate, full, permission, and provider errors distinctly", () => {
    const cases = [
      [
        { message: "An invitation is already pending for this email" },
        "organization_members_error_duplicate",
      ],
      [{ message: "This plan's resource limit was reached" }, "organization_members_error_full"],
      [{ data: { code: "FORBIDDEN" }, message: "denied" }, "organization_members_error_permission"],
      [{ data: { code: "CONFLICT" }, message: "provider" }, "organization_members_error_provider"],
    ] as const;
    for (const [error, key] of cases) expect(organizationMemberErrorKey(error)).toBe(key);
  });

  it("invalidates the members query after resending and revoking", async () => {
    const view = renderPanel();

    await userEvent.click(screen.getByRole("button", { name: "Resend invitation to pending@example.com" }));
    expect(mocks.mutate.resendInvitation).toHaveBeenCalledWith({ invitationId: "inv_1", organizationId: 41 });
    await mocks.options.resendInvitation?.onSuccess?.();

    await userEvent.click(screen.getByRole("button", { name: "Revoke invitation for pending@example.com" }));
    expect(mocks.mutate.revokeInvitation).toHaveBeenCalledWith({ invitationId: "inv_1", organizationId: 41 });
    await mocks.options.revokeInvitation?.onSuccess?.();

    expect(mocks.invalidate).toHaveBeenNthCalledWith(1, { organizationId: 41 });
    expect(mocks.invalidate).toHaveBeenNthCalledWith(2, { organizationId: 41 });

    view.unmount();
    mocks.pending = "resendInvitation";
    renderPanel();
    expect(screen.getByRole("button", { name: "Resend invitation to pending@example.com" })).toBeDisabled();
  });

  it("distinguishes ordinary members from inactive organization managers", () => {
    const view = renderPanel({
      ...membersData,
      actorRole: "MEMBER",
      canManageInvitations: false,
      pendingInvitations: [],
    });

    expect(screen.getByText("Only organization owners and admins can manage members.")).toBeVisible();
    expect(screen.queryByRole("textbox", { name: "Email address" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Remove/ })).not.toBeInTheDocument();
    view.unmount();
    renderPanel({ ...membersData, canManageInvitations: false, pendingInvitations: [] });
    expect(screen.getByText("An active Team plan is required to manage organization members.")).toBeVisible();
  });

  it("keeps the single accepted owner's demotion and removal controls disabled", () => {
    renderPanel({ ...membersData, members: membersData.members.slice(0, 3), acceptedSeats: 3 });

    expect(screen.getByRole("combobox", { name: "Change role for Owner" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Remove Owner" })).toBeDisabled();
  });

  it("invalidates after accepted-member role and removal mutations", async () => {
    renderPanel();

    await userEvent.selectOptions(screen.getByRole("combobox", { name: "Change role for Admin" }), "MEMBER");
    expect(mocks.mutate.changeRole).toHaveBeenCalledWith({
      memberUserId: 8,
      organizationId: 41,
      role: "MEMBER",
    });
    await mocks.options.changeRole?.onSuccess?.();

    await userEvent.click(screen.getByRole("button", { name: "Remove member@example.com" }));
    expect(mocks.mutate.removeMember).toHaveBeenCalledWith({ memberUserId: 9, organizationId: 41 });
    await mocks.options.removeMember?.onSuccess?.();

    expect(mocks.invalidate).toHaveBeenCalledTimes(2);
  });
});
