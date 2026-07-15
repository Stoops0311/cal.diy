import { prisma } from "@calcom/prisma";

export type AcceptedOrganizationContext = {
  id: number;
  name: string;
  role: "OWNER" | "ADMIN" | "MEMBER";
  slug: string | null;
};

export async function getAcceptedOrganizationContexts({
  preferredOrganizationId,
  userId,
}: {
  preferredOrganizationId?: number;
  userId: number;
}): Promise<AcceptedOrganizationContext[]> {
  const memberships = await prisma.membership.findMany({
    orderBy: { teamId: "asc" },
    select: {
      role: true,
      team: { select: { id: true, name: true, slug: true } },
    },
    where: {
      accepted: true,
      team: { archivedAt: null, isOrganization: true },
      userId,
    },
  });
  const contexts = memberships.map(({ role, team }) => ({ ...team, role }));
  if (!preferredOrganizationId) return contexts;
  return contexts.sort((left, right) => {
    if (left.id === preferredOrganizationId) return -1;
    if (right.id === preferredOrganizationId) return 1;
    return left.id - right.id;
  });
}
