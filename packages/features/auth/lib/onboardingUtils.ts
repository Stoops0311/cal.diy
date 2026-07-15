import dayjs from "@calcom/dayjs";
import { FeaturesRepository } from "@calcom/features/flags/features.repository";
import { UserRepository } from "@calcom/features/users/repositories/UserRepository";
import { prisma } from "@calcom/prisma";

const ONBOARDING_INTRODUCED_AT = dayjs("September 1 2021").toISOString();

/**
 * Checks if a user needs onboarding on the server side.
 * Returns the onboarding path if redirect is needed, null otherwise.
 *
 * @param userId - The user ID to check
 * @param options - Optional configuration
 * @param options.checkEmailVerification - Whether to check if email verification is required
 * @param options.organizationId - Retained for caller compatibility; organization presence does not skip setup
 */
export async function checkOnboardingRedirect(
  userId: number,
  options?: {
    checkEmailVerification?: boolean;
    organizationId?: number | null;
  }
): Promise<string | null> {
  // Query user data needed for onboarding check using UserRepository
  const userRepository = new UserRepository(prisma);
  const user = await userRepository.findById({ id: userId });

  if (!user) {
    return null;
  }

  const shouldShowOnboarding =
    !user.completedOnboarding && dayjs(user.createdDate).isAfter(ONBOARDING_INTRODUCED_AT);

  if (!shouldShowOnboarding) {
    return null;
  }

  // Check email verification if needed
  const featuresRepository = new FeaturesRepository(prisma);

  if (options?.checkEmailVerification) {
    const emailVerificationEnabled =
      await featuresRepository.checkIfFeatureIsEnabledGlobally("email-verification");

    if (!user.emailVerified && user.identityProvider === "CAL" && emailVerificationEnabled) {
      // User needs email verification, redirect to verification page
      return "/auth/verify-email";
    }
  }

  // Determine which onboarding path to use
  const onboardingV3Enabled = await featuresRepository.checkIfFeatureIsEnabledGlobally("onboarding-v3");

  return onboardingV3Enabled ? "/onboarding/getting-started" : "/getting-started";
}
