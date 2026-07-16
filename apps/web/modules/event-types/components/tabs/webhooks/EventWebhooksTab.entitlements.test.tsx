import { beforeEach, describe, expect, it, vi } from "vitest";
import { getEventWebhookUpgradeContext, handleEventWebhookCreateError } from "./EventWebhooksTab";

const entitlementError = {
  data: {
    entitlement: { capability: "canCreateWebhooks", effectivePlan: "FREE", kind: "capability" },
  },
  message: "Webhooks are unavailable",
};

describe("EventWebhooksTab entitlement prompt", () => {
  const openFromError = vi.fn();
  const showError = vi.fn();

  beforeEach(() => {
    sessionStorage.clear();
    openFromError.mockReset().mockReturnValue(true);
    showError.mockReset();
  });

  it("uses Team only when the event's team is the accepted organization", () => {
    const context = getEventWebhookUpgradeContext(17, 73, 41, 41);
    handleEventWebhookCreateError(entitlementError, context, openFromError, showError);

    expect(openFromError).toHaveBeenCalledWith(entitlementError, {
      organizationId: 41,
      returnTo: "/event-types/17?tabName=webhooks",
      teamId: 73,
    });
    expect(showError).not.toHaveBeenCalled();
    expect(JSON.stringify(openFromError.mock.calls)).not.toContain("webhook-secret-value");
    expect(JSON.stringify(sessionStorage)).not.toContain("webhook-secret-value");
  });

  it("rejects an unrelated team context and retains generic errors", () => {
    const context = getEventWebhookUpgradeContext(18, 99, 77, 41);
    expect(context).toEqual({
      organizationId: undefined,
      returnTo: "/event-types/18?tabName=webhooks",
      teamId: 99,
    });

    openFromError.mockReturnValue(false);
    const forbidden = { data: { code: "FORBIDDEN" }, message: "Forbidden" };
    handleEventWebhookCreateError(forbidden, context, openFromError, showError);
    expect(showError).toHaveBeenCalledWith("Forbidden");
  });

  it("accepts an organization-level team only by exact session ID", () => {
    expect(getEventWebhookUpgradeContext(19, 41, null, 41)).toEqual({
      organizationId: 41,
      returnTo: "/event-types/19?tabName=webhooks",
      teamId: 41,
    });
    expect(getEventWebhookUpgradeContext(19, 99, null, 41).organizationId).toBeUndefined();
  });

});
