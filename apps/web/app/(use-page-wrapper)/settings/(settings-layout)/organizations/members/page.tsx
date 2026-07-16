import { prisma } from "@calcom/prisma";
import { organizationsRouter } from "@calcom/trpc/server/routers/viewer/organizations/_router";
import { createRouterCaller, getTRPCContext } from "app/_trpc/context";
import { notFound, redirect } from "next/navigation";
import { OrganizationMembersPanel } from "~/organizations/OrganizationMembersPanel";

const membersPath = "/settings/organizations/members";

export default async function OrganizationMembersPage({
  searchParams,
}: {
  searchParams: Promise<{ organizationId?: string }>;
}) {
  const [context, params] = await Promise.all([getTRPCContext(), searchParams]);
  const organizationId = Number(params.organizationId);
  if (!Number.isInteger(organizationId) || organizationId <= 0) notFound();

  const callbackUrl = encodeURIComponent(`${membersPath}?organizationId=${organizationId}`);
  if (!context.user) redirect(`/auth/login?callbackUrl=${callbackUrl}`);

  const organization = await prisma.team.findFirst({
    where: { id: organizationId, isOrganization: true },
    select: {
      id: true,
      members: {
        where: { accepted: true, userId: context.user.id },
        select: { role: true },
      },
    },
  });
  if (!organization || organization.members.length === 0) notFound();

  const initialData = await (await createRouterCaller(organizationsRouter, context)).members({
    organizationId,
  });
  return <OrganizationMembersPanel initialData={initialData} organizationId={organizationId} />;
}
