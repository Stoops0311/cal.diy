"use client";

import { useLocale } from "@calcom/lib/hooks/useLocale";
import { trpc } from "@calcom/trpc/react";
import { showToast } from "@calcom/ui/components/toast";
import { useRouter } from "next/navigation";
import { useRef } from "react";
import { CreateOrganizationForm } from "../../organizations/CreateOrganization";
import { OnboardingCard } from "../components/OnboardingCard";
import { OnboardingLayout } from "../components/OnboardingLayout";
import { useOnboardingStore } from "../store/onboarding-store";

type SubmittedOrganization = {
  name: string;
  slug: string;
};

export function BringTeamView({ userEmail }: { userEmail: string }) {
  const { t } = useLocale();
  const router = useRouter();
  const setCreatedOrganization = useOnboardingStore((state) => state.setCreatedOrganization);
  const submitted = useRef<SubmittedOrganization | null>(null);
  const create = trpc.viewer.organizations.create.useMutation({
    onError: () => showToast(t("onboarding_team_create_error"), "error"),
    onSuccess: ({ organizationId }) => {
      if (!submitted.current) return;

      setCreatedOrganization({
        id: organizationId,
        name: submitted.current.name,
        slug: submitted.current.slug,
      });
      router.push("/onboarding/personal/settings");
    },
  });

  return (
    <OnboardingLayout currentStep={1} totalSteps={4} userEmail={userEmail}>
      <OnboardingCard
        footer={null}
        subtitle={t("onboarding_team_create_description")}
        title={t("onboarding_team_create_title")}>
        <p className="text-sm text-subtle">{t("onboarding_team_create_boundary")}</p>
        <CreateOrganizationForm
          isPending={create.isPending}
          onSubmit={(input) => {
            submitted.current = input;
            create.mutate(input);
          }}
          submitLabel={t("onboarding_team_create_action")}
        />
      </OnboardingCard>
    </OnboardingLayout>
  );
}
