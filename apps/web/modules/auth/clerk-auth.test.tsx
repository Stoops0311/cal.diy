import { render, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const { signOut } = vi.hoisted(() => ({ signOut: vi.fn() }));

vi.mock("@clerk/nextjs", () => ({
  SignIn: (props: Record<string, unknown>) => <div data-testid="sign-in" {...props} />,
  SignUp: (props: Record<string, unknown>) => <div data-testid="sign-up" {...props} />,
  UserProfile: (props: Record<string, unknown>) => <div data-testid="user-profile" {...props} />,
  useClerk: () => ({ signOut }),
}));

vi.mock("../../components/ui/AuthContainer", () => ({
  default: ({ loading }: { loading?: boolean }) => <div data-loading={loading} />,
}));

import { ClerkAccountSecurity, ClerkLogout, ClerkSignIn, ClerkSignUp } from "./clerk-auth";

describe("Clerk auth surfaces", () => {
  it("uses hash routing on the existing sign-in URL", () => {
    const view = render(<ClerkSignIn />);

    expect(view.getByTestId("sign-in")).toHaveAttribute("routing", "hash");
    expect(view.getByTestId("sign-in")).toHaveAttribute("signUpUrl", "/signup");
    expect(view.getByTestId("sign-in")).toHaveAttribute("fallbackRedirectUrl", "/event-types");
  });

  it("uses hash routing on the existing sign-up URL", () => {
    const view = render(<ClerkSignUp />);

    expect(view.getByTestId("sign-up")).toHaveAttribute("routing", "hash");
    expect(view.getByTestId("sign-up")).toHaveAttribute("signInUrl", "/auth/login");
  });

  it("renders Clerk account security on the existing settings URL", () => {
    const view = render(<ClerkAccountSecurity />);

    expect(view.getByTestId("user-profile")).toHaveAttribute("routing", "hash");
  });

  it("signs out through Clerk and returns to login", async () => {
    render(<ClerkLogout survey={false} />);

    await waitFor(() => expect(signOut).toHaveBeenCalledWith({ redirectUrl: "/auth/login" }));
  });
});
