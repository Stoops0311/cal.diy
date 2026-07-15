"use client";

import { Dialog } from "@calcom/features/components/controlled-dialog";
import SettingsHeader from "@calcom/features/settings/appDir/SettingsHeader";
import { APP_NAME } from "@calcom/lib/constants";
import { useLocale } from "@calcom/lib/hooks/useLocale";
import type { RouterOutputs } from "@calcom/trpc/react";
import { Button } from "@calcom/ui/components/button";
import { DialogContent } from "@calcom/ui/components/dialog";
import { EmptyScreen } from "@calcom/ui/components/empty-screen";
import { useEffect, useState } from "react";
import ApiKeyDialogForm from "~/api-keys/api-keys/components/ApiKeyDialogForm";
import type { TApiKeys } from "~/api-keys/api-keys/components/ApiKeyListItem";
import ApiKeyListItem from "~/api-keys/api-keys/components/ApiKeyListItem";

export const apiKeyModalRef = {
  current: null as null | ((show: boolean) => void),
};
export const apiKeyToEditRef = {
  current: null as null | ((apiKey: (TApiKeys & { neverExpires?: boolean }) | undefined) => void),
};

export const NewApiKeyButton = () => {
  const { t } = useLocale();
  return (
    <Button
      color="secondary"
      StartIcon="plus"
      size="sm"
      variant="fab"
      onClick={() => {
        apiKeyModalRef.current?.(true);
        apiKeyToEditRef.current?.(undefined);
      }}>
      {t("add")}
    </Button>
  );
};

type Props = {
  apiKeys: RouterOutputs["viewer"]["apiKeys"]["list"];
};

const ApiKeysView = ({ apiKeys: data }: Props) => {
  const { t } = useLocale();

  const [apiKeyModal, setApiKeyModal] = useState(false);
  const [apiKeyToEdit, setApiKeyToEdit] = useState<(TApiKeys & { neverExpires?: boolean }) | undefined>(
    undefined
  );

  useEffect(() => {
    apiKeyModalRef.current = setApiKeyModal;
    apiKeyToEditRef.current = setApiKeyToEdit;
    return () => {
      apiKeyModalRef.current = null;
      apiKeyToEditRef.current = null;
    };
  }, []);

  return (
    <SettingsHeader
      eyebrow={t("developer")}
      title={t("api_keys")}
      description={t("api_keys_description")}
      CTA={<NewApiKeyButton />}
      borderInShellHeader={true}>
      <div>
        {data?.length ? (
          <>
            <div className="border-subtle border-b">
              {data.map((apiKey, index) => (
                <ApiKeyListItem
                  key={apiKey.id}
                  apiKey={apiKey}
                  lastItem={data.length === index + 1}
                  onEditClick={() => {
                    setApiKeyToEdit(apiKey);
                    setApiKeyModal(true);
                  }}
                />
              ))}
            </div>
          </>
        ) : (
          <EmptyScreen
            Icon="link"
            headline={t("create_first_api_key")}
            description={t("create_first_api_key_description", { appName: APP_NAME })}
            className="mt-6"
            buttonRaw={<NewApiKeyButton />}
          />
        )}
      </div>

      <Dialog open={apiKeyModal} onOpenChange={setApiKeyModal}>
        <DialogContent type={null} title={apiKeyToEdit ? t("edit_api_key") : t("create_api_key")}>
          <ApiKeyDialogForm handleClose={() => setApiKeyModal(false)} defaultValues={apiKeyToEdit} />
        </DialogContent>
      </Dialog>
    </SettingsHeader>
  );
};

export default ApiKeysView;
