import { describe, expect, it } from "vitest";
import { ZBillingPlanSchema, ZBillingSubjectSchema } from "./billing.schema";

describe("billing schemas", () => {
  it("accepts personal Pro and organization Team plans", () => {
    expect(ZBillingPlanSchema.parse({ interval: "MONTH", plan: "PRO" })).toEqual({
      interval: "MONTH",
      plan: "PRO",
    });
    expect(ZBillingPlanSchema.parse({ interval: "YEAR", organizationId: 41, plan: "TEAM" })).toEqual({
      interval: "YEAR",
      organizationId: 41,
      plan: "TEAM",
    });
  });

  it("rejects organization Pro and personal Team plans", () => {
    expect(() => ZBillingPlanSchema.parse({ interval: "MONTH", organizationId: 41, plan: "PRO" })).toThrow();
    expect(() => ZBillingPlanSchema.parse({ interval: "MONTH", plan: "TEAM" })).toThrow();
  });

  it("rejects Free checkout and unsupported intervals", () => {
    expect(() => ZBillingPlanSchema.parse({ interval: "MONTH", plan: "FREE" })).toThrow();
    expect(() => ZBillingPlanSchema.parse({ interval: "WEEK", plan: "PRO" })).toThrow();
  });

  it("requires positive integer organization identifiers", () => {
    expect(() => ZBillingSubjectSchema.parse({ organizationId: 0 })).toThrow();
    expect(() => ZBillingSubjectSchema.parse({ organizationId: 1.5 })).toThrow();
  });
});
