"use client";

import type { getServerSideProps } from "@calcom/app-store/_pages/setup/_getServerSideProps";
import { useCurrentSession as useSession } from "@calcom/features/auth/lib/useCurrentSession";
import { useCompatSearchParams } from "@calcom/lib/hooks/useCompatSearchParams";
import type { inferSSRProps } from "@calcom/types/inferSSRProps";
import { SkeletonText } from "@calcom/ui/components/skeleton";
import { AppSetupPage } from "@calcom/web/components/apps/AppSetupPage";
import { useRouter } from "next/navigation";

export type PageProps = inferSSRProps<typeof getServerSideProps>;

export default function SetupInformation(props: PageProps) {
  const searchParams = useCompatSearchParams();
  const router = useRouter();
  const slug = searchParams?.get("slug") as string;
  const { status } = useSession();

  if (status === "loading") {
    return (
      <div
        className="bg-default mx-auto flex min-h-screen w-full max-w-xl flex-col gap-4 px-4 py-10 sm:py-16"
        aria-busy="true">
        <SkeletonText className="h-12 w-12" />
        <SkeletonText className="h-8 w-64" />
        <div className="border-subtle border-b" />
        <SkeletonText className="h-9 w-full" />
        <SkeletonText className="h-9 w-full" />
        <SkeletonText className="h-9 w-full" />
      </div>
    );
  }

  if (status === "unauthenticated") {
    const urlSearchParams = new URLSearchParams({
      callbackUrl: `/apps/${slug}/setup`,
    });
    router.replace(`/auth/login?${urlSearchParams.toString()}`);
  }

  return <AppSetupPage slug={slug} {...props} />;
}
