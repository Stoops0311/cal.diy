import { describe, expect, it } from "vitest";
import {
  DESIRED_POLAR_CATALOG,
  type ObservedPolarCatalog,
  planPolarCatalog,
} from "./provision-polar-sandbox";

const emptyCatalog = (): ObservedPolarCatalog => ({ benefits: [], products: [] });

describe("Polar sandbox catalog", () => {
  it("defines the exact Convenio benefits and four recurring products", () => {
    expect(DESIRED_POLAR_CATALOG.benefits.map(({ key }) => key)).toEqual(["convenio-pro", "convenio-team"]);
    expect(
      DESIRED_POLAR_CATALOG.products.map((product) => ({
        amount: product.price.amount,
        interval: product.recurringInterval,
        key: product.key,
        trialDays: product.trialDays,
      }))
    ).toEqual([
      { amount: 1000, interval: "month", key: "convenio-pro-monthly", trialDays: 14 },
      { amount: 9600, interval: "year", key: "convenio-pro-annual", trialDays: 14 },
      { amount: 1500, interval: "month", key: "convenio-team-monthly", trialDays: 14 },
      { amount: 14400, interval: "year", key: "convenio-team-annual", trialDays: 14 },
    ]);
    expect(DESIRED_POLAR_CATALOG.products.slice(2).map(({ price }) => price)).toEqual([
      { amount: 1500, kind: "seat_based", maximumSeats: 50, minimumSeats: 1 },
      { amount: 14400, kind: "seat_based", maximumSeats: 50, minimumSeats: 1 },
    ]);
  });

  it("plans two benefits, four products, and their attachments from an empty catalog", () => {
    const plan = planPolarCatalog(emptyCatalog());

    expect(plan.filter(({ kind }) => kind === "create_benefit")).toHaveLength(2);
    expect(plan.filter(({ kind }) => kind === "create_product")).toHaveLength(4);
    expect(plan.filter(({ kind }) => kind === "set_product_benefit")).toHaveLength(4);
  });

  it("is a no-op when every desired object already matches", () => {
    const observed: ObservedPolarCatalog = {
      benefits: DESIRED_POLAR_CATALOG.benefits.map((benefit, index) => ({
        ...benefit,
        id: `benefit-${index}`,
        type: "custom",
      })),
      products: DESIRED_POLAR_CATALOG.products.map((product, index) => ({
        ...product,
        benefitIds: [product.benefitKey === "convenio-pro" ? "benefit-0" : "benefit-1"],
        id: `product-${index}`,
        isArchived: false,
        recurringIntervalCount: 1,
        trialInterval: "day",
        visibility: "public",
      })),
    };

    expect(planPolarCatalog(observed)).toEqual([]);
  });

  it("updates safe metadata, trial, price, and benefit attachment drift", () => {
    const observed: ObservedPolarCatalog = {
      benefits: [
        { description: "convenio-pro", id: "benefit-pro", key: "convenio-pro", metadata: {}, type: "custom" },
      ],
      products: [
        {
          ...DESIRED_POLAR_CATALOG.products[0],
          benefitIds: [],
          id: "product-pro-month",
          isArchived: false,
          metadata: { billing_interval: "MONTH", plan_key: "PRO" },
          price: { amount: 999, kind: "fixed" },
          recurringIntervalCount: 1,
          trialDays: 7,
          trialInterval: "day",
          visibility: "public",
        },
      ],
    };

    const plan = planPolarCatalog(observed);
    expect(plan).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "update_benefit", key: "convenio-pro" }),
        expect.objectContaining({ key: "convenio-pro-monthly", kind: "update_product" }),
        expect.objectContaining({ key: "convenio-pro-monthly", kind: "set_product_benefit" }),
      ])
    );
  });

  it("refuses a product whose stable name conflicts with its plan metadata", () => {
    const product = DESIRED_POLAR_CATALOG.products[0];
    const observed: ObservedPolarCatalog = {
      benefits: [],
      products: [
        {
          ...product,
          benefitIds: [],
          id: "conflict",
          isArchived: false,
          metadata: { billing_interval: "MONTH", plan_key: "TEAM" },
          recurringIntervalCount: 1,
          trialInterval: "day",
          visibility: "public",
        },
      ],
    };

    expect(() => planPolarCatalog(observed)).toThrow("Conflicting Polar product");
  });
});
