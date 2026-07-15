"use client";

import SettingsHeader from "@calcom/features/settings/appDir/SettingsHeader";
import { useLocale } from "@calcom/lib/hooks/useLocale";
import { trpc } from "@calcom/trpc/react";
import { showToast } from "@calcom/ui/components/toast";
import { useState } from "react";
import { OAuthClientsList } from "../oauth/OAuthClientsList";
import { type OAuthClientDetails, OAuthClientDetailsDialog } from "../oauth/view/OAuthClientDetailsDialog";
import { OAuthClientsAdminSkeleton } from "./oauth-clients-admin-skeleton";

export default function OAuthClientsAdminView() {
  const { t } = useLocale();
  const utils = trpc.useUtils();
  const [selectedClient, setSelectedClient] = useState<OAuthClientDetails | null>(null);

  const { data: pendingClients, isLoading: isPendingClientsLoading } = trpc.viewer.oAuth.listClients.useQuery(
    {
      status: "PENDING",
    }
  );
  const { data: rejectedClients, isLoading: isRejectedClientsLoading } =
    trpc.viewer.oAuth.listClients.useQuery({
      status: "REJECTED",
    });
  const { data: approvedClients, isLoading: isApprovedClientsLoading } =
    trpc.viewer.oAuth.listClients.useQuery({
      status: "APPROVED",
    });

  const updateStatusMutation = trpc.viewer.oAuth.updateClient.useMutation({
    onSuccess: async (data) => {
      showToast(t("oauth_client_status_updated", { name: data.name, status: data.status }), "success");

      setSelectedClient((prev) => {
        if (!prev) return prev;
        if (prev.clientId !== data.clientId) return prev;
        return {
          ...prev,
          status: data.status,
          rejectionReason: data.rejectionReason,
        };
      });

      utils.viewer.oAuth.listClients.invalidate();
    },
    onError: (error) => {
      showToast(`${t("oauth_client_status_update_error")}: ${error.message}`, "error");
    },
  });

  const handleCloseClientDialog = () => {
    setSelectedClient(null);
  };

  const handleApprove = (clientId: string) => {
    updateStatusMutation.mutate({ clientId, status: "APPROVED" });
  };

  const handleReject = (input: { clientId: string; rejectionReason: string }) => {
    updateStatusMutation.mutate({
      clientId: input.clientId,
      status: "REJECTED",
      rejectionReason: input.rejectionReason,
    });
  };

  if (isPendingClientsLoading || isRejectedClientsLoading || isApprovedClientsLoading) {
    return <OAuthClientsAdminSkeleton />;
  }

  return (
    <SettingsHeader title={t("oauth_clients_admin")} description={t("oauth_clients_admin_description")}>
      <div className="space-y-10">
        {(
          [
            {
              status: "pending",
              labelKey: "pending",
              emptyKey: "no_pending_oauth_clients",
              clients: pendingClients,
            },
            {
              status: "rejected",
              labelKey: "rejected",
              emptyKey: "no_rejected_oauth_clients",
              clients: rejectedClients,
            },
            {
              status: "approved",
              labelKey: "approved",
              emptyKey: "no_approved_oauth_clients",
              clients: approvedClients,
            },
          ] as const
        ).map(({ status, labelKey, emptyKey, clients }) => (
          <section
            key={status}
            className="space-y-3 rounded-2xl border border-subtle bg-default p-4 sm:p-5"
            data-testid={`oauth-client-admin-${status}-section`}>
            <h2 className="font-cal text-emphasis text-xl">{t(labelKey)}</h2>
            {clients && clients.length > 0 ? (
              <OAuthClientsList
                clients={clients}
                onSelectClient={(client) => setSelectedClient(client)}
                showStatus
              />
            ) : (
              <p className="text-subtle text-sm">{t(emptyKey)}</p>
            )}
          </section>
        ))}
      </div>

      <OAuthClientDetailsDialog
        open={Boolean(selectedClient)}
        onOpenChange={(open) => !open && handleCloseClientDialog()}
        client={selectedClient}
        onApprove={handleApprove}
        onReject={handleReject}
        isStatusChangePending={updateStatusMutation.isPending}
      />
    </SettingsHeader>
  );
}
