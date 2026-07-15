import { useLocale } from "@calcom/lib/hooks/useLocale";
import { sessionStorage } from "@calcom/lib/webstorage";
import { trpc } from "@calcom/trpc/react";
import { showToast } from "@calcom/ui/components/toast";
import { setShowWelcomeToCalcomModalFlag } from "@calcom/web/modules/shell/hooks/useWelcomeToCalcomModal";
import { useRouter } from "next/navigation";

const ONBOARDING_REDIRECT_KEY = "onBoardingRedirect";
const ORG_MODAL_STORAGE_KEY = "showNewOrgModal";

const DEFAULT_EVENT_TYPES = [
  {
    title: "15min_meeting",
    slug: "15min",
    length: 15,
  },
  {
    title: "30min_meeting",
    slug: "30min",
    length: 30,
  },
  {
    title: "secret_meeting",
    slug: "secret",
    length: 15,
    hidden: true,
  },
];

export const useSubmitPersonalOnboarding = () => {
  const router = useRouter();
  const { t } = useLocale();
  const utils = trpc.useUtils();

  const { data: eventTypes } = trpc.viewer.eventTypes.list.useQuery();
  const createEventType = trpc.viewer.eventTypesHeavy.create.useMutation();

  const mutation = trpc.viewer.me.updateProfile.useMutation();

  const submitPersonalOnboarding = async (options: { afterComplete?: () => void } = {}): Promise<void> => {
    try {
      await mutation.mutateAsync({ completedOnboarding: true });
      if (eventTypes?.length === 0) {
        await Promise.all(
          DEFAULT_EVENT_TYPES.map((event) =>
            createEventType.mutateAsync({
              hidden: event.hidden,
              length: event.length,
              slug: event.slug,
              title: t(event.title),
            })
          )
        );
      }
      await utils.viewer.me.get.refetch();

      if (options.afterComplete) {
        options.afterComplete();
        return;
      }

      const redirectUrl = localStorage.getItem(ONBOARDING_REDIRECT_KEY);
      if (redirectUrl) {
        localStorage.removeItem(ONBOARDING_REDIRECT_KEY);
        router.push(redirectUrl);
        return;
      }

      const hasOrgModalFlag = sessionStorage.getItem(ORG_MODAL_STORAGE_KEY) === "true";

      if (!hasOrgModalFlag) {
        setShowWelcomeToCalcomModalFlag();
        router.push("/event-types?welcomeToCalcomModal=true");
        return;
      }

      router.push("/event-types?newOrganizationModal=true");
    } catch (error) {
      showToast(t("something_went_wrong"), "error");
      console.error(error);
    }
  };

  return {
    submitPersonalOnboarding,
    isSubmitting: mutation.isPending || createEventType.isPending,
  };
};
