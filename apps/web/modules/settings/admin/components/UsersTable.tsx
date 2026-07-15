import { getPlaceholderAvatar } from "@calcom/lib/defaultAvatarImage";
import { getUserAvatarUrl } from "@calcom/lib/getAvatarUrl";
import { useLocale } from "@calcom/lib/hooks/useLocale";
import { SMSLockState } from "@calcom/prisma/enums";
import { trpc } from "@calcom/trpc/react";
import { Avatar } from "@calcom/ui/components/avatar";
import { Badge } from "@calcom/ui/components/badge";
import type { IconName } from "@calcom/ui/components/icon";
import { SkeletonText } from "@calcom/ui/components/skeleton";
import { DropdownActions, Table } from "@calcom/ui/components/table";

const { Cell, ColumnTitle, Header, Row } = Table;

type Props = {
  setSMSLockState: (param: { userId?: number; teamId?: number; lock: boolean }) => void;
};

type User = {
  id: number;
  username: string | null;
  name: string | null;
  email: string;
  smsLockState: SMSLockState;
  avatarUrl: string | null;
};

type Team = {
  id: number;
  name: string;
  smsLockState: SMSLockState;
  slug: string | null;
  logoUrl?: string | null;
};

function UsersTable({ setSMSLockState }: Props) {
  const { t } = useLocale();
  const { data: usersAndTeams } = trpc.viewer.admin.getSMSLockStateTeamsUsers.useQuery();

  if (!usersAndTeams) {
    return (
      <div className="overflow-hidden rounded-2xl border border-subtle bg-default" role="status">
        <span className="sr-only">{t("loading")}</span>
        {[0, 1, 2].map((row) => (
          <div
            key={row}
            className={`flex items-center gap-4 p-4 ${row !== 2 ? "border-subtle border-b" : ""}`}>
            <div className="bg-emphasis h-10 w-10 rounded-full" />
            <SkeletonText className="h-4 w-64" />
          </div>
        ))}
      </div>
    );
  }

  const users = usersAndTeams.users.locked.concat(usersAndTeams.users.reviewNeeded);
  const teams = usersAndTeams.teams.locked.concat(usersAndTeams.teams.reviewNeeded);

  return <LockStatusTable users={users} teams={teams} setSMSLockState={setSMSLockState} />;
}

const LockStatusTable = ({
  users = [],
  teams = [],
  setSMSLockState,
}: {
  users?: User[];
  teams?: Team[];
  setSMSLockState: (param: { userId?: number; teamId?: number; lock: boolean }) => void;
}) => {
  const { t } = useLocale();

  // Only LOCKED and REVIEW_NEEDED rows are ever fed into this table
  const smsLockStateBadge = (state: SMSLockState) =>
    state === SMSLockState.LOCKED ? (
      <Badge variant="red">{t("locked")}</Badge>
    ) : (
      <Badge variant="gray">{t("review_needed")}</Badge>
    );

  function getActions({ user, team }: { user?: User; team?: Team }) {
    const smsLockState = user?.smsLockState ?? team?.smsLockState;
    if (!smsLockState) return [];

    const actions = [
      {
        id: "unlock-sms",
        label: smsLockState === SMSLockState.LOCKED ? t("unlock_sms_sending") : t("lock_sms_sending"),
        onClick: () =>
          setSMSLockState({
            userId: user ? user.id : undefined,
            teamId: team ? team.id : undefined,
            lock: smsLockState !== SMSLockState.LOCKED,
          }),
        icon: "lock" as IconName,
      },
    ];
    if (smsLockState === SMSLockState.REVIEW_NEEDED) {
      actions.push({
        id: "reviewed",
        label: t("mark_as_reviewed"),
        onClick: () =>
          setSMSLockState({
            userId: user ? user.id : undefined,
            teamId: team ? team.id : undefined,
            lock: false,
          }),
        icon: "pencil" as IconName,
      });
    }

    return actions;
  }

  if (users.length === 0 && teams.length === 0) {
    return (
      <div className="rounded-2xl border border-subtle bg-subtle p-8 text-center">
        <p className="font-medium text-emphasis">{t("no_sms_restrictions")}</p>
        <p className="mt-1 text-subtle text-sm">{t("no_sms_restrictions_description")}</p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-subtle bg-default">
      <Table>
        <Header>
          <ColumnTitle widthClassNames="w-auto">{t("user_team")}</ColumnTitle>
          <ColumnTitle>{t("status")}</ColumnTitle>
          <ColumnTitle widthClassNames="w-auto">
            <span className="sr-only">{t("edit")}</span>
          </ColumnTitle>
        </Header>

        <tbody className="divide-y divide-subtle">
          {users.map((user) => (
            <Row key={`user-${user.id}`}>
              <Cell widthClassNames="w-auto">
                <div className="min-h-10 flex items-center">
                  {" "}
                  <Avatar
                    size="md"
                    alt={t("avatar_of", { name: user.username || t("nameless_user") })}
                    imageSrc={getUserAvatarUrl(user)}
                  />
                  <div className="text-subtle ml-4 font-medium">
                    <span className="text-default">{user.name}</span>
                    <span className="ml-3">/{user.username}</span>
                    <br />
                    <span className="break-all">{user.email}</span>
                  </div>
                </div>
              </Cell>

              <Cell>{smsLockStateBadge(user.smsLockState)}</Cell>
              <Cell widthClassNames="w-auto">
                <DropdownActions actions={getActions({ user })} />
              </Cell>
            </Row>
          ))}
          {teams.map((team) => (
            <Row key={`team-${team.id}`}>
              <Cell widthClassNames="w-auto">
                <div className="min-h-10 flex items-center">
                  <Avatar
                    size="md"
                    alt={t("avatar_of", { name: team.name })}
                    imageSrc={getPlaceholderAvatar(team.logoUrl, team.name)}
                  />
                  <div className="text-subtle ml-4 font-medium">
                    <span className="text-default">{team.name}</span>
                    <span className="ml-3 break-all">/team/{team.slug}</span>
                  </div>
                </div>
              </Cell>
              <Cell>{smsLockStateBadge(team.smsLockState)}</Cell>
              <Cell widthClassNames="w-auto">
                <DropdownActions actions={getActions({ team })} />
              </Cell>
            </Row>
          ))}
        </tbody>
      </Table>
    </div>
  );
};
export default UsersTable;
