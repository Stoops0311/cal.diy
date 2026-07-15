import { beforeEach, describe, expect, it, vi } from "vitest";

const { getConfigurationMock, processMock, validateEventMock } = vi.hoisted(() => ({
  getConfigurationMock: vi.fn(),
  processMock: vi.fn(),
  validateEventMock: vi.fn(),
}));

vi.mock("@calcom/features/billing/services/PolarWebhookValidator", () => ({
  validatePolarWebhook: validateEventMock,
}));
vi.mock("@calcom/features/billing/services/PolarClient", () => ({
  getPolarConfiguration: getConfigurationMock,
}));
vi.mock("@calcom/features/billing/services/PolarWebhookService", () => ({
  PolarWebhookService: class {
    process = processMock;
  },
}));

function request(body = '{"type":"customer.state_changed"}', eventId = "event_test"): Request {
  return new Request("http://localhost:3000/api/webhooks/polar", {
    body,
    headers: {
      "content-type": "application/json",
      "webhook-id": eventId,
      "webhook-signature": "v1,signature",
      "webhook-timestamp": "1789000000",
    },
    method: "POST",
  });
}

describe("POST /api/webhooks/polar", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getConfigurationMock.mockReturnValue({ webhookSecret: "whsec_test" });
    processMock.mockResolvedValue("processed");
    validateEventMock.mockReturnValue({ timestamp: new Date(), type: "order.paid" });
  });

  it("never processes an invalid signature", async () => {
    validateEventMock.mockImplementation(() => {
      throw new Error("signature details");
    });

    const { POST } = await import("./route");
    const response = await POST(request());

    expect(response.status).toBe(401);
    expect(processMock).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toEqual({ error: "Invalid Polar webhook" });
  });

  it("verifies the raw body before dispatching a sanitized event", async () => {
    const rawBody = '{"type":"order.paid"}';
    const timestamp = new Date("2026-07-15T12:00:00.000Z");
    validateEventMock.mockReturnValue({ timestamp, type: "order.paid" });

    const { POST } = await import("./route");
    const response = await POST(request(rawBody));

    expect(validateEventMock).toHaveBeenCalledWith(rawBody, expect.any(Object), "whsec_test");
    expect(processMock).toHaveBeenCalledWith({
      event: { timestamp, type: "order.paid" },
      eventId: "event_test",
      rawBody,
    });
    expect(response.status).toBe(200);
  });

  it("rejects a request without the provider event id", async () => {
    const { POST } = await import("./route");
    const response = await POST(request("{}", ""));

    expect(response.status).toBe(401);
    expect(processMock).not.toHaveBeenCalled();
  });

  it("returns a generic retryable processing failure", async () => {
    processMock.mockRejectedValue(new Error("private customer state"));

    const { POST } = await import("./route");
    const response = await POST(request());

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: "Polar webhook processing failed" });
  });
});
