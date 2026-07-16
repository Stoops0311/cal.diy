"use client";

import SettingsHeader from "@calcom/features/settings/appDir/SettingsHeader";
import { ErrorCode } from "@calcom/lib/errorCodes";
import { useLocale } from "@calcom/lib/hooks/useLocale";
import type { RouterOutputs } from "@calcom/trpc/react";
import { trpc } from "@calcom/trpc/react";
import { Alert } from "@calcom/ui/components/alert";
import { Button } from "@calcom/ui/components/button";
import { TextField } from "@calcom/ui/components/form";
import { showToast } from "@calcom/ui/components/toast";
import { type ReactElement, type ReactNode, useState } from "react";

type MembersData = RouterOutputs["viewer"]["organizations"]["members"];
type OrganizationMemberError = { data?: { code?: string } | null; message: string };

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function organizationMemberErrorKey(error: OrganizationMemberError): string {
  const code = error.data?.code;
  if (
    code === ErrorCode.ClerkOrganizationInvitationDuplicate ||
    error.message === "An invitation is already pending for this email"
  )
    return "organization_members_error_duplicate";
  if (
    code === ErrorCode.EntitlementLimitExceeded ||
    error.message === "This plan's resource limit was reached"
  )
    return "organization_members_error_full";
  if (code === "BAD_REQUEST") return "organization_members_error_invalid";
  if ([ErrorCode.Forbidden, ErrorCode.EntitlementRequired, "FORBIDDEN", "UNAUTHORIZED"].includes(code ?? ""))
    return "organization_members_error_permission";
  return "organization_members_error_provider";
}

