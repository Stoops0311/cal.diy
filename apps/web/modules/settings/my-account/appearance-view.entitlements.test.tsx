import type { RouterOutputs } from "@calcom/trpc/react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

type UpdateProfileInput = { hideBranding?: boolean };
type UpdateProfileError = { data?: { entitlement?: unknown }; message?: string };
type UpdateProfileResult = {
  appTheme: null;
  brandColor: string;
  darkBrandColor: string;
  metadata: null;
  theme: null;
};

const mocks = vi.hoisted(() => ({
  mutate: vi.fn(),
  mutationOptions: undefined as
    | undefined
    | {
        onError: (error: UpdateProfileError, variables: UpdateProfileInput) => void;
        onSuccess: (data: UpdateProfileResult) => Promise<void>;
      },
  openUpgradePrompt: vi.fn(),
  toast: vi.fn(),
}));

vi.mock("@calcom/features/auth/lib/useCurrentSession", () => ({
  useCurrentSession: () => ({ data: { user: {} } }),
}));
vi.mock("@calcom/features/settings/appDir/SettingsHeader", () => ({
  default: ({ children }: { children: ReactNode }) => <>{children}</>,
}));
vi.mock("@calcom/features/settings/SectionBottomActions", () => ({
  default: ({ children }: { children: ReactNode }) => <>{children}</>,
}));
vi.mock("@calcom/features/settings/ThemeLabel", () => ({ default: () => null }));
vi.mock("@calcom/lib/constants", () => ({
  APP_NAME: "Convenio",
  DEFAULT_DARK_BRAND_COLOR: "#101010",
  DEFAULT_LIGHT_BRAND_COLOR: "#ffffff",
}));
vi.mock("@calcom/lib/getBrandColours", () => ({
  checkWCAGContrastColor: () => true,
  default: () => ({ dark: {}, light: {} }),
}));
vi.mock("@calcom/lib/hooks/useLocale", () => ({
  useLocale: () => ({ t: (key: string) => key }),
}));
vi.mock("@calcom/lib/hooks/useTheme", () => ({ default: () => undefined }));
vi.mock("@calcom/lib/validateBookerLayouts", () => ({ validateBookerLayouts: () => null }));
vi.mock("@calcom/trpc/react", () => ({
  trpc: {
    useUtils: () => ({ viewer: { me: { invalidate: vi.fn() } } }),
    viewer: {
      me: {
        updateProfile: {
          useMutation: (options: NonNullable<typeof mocks.mutationOptions>) => {
            mocks.mutationOptions = options;
            return { isPending: false, mutate: mocks.mutate };
          },
        },
      },
    },
  },
}));
vi.mock("@calcom/ui/components/alert", () => ({ Alert: () => null }));
vi.mock("@calcom/ui/components/button", () => ({
  Button: ({ children }: { children: ReactNode }) => <button type="button">{children}</button>,
}));
vi.mock("@calcom/ui/components/form", () => ({
  ColorPicker: () => null,
  Form: ({ children }: { children: ReactNode }) => <>{children}</>,
  SettingsToggle: ({
    checked,
    disabled,
    onCheckedChange,
    title,
  }: {
    checked: boolean;
    disabled?: boolean;
    onCheckedChange: (checked: boolean) => void;
    title: string;
  }) => (
    <button
      aria-label={title}
      aria-pressed={checked}
      disabled={disabled}
      type="button"
      onClick={() => onCheckedChange(!checked)}
    />
  ),
}));
vi.mock("@calcom/ui/components/toast", () => ({ showToast: mocks.toast }));
vi.mock("@calcom/ui/styles", () => ({ useCalcomTheme: () => undefined }));
vi.mock("app/(use-page-wrapper)/settings/(settings-layout)/my-account/appearance/actions", () => ({
  revalidateSettingsAppearance: vi.fn(),
}));
vi.mock("app/cache/membership", () => ({ revalidateHasTeamPlan: vi.fn() }));
vi.mock("../components/BookerLayoutSelector", () => ({ BookerLayoutSelector: () => null }));
vi.mock("../../billing/UpgradePromptProvider", () => ({
  useUpgradePrompt: () => ({ openUpgradePrompt: mocks.openUpgradePrompt }),
}));

import AppearanceView from "./appearance-view";

const user = {
  appTheme: null,
  brandColor: "#ffffff",
  darkBrandColor: "#101010",
  hideBranding: false,
  metadata: null,
  theme: null,
} as unknown as RouterOutputs["viewer"]["me"]["get"];

const result: UpdateProfileResult = {
  appTheme: null,
  brandColor: "#ffffff",
  darkBrandColor: "#101010",
  metadata: null,
  theme: null,
};

const entitlementError = {
  data: {
    entitlement: {
      capability: "canRemoveBranding",
      effectivePlan: "FREE",
      kind: "capability",
    },
  },
  message: "Forbidden",
};

function getBrandingToggle(): HTMLButtonElement {
  return screen.getByRole("button", { name: "disable_cal_branding" });
}

describe("AppearanceView branding entitlement", () => {
  beforeEach(() => {
    mocks.mutate.mockReset();
    mocks.mutationOptions = undefined;
    mocks.openUpgradePrompt.mockReset();
    mocks.toast.mockReset();
  });

  it("lets a free user ask the server to remove branding", () => {
    render(<AppearanceView user={user} hasPaidPlan={false} />);

    expect(getBrandingToggle()).toBeEnabled();
    fireEvent.click(getBrandingToggle());

    expect(mocks.mutate).toHaveBeenCalledWith({ hideBranding: true });
    expect(getBrandingToggle()).toHaveAttribute("aria-pressed", "false");
  });

  it("restores the toggle and opens the exact Pro prompt after a structured denial", () => {
    render(<AppearanceView user={user} hasPaidPlan={true} />);
    fireEvent.click(getBrandingToggle());
    expect(getBrandingToggle()).toHaveAttribute("aria-pressed", "true");

    act(() => mocks.mutationOptions?.onError(entitlementError, { hideBranding: true }));

    expect(getBrandingToggle()).toHaveAttribute("aria-pressed", "false");
    expect(mocks.openUpgradePrompt).toHaveBeenCalledWith({
      capability: "canRemoveBranding",
      description: "billing_upgrade_remove_branding_description",
      featureName: "billing_upgrade_remove_branding_feature",
      requiredPlan: "PRO",
      resume: { kind: "returnToFeature" },
      returnTo: "/settings/my-account/appearance",
    });
    expect(mocks.toast).not.toHaveBeenCalled();
  });

  it("restores the toggle and keeps a generic error on the existing toast path", () => {
    render(<AppearanceView user={user} hasPaidPlan={true} />);
    fireEvent.click(getBrandingToggle());

    act(() => mocks.mutationOptions?.onError({ message: "Still forbidden" }, { hideBranding: true }));

    expect(getBrandingToggle()).toHaveAttribute("aria-pressed", "false");
    expect(mocks.openUpgradePrompt).not.toHaveBeenCalled();
    expect(mocks.toast).toHaveBeenCalledWith("Still forbidden", "error");
  });

  it("keeps the paid-user success behavior", async () => {
    render(<AppearanceView user={user} hasPaidPlan={true} />);
    fireEvent.click(getBrandingToggle());

    await act(() => mocks.mutationOptions?.onSuccess(result));

    expect(getBrandingToggle()).toHaveAttribute("aria-pressed", "true");
    expect(mocks.toast).toHaveBeenCalledWith("settings_updated_successfully", "success");
    expect(mocks.openUpgradePrompt).not.toHaveBeenCalled();
  });
});
