import { getAuthProvider, getClerkBackendClient } from "@calcom/features/auth/lib/clerkClient";
import { ErrorCode } from "@calcom/features/auth/lib/ErrorCode";
import { deleteUser } from "@calcom/features/users/lib/deleteUser";
import { prisma } from "@calcom/prisma";
import { IdentityProvider } from "@calcom/prisma/enums";
import type { TrpcSessionUser } from "@calcom/trpc/server/types";

type DeleteMeWithoutPasswordOptions = {
  ctx: {
    user: NonNullable<TrpcSessionUser>;
  };
};

export const deleteMeWithoutPasswordHandler = async ({ ctx }: DeleteMeWithoutPasswordOptions) => {
  const user = await prisma.user.findUnique({
    where: { id: ctx.user.id },
    select: {
      clerkUserId: true,
      email: true,
      id: true,
      identityProvider: true,
      metadata: true,
      twoFactorEnabled: true,
    },
  });
  if (!user) {
    throw new Error(ErrorCode.UserNotFound);
  }

  if (getAuthProvider() === "clerk") {
    if (!user.clerkUserId) throw new Error(ErrorCode.UserNotFound);
    await getClerkBackendClient().users.deleteUser(user.clerkUserId);
    await deleteUser(user);
    return;
  }

  if (user.identityProvider === IdentityProvider.CAL) {
    throw new Error(ErrorCode.SocialIdentityProviderRequired);
  }

  if (user.twoFactorEnabled) {
    throw new Error(ErrorCode.SocialIdentityProviderRequired);
  }

  await deleteUser(user);

  return;
};
