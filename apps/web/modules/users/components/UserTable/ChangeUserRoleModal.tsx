import { useCurrentSession as useSession } from "@calcom/features/auth/lib/useCurrentSession";
import type { Dispatch } from "react";
import type { UserTableAction, UserTableState } from "./types";

export function ChangeUserRoleModal(props: { state: UserTableState; dispatch: Dispatch<UserTableAction> }) {
  const { data: session } = useSession();
  const orgId = session?.user.org?.id;
  if (!orgId || !props.state.changeMemberRole.user) return null;

  return null;
}
