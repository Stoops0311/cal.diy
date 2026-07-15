"use client";

import { WEBSITE_URL } from "@calcom/lib/constants";
import { SignIn, SignUp, UserProfile, useClerk } from "@clerk/nextjs";
import AuthContainer from "../../components/ui/AuthContainer";
import { useEffect } from "react";

const authSurfaceClassName = "bg-subtle flex min-h-screen items-center justify-center px-4 py-12";

function ClerkSignIn(): React.ReactElement {
  return (
    <main className={authSurfaceClassName}>
      <SignIn routing="hash" signUpUrl="/signup" fallbackRedirectUrl="/event-types" />
    </main>
  );
}

function ClerkSignUp(): React.ReactElement {
  return (
    <main className={authSurfaceClassName}>
      <SignUp routing="hash" signInUrl="/auth/login" fallbackRedirectUrl="/getting-started" />
    </main>
  );
}

function ClerkAccountSecurity(): React.ReactElement {
  return (
    <div className="flex justify-center py-8">
      <UserProfile routing="hash" />
    </div>
  );
}

function ClerkLogout({ survey }: { survey: boolean }): React.ReactElement {
  const clerk = useClerk();

  useEffect(() => {
    clerk.signOut({ redirectUrl: survey ? `${WEBSITE_URL}/cancellation` : "/auth/login" });
  }, [clerk, survey]);

  return <AuthContainer showLogo loading />;
}

export { ClerkAccountSecurity, ClerkLogout, ClerkSignIn, ClerkSignUp };
