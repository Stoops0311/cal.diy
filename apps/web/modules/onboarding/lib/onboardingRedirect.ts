const ONBOARDING_REDIRECT_KEY = "onBoardingRedirect";

function storeOnboardingRedirect(redirectUrl: string): void {
  localStorage.setItem(ONBOARDING_REDIRECT_KEY, redirectUrl);
}

function consumeOnboardingRedirect(): string | null {
  const redirectUrl = localStorage.getItem(ONBOARDING_REDIRECT_KEY);
  if (!redirectUrl) return null;
  localStorage.removeItem(ONBOARDING_REDIRECT_KEY);
  return redirectUrl;
}

export { consumeOnboardingRedirect, ONBOARDING_REDIRECT_KEY, storeOnboardingRedirect };
