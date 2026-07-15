"use client";

import SettingsHeader from "@calcom/features/settings/appDir/SettingsHeader";
import { useLocale } from "@calcom/lib/hooks/useLocale";
import { Button } from "@calcom/ui/components/button";
import { useWebPush } from "@calcom/web/modules/notifications/hooks/useWebPush";

const PushNotificationsView = () => {
  const { t } = useLocale();
  const { subscribe, unsubscribe, isSubscribed, isLoading } = useWebPush();

  return (
    <SettingsHeader
      eyebrow={t("my_account")}
      title={t("push_notifications")}
      description={t("push_notifications_description")}
      borderInShellHeader={true}>
      <div className="pt-8 pb-10">
        <Button color="primary" onClick={isSubscribed ? unsubscribe : subscribe} disabled={isLoading}>
          {isSubscribed ? t("disable_browser_notifications") : t("allow_browser_notifications")}
        </Button>
      </div>
    </SettingsHeader>
  );
};

export default PushNotificationsView;
