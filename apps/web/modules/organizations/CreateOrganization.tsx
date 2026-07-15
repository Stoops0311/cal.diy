"use client";

import type { BillingIntervalType } from "@calcom/features/billing/lib/plans";
import SettingsHeader from "@calcom/features/settings/appDir/SettingsHeader";
import { useLocale } from "@calcom/lib/hooks/useLocale";
import { trpc } from "@calcom/trpc/react";
import { Button } from "@calcom/ui/components/button";
import { TextField } from "@calcom/ui/components/form";
import { Icon } from "@calcom/ui/components/icon";
import { showToast } from "@calcom/ui/components/toast";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { bindUpgradeIntentToOrganization, normalizeRelativePath } from "../billing/upgradeIntent";
import { usePaidPlanCheckout } from "../billing/usePaidPlanCheckout";

type OrganizationInput = { name: string; slug: string };
type CreateOrganizationFormProps = {
  isPending: boolean;
  onSubmit(input: OrganizationInput): void;
  submitLabel?: string;
};
type CreateOrganizationProps = {
  checkoutInterval?: BillingIntervalType;
  returnTo: string;
};

function slugify(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 100);
}

function withOrganizationId(returnTo: string, organizationId: number): string {
  const url = new URL(returnTo, "http://convenio.local");
  url.searchParams.set("organizationId", String(organizationId));
  return `${url.pathname}${url.search}${url.hash}`;
}

function safeReturnTo(value: string | undefined): string {
  return normalizeRelativePath(value ?? "") ?? "/settings/billing";
}

function CreateOrganizationForm({ isPending, onSubmit, submitLabel }: CreateOrganizationFormProps) {
  const { t } = useLocale();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugEdited, setSlugEdited] = useState(false);
  const actionLabel = submitLabel ?? t("organization_bootstrap_create");

  return (
    <form
      aria-label={actionLabel}
      className="space-y-5 motion-reduce:[&_button]:transition-none [@media(pointer:coarse)]:[&_button]:min-h-11 [@media(pointer:coarse)]:[&_input]:min-h-11"
      onSubmit={(event) => {
        event.preventDefault();
        if (isPending) return;
        const normalizedName = name.trim();
        const normalizedSlug = slugify(slug);
        if (!normalizedName || !normalizedSlug) return;
        onSubmit({ name: normalizedName, slug: normalizedSlug });
      }}>
      <TextField
        autoComplete="organization"
        label={t("organization_name")}
        maxLength={100}
        name="name"
        onChange={(event) => {
          const nextName = event.target.value;
          setName(nextName);
          if (!slugEdited) setSlug(slugify(nextName));
        }}
        required
        value={name}
      />
      <TextField
        hint={t("organization_bootstrap_slug_hint")}
        label={t("slug")}
        maxLength={100}
        name="slug"
        onChange={(event) => {
          setSlugEdited(true);
          setSlug(slugify(event.target.value));
        }}
        pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
        required
        value={slug}
      />
      <Button
        aria-label={actionLabel}
        className="w-full justify-center sm:w-auto motion-reduce:[&_svg]:animate-none"
        loading={isPending}
        type="submit">
        {actionLabel}
      </Button>
    </form>
  );
}

function CreateOrganization({ checkoutInterval, returnTo }: CreateOrganizationProps) {
  const { t } = useLocale();
  const router = useRouter();
  const paidCheckout = usePaidPlanCheckout({
    returnTo,
    onBeforeNavigate: ({ organizationId }) => {
      if (organizationId) bindUpgradeIntentToOrganization(organizationId);
    },
  });
  const create = trpc.viewer.organizations.create.useMutation({
    onError: (error) => showToast(error.message || t("organization_bootstrap_error"), "error"),
    onSuccess: ({ organizationId }) => {
      if (checkoutInterval) {
        paidCheckout.startCheckout({ interval: checkoutInterval, plan: "TEAM" }, organizationId);
        return;
      }
      router.push(withOrganizationId(returnTo, organizationId));
    },
  });

  return (
    <SettingsHeader
      borderInShellHeader
      description={t("organization_bootstrap_description")}
      title={t("organization_bootstrap_title")}>
      <div className="border-subtle rounded-b-lg border border-t-0 bg-default px-4 py-6 sm:px-6 sm:py-8">
        <div className="mb-7 flex gap-3 rounded-xl border border-blue-200 bg-blue-50 p-4 text-blue-950 dark:border-blue-400/20 dark:bg-blue-400/10 dark:text-blue-100">
          <Icon className="mt-0.5 h-5 w-5 shrink-0 text-blue-600 dark:text-blue-300" name="users" />
          <div>
            <p className="text-sm font-medium">{t("organization_bootstrap_owner_only")}</p>
            <p className="mt-1 text-sm leading-6 opacity-75">{t("organization_bootstrap_team_unlock")}</p>
          </div>
        </div>
        <CreateOrganizationForm
          isPending={create.isPending || paidCheckout.pendingPlan !== undefined}
          onSubmit={(input) => create.mutate(input)}
        />
      </div>
    </SettingsHeader>
  );
}

export { CreateOrganization, CreateOrganizationForm, safeReturnTo, slugify, withOrganizationId };