function OrganizationMembersPanel({
  initialData,
  organizationId,
}: {
  initialData?: MembersData;
  organizationId: number;
}): ReactElement {
  const { t } = useLocale();
  const utils = trpc.useUtils();
  const [email, setEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"ADMIN" | "MEMBER">("MEMBER");
  const [emailError, setEmailError] = useState<string>();
  const query = trpc.viewer.organizations.members.useQuery({ organizationId }, { initialData });
  const invalidate = (): Promise<void> => utils.viewer.organizations.members.invalidate({ organizationId });
  const onError = (error: OrganizationMemberError): void => {
    showToast(t(organizationMemberErrorKey(error)), "error");
  };
  const mutationOptions = { onError, onSuccess: invalidate };
  const invite = trpc.viewer.organizations.invite.useMutation({
    ...mutationOptions,
    onSuccess: async () => {
      setEmail("");
      await invalidate();
    },
  });
  const resend = trpc.viewer.organizations.resendInvitation.useMutation(mutationOptions);
  const revoke = trpc.viewer.organizations.revokeInvitation.useMutation(mutationOptions);
  const changeRole = trpc.viewer.organizations.changeRole.useMutation(mutationOptions);
  const removeMember = trpc.viewer.organizations.removeMember.useMutation(mutationOptions);

  if (query.isPending) {
    return <div aria-label={t("loading")} className="bg-subtle h-72 animate-pulse rounded-xl" />;
  }
  if (!query.data || query.isError) {
    return <Alert message={t("organization_members_load_error")} severity="error" />;
  }

  const data = query.data;
  const isManager = data.actorRole === "OWNER" || data.actorRole === "ADMIN";
  const isFull = data.acceptedSeats >= data.seatLimit;
  const canInvite = data.canManageInvitations && !isFull;
  const ownerCount = data.members.filter(({ role }) => role === "OWNER").length;
  let managementState: ReactNode = null;
  if (!isManager) managementState = <Alert message={t("organization_members_read_only")} severity="info" />;
  if (isManager && !data.canManageInvitations) {
    managementState = <Alert message={t("organization_members_team_required")} severity="warning" />;
  }

  return (
    <SettingsHeader
      borderInShellHeader
      description={t("organization_members_description")}
      title={t("organization_members")}>
      <div className="space-y-6 py-6">
        <section className="border-subtle rounded-xl border bg-default p-5">
          <p className="text-emphasis text-lg font-semibold">
            {t("organization_members_seats", { limit: data.seatLimit, used: data.acceptedSeats })}
          </p>
          <p className="text-subtle mt-1 text-sm">{t("organization_members_billed_seats")}</p>
        </section>

        {managementState}

        {data.canManageInvitations ? (
          <section className="border-subtle rounded-xl border bg-default p-5">
            {isFull ? (
              <p className="text-error text-sm">
                {t("organization_members_full", { limit: data.seatLimit })}
              </p>
            ) : null}
            <form
              className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end"
              noValidate
              onSubmit={(event) => {
                event.preventDefault();
                const normalizedEmail = email.trim();
                if (!emailPattern.test(normalizedEmail)) {
                  setEmailError(t("organization_members_error_invalid"));
                  return;
                }
                setEmailError(undefined);
                invite.mutate({ email: normalizedEmail, organizationId, role: inviteRole });
              }}>
              <div className="flex-1">
                <TextField
                  disabled={!canInvite || invite.isPending}
                  label={t("organization_members_email")}
                  name="email"
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="name@example.com"
                  type="email"
                  value={email}
                />
                {emailError ? (
                  <p className="text-error mt-2 text-sm" role="alert">
                    {emailError}
                  </p>
                ) : null}
              </div>
              <label className="text-emphasis flex flex-col gap-1 text-sm font-medium">
                <span>{t("organization_members_invitation_role")}</span>
                <select
                  aria-label={t("organization_members_invitation_role")}
                  className="border-subtle bg-default h-9 rounded-md border px-3 text-sm"
                  disabled={!canInvite || invite.isPending}
                  onChange={(event) => setInviteRole(event.target.value as "ADMIN" | "MEMBER")}
                  value={inviteRole}>
                  <option value="MEMBER">{t("member")}</option>
                  <option value="ADMIN">{t("admin")}</option>
                </select>
              </label>
              <Button disabled={!canInvite} loading={invite.isPending} type="submit">
                {t("organization_members_send_invitation")}
              </Button>
            </form>
          </section>
        ) : null}

        <section className="border-subtle rounded-xl border bg-default">
          <h2 className="border-subtle border-b px-5 py-4 text-base font-semibold text-emphasis">
            {t("organization_members_accepted")}
          </h2>
          <ul className="divide-subtle divide-y">
            {data.members.map((member) => {
              const label = member.name ?? member.email;
              const protectsLastOwner = member.role === "OWNER" && ownerCount === 1;
              return (
                <li className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center" key={member.id}>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-emphasis">{label}</p>
                    <p className="truncate text-sm text-subtle">
                      {member.email} · {t(member.role.toLowerCase())}
                    </p>
                  </div>
                  {data.canManageInvitations ? (
                    <div className="flex items-center gap-2">
                      <select
                        aria-label={t("organization_members_change_role_for", { name: label })}
                        className="border-subtle bg-default h-8 rounded-md border px-2 text-sm"
                        disabled={protectsLastOwner || changeRole.isPending}
                        onChange={(event) =>
                          changeRole.mutate({
                            memberUserId: member.id,
                            organizationId,
                            role: event.target.value as "ADMIN" | "MEMBER",
                          })
                        }
                        value={member.role}>
                        {member.role === "OWNER" ? <option value="OWNER">{t("owner")}</option> : null}
                        <option value="ADMIN">{t("admin")}</option>
                        <option value="MEMBER">{t("member")}</option>
                      </select>
                      <Button
                        aria-label={t("organization_members_remove_name", { name: label })}
                        color="destructive"
                        disabled={protectsLastOwner}
                        loading={removeMember.isPending}
                        onClick={() => removeMember.mutate({ memberUserId: member.id, organizationId })}
                        size="sm">
                        {t("organization_members_remove")}
                      </Button>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </section>

        {data.canManageInvitations ? (
          <section className="border-subtle rounded-xl border bg-default">
            <h2 className="border-subtle border-b px-5 py-4 text-base font-semibold text-emphasis">
              {t("organization_members_pending")}
            </h2>
            <ul className="divide-subtle divide-y">
              {data.pendingInvitations.map((invitation) => (
                <li className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center" key={invitation.id}>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-emphasis">{invitation.email}</p>
                    <p className="text-sm text-subtle">{t(invitation.role.toLowerCase())}</p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      aria-label={t("organization_members_resend_email", { email: invitation.email })}
                      color="secondary"
                      disabled={resend.isPending}
                      onClick={() => resend.mutate({ invitationId: invitation.id, organizationId })}>
                      {t("organization_members_resend")}
                    </Button>
                    <Button
                      aria-label={t("organization_members_revoke_email", { email: invitation.email })}
                      color="destructive"
                      disabled={revoke.isPending}
                      onClick={() => revoke.mutate({ invitationId: invitation.id, organizationId })}>
                      {t("organization_members_revoke")}
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>
    </SettingsHeader>
  );
}

export { OrganizationMembersPanel, organizationMemberErrorKey };
