"use client";

import { useLocale } from "@calcom/lib/hooks/useLocale";
import { trpc } from "@calcom/trpc/react";
import { Button } from "@calcom/ui/components/button";
import { TextField } from "@calcom/ui/components/form";
import { showToast } from "@calcom/ui/components/toast";
import { useState } from "react";
import UsersTable from "./components/UsersTable";

export default function LockedSMSView() {
  const { t } = useLocale();
  const [username, setUsername] = useState("");
  const [teamSlug, setTeamSlug] = useState("");

  const utils = trpc.useContext();

  const mutation = trpc.viewer.admin.setSMSLockState.useMutation({
    onSuccess: (data) => {
      if (data) {
        showToast(
          data.locked
            ? t("sms_sending_locked_for", { name: data.name })
            : t("sms_sending_unlocked_for", { name: data.name }),
          "success"
        );
      }
      utils.viewer.admin.getSMSLockStateTeamsUsers.invalidate();
    },
    onError: (error) => {
      showToast(`${error}`, "error");
      utils.viewer.admin.getSMSLockStateTeamsUsers.invalidate();
    },
  });

  function setSMSLockState({ userId, teamId, lock }: { userId?: number; teamId?: number; lock: boolean }) {
    mutation.mutate({
      userId,
      teamId,
      lock,
    });
  }

  return (
    <div className="space-y-8">
      <section className="grid overflow-hidden rounded-2xl border border-subtle bg-default md:grid-cols-2">
        <div className="border-subtle p-5 md:border-r md:p-6">
          <p className="font-mono text-[11px] text-subtle uppercase tracking-[0.18em]">{t("person")}</p>
          <h2 className="mt-2 font-cal text-xl text-emphasis">{t("lock_user_sms")}</h2>
          <p className="mt-1 text-subtle text-sm">{t("lock_user_sms_description")}</p>
          <div className="mt-5 flex items-end gap-2">
            <TextField
              containerClassName="flex-1"
              label={t("username")}
              name="sms-lock-username"
              placeholder={t("username_placeholder")}
              onChange={(event) => setUsername(event.target.value)}
              value={username}
            />
            <Button
              type="button"
              disabled={!username.trim() || mutation.isPending}
              loading={mutation.isPending}
              onClick={() => {
                mutation.mutate({ username, lock: true });
                utils.viewer.admin.getSMSLockStateTeamsUsers.invalidate();
              }}>
              {t("lock")}
            </Button>
          </div>
        </div>

        <div className="bg-subtle p-5 md:p-6">
          <p className="font-mono text-[11px] text-subtle uppercase tracking-[0.18em]">{t("team")}</p>
          <h2 className="mt-2 font-cal text-xl text-emphasis">{t("lock_team_sms")}</h2>
          <p className="mt-1 text-subtle text-sm">{t("lock_team_sms_description")}</p>
          <div className="mt-5 flex items-end gap-2">
            <TextField
              containerClassName="flex-1"
              label={t("team_slug")}
              name="sms-lock-team"
              placeholder={t("team_slug_placeholder")}
              onChange={(event) => {
                setTeamSlug(event.target.value);
              }}
              value={teamSlug}
            />
            <Button
              type="button"
              disabled={!teamSlug.trim() || mutation.isPending}
              loading={mutation.isPending}
              onClick={() => {
                mutation.mutate({ teamSlug, lock: true });
                utils.viewer.admin.getSMSLockStateTeamsUsers.invalidate();
              }}>
              {t("lock")}
            </Button>
          </div>
        </div>
      </section>
      <UsersTable setSMSLockState={setSMSLockState} />
    </div>
  );
}
