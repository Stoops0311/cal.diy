import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { processMock, verifyWebhookMock } = vi.hoisted(() => ({
  processMock: vi.fn(),
  verifyWebhookMock: vi.fn(),
}));

vi.mock("@clerk/nextjs/webhooks", () => ({ verifyWebhook: verifyWebhookMock }));
vi.mock("@calcom/features/organizations/services/ClerkWebhookService", () => ({
  ClerkWebhookService: class {
    process = processMock;
  },
}));

function request(body = '{"type":"organization.updated"}', eventId = "evt_test"): NextRequest {
  return new NextRequest("http://localhost:3000/api/webhooks/clerk", {
    body,
    headers: {
      "content-type": "application/json",
      "svix-id": eventId,
      "svix-signature": "v1,signature",
      "svix-timestamp": "1789000000",
    },
    method: "POST",
  });
}

describe("POST /api/webhooks/clerk", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    processMock.mockResolvedValue("processed");
    verifyWebhookMock.mockResolvedValue({
      data: { id: "org_test", updated_at: 1_789_000_000_000 },
      type: "organization.updated",
    });
  });

  it("verifies the signature before reading or processing the body", async () => {
    const order: string[] = [];
    verifyWebhookMock.mockImplementation(async () => {
      order.push("verify");
      return {
        data: { id: "org_test", updated_at: 1_789_000_000_000 },
        type: "organization.updated",
      };
    });
    const req = request();
    const originalText = req.text.bind(req);
    vi.spyOn(req, "text").mockImplementation(async () => {
      order.push("read");
      return originalText();
    });
    processMock.mockImplementation(async () => {
      order.push("process");
      return "processed";
    });

    const { POST } = await import("./route");
    const response = await POST(req);

    expect(response.status).toBe(200);
    expect(order).toEqual(["verify", "read", "process"]);
    expect(processMock).toHaveBeenCalledWith({
      event: {
        data: { id: "org_test", updated_at: 1_789_000_000_000 },
        type: "organization.updated",
      },
      eventId: "evt_test",
      rawBody: '{"type":"organization.updated"}',
    });
  });

  it("rejects an invalid signature without processing", async () => {
    verifyWebhookMock.mockRejectedValue(new Error("signature details"));

    const { POST } = await import("./route");
    const response = await POST(request());

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Invalid Clerk webhook" });
    expect(processMock).not.toHaveBeenCalled();
  });

  it("rejects a verified request without a provider event id", async () => {
    const { POST } = await import("./route");
    const response = await POST(request("{}", ""));

    expect(response.status).toBe(400);
    expect(processMock).not.toHaveBeenCalled();
  });

  it("returns a generic retryable error when processing fails", async () => {
    processMock.mockRejectedValue(new Error("private customer data"));

    const { POST } = await import("./route");
    const response = await POST(request());

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: "Clerk webhook processing failed" });
  });
});
