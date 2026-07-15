import process from "node:process";
import { Polar } from "@polar-sh/sdk";
import type { ProductCreateRecurring } from "@polar-sh/sdk/models/components/productcreaterecurring.js";
import type { ProductPriceFixedCreate } from "@polar-sh/sdk/models/components/productpricefixedcreate.js";
import type { ProductPriceSeatBasedCreate } from "@polar-sh/sdk/models/components/productpriceseatbasedcreate.js";
import type { ProductUpdate } from "@polar-sh/sdk/models/components/productupdate.js";

type CatalogMetadata = Record<string, string | number | boolean>;
type BenefitKey = "convenio-pro" | "convenio-team";
type ProductKey =
  | "convenio-pro-monthly"
  | "convenio-pro-annual"
  | "convenio-team-monthly"
  | "convenio-team-annual";
type DesiredPrice =
  | { amount: number; kind: "fixed" }
  | { amount: number; kind: "seat_based"; maximumSeats: number; minimumSeats: number };
type DesiredBenefit = {
  description: string;
  key: BenefitKey;
  metadata: CatalogMetadata;
};
type DesiredProduct = {
  benefitKey: BenefitKey;
  description: string;
  key: ProductKey;
  metadata: CatalogMetadata;
  name: string;
  price: DesiredPrice;
  recurringInterval: "month" | "year";
  trialDays: number;
};
type ObservedBenefit = DesiredBenefit & { id: string; type: string };
type ObservedProduct = DesiredProduct & {
  benefitIds: string[];
  id: string;
  isArchived: boolean;
  recurringIntervalCount: number | null;
  trialInterval: string | null;
  visibility: string;
};
type ObservedPolarCatalog = { benefits: ObservedBenefit[]; products: ObservedProduct[] };
type CatalogAction =
  | { benefit: DesiredBenefit; key: BenefitKey; kind: "create_benefit" }
  | { benefit: DesiredBenefit; id: string; key: BenefitKey; kind: "update_benefit" }
  | { key: ProductKey; kind: "create_product"; product: DesiredProduct }
  | {
      id: string;
      key: ProductKey;
      kind: "update_product";
      product: DesiredProduct;
      replacePrice: boolean;
    }
  | { id?: string; key: ProductKey; kind: "set_product_benefit"; benefitKey: BenefitKey };

const benefits: DesiredBenefit[] = ["convenio-pro", "convenio-team"].map((key) => ({
  description: key,
  key,
  metadata: { catalog_key: key },
})) as DesiredBenefit[];

const DESIRED_POLAR_CATALOG: { benefits: DesiredBenefit[]; products: DesiredProduct[] } = {
  benefits,
  products: [
    {
      benefitKey: "convenio-pro",
      description: "Unlimited personal scheduling and advanced booking controls.",
      key: "convenio-pro-monthly",
      metadata: { billing_interval: "MONTH", catalog_key: "convenio-pro-monthly", plan_key: "PRO" },
      name: "Convenio Pro — Monthly",
      price: { amount: 1000, kind: "fixed" },
      recurringInterval: "month",
      trialDays: 14,
    },
    {
      benefitKey: "convenio-pro",
      description: "Unlimited personal scheduling and advanced booking controls.",
      key: "convenio-pro-annual",
      metadata: { billing_interval: "YEAR", catalog_key: "convenio-pro-annual", plan_key: "PRO" },
      name: "Convenio Pro — Annual",
      price: { amount: 9600, kind: "fixed" },
      recurringInterval: "year",
      trialDays: 14,
    },
    {
      benefitKey: "convenio-team",
      description: "Team scheduling and organization administration for up to 50 seats.",
      key: "convenio-team-monthly",
      metadata: { billing_interval: "MONTH", catalog_key: "convenio-team-monthly", plan_key: "TEAM" },
      name: "Convenio Team — Monthly",
      price: { amount: 1500, kind: "seat_based", maximumSeats: 50, minimumSeats: 1 },
      recurringInterval: "month",
      trialDays: 14,
    },
    {
      benefitKey: "convenio-team",
      description: "Team scheduling and organization administration for up to 50 seats.",
      key: "convenio-team-annual",
      metadata: { billing_interval: "YEAR", catalog_key: "convenio-team-annual", plan_key: "TEAM" },
      name: "Convenio Team — Annual",
      price: { amount: 14400, kind: "seat_based", maximumSeats: 50, minimumSeats: 1 },
      recurringInterval: "year",
      trialDays: 14,
    },
  ],
};

function recordsEqual(left: CatalogMetadata, right: CatalogMetadata): boolean {
  const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
  return [...keys].every((key) => left[key] === right[key]);
}

function pricesEqual(left: DesiredPrice, right: DesiredPrice): boolean {
  if (left.kind !== right.kind || left.amount !== right.amount) return false;
  if (left.kind === "fixed" || right.kind === "fixed") return left.kind === right.kind;
  return left.minimumSeats === right.minimumSeats && left.maximumSeats === right.maximumSeats;
}

function findBenefit(catalog: ObservedPolarCatalog, desired: DesiredBenefit): ObservedBenefit | undefined {
  const matches = catalog.benefits.filter(
    (benefit) =>
      benefit.key === desired.key ||
      benefit.metadata.catalog_key === desired.key ||
      benefit.description === desired.description
  );
  if (matches.length > 1) throw new Error(`Conflicting Polar benefits for ${desired.key}`);
  const match = matches[0];
  if (match && match.type !== "custom") throw new Error(`Conflicting Polar benefit for ${desired.key}`);
  return match;
}

function findProduct(catalog: ObservedPolarCatalog, desired: DesiredProduct): ObservedProduct | undefined {
  const matches = catalog.products.filter(
    (product) =>
      product.key === desired.key ||
      product.metadata.catalog_key === desired.key ||
      product.name === desired.name
  );
  if (matches.length > 1) throw new Error(`Conflicting Polar products for ${desired.key}`);
  const match = matches[0];
  if (!match) return undefined;
  if (
    (match.metadata.plan_key && match.metadata.plan_key !== desired.metadata.plan_key) ||
    (match.metadata.billing_interval &&
      match.metadata.billing_interval !== desired.metadata.billing_interval) ||
    match.recurringInterval !== desired.recurringInterval ||
    match.recurringIntervalCount !== 1
  ) {
    throw new Error(`Conflicting Polar product for ${desired.key}`);
  }
  return match;
}

function planPolarCatalog(catalog: ObservedPolarCatalog): CatalogAction[] {
  const actions: CatalogAction[] = [];
  const observedBenefits = new Map<BenefitKey, ObservedBenefit>();

  for (const benefit of DESIRED_POLAR_CATALOG.benefits) {
    const observed = findBenefit(catalog, benefit);
    if (!observed) {
      actions.push({ benefit, key: benefit.key, kind: "create_benefit" });
      continue;
    }
    observedBenefits.set(benefit.key, observed);
    if (observed.description !== benefit.description || !recordsEqual(observed.metadata, benefit.metadata)) {
      actions.push({ benefit, id: observed.id, key: benefit.key, kind: "update_benefit" });
    }
  }

  for (const product of DESIRED_POLAR_CATALOG.products) {
    const observed = findProduct(catalog, product);
    if (!observed) {
      actions.push({ key: product.key, kind: "create_product", product });
      actions.push({ benefitKey: product.benefitKey, key: product.key, kind: "set_product_benefit" });
      continue;
    }
    const replacePrice = !pricesEqual(observed.price, product.price);
    if (
      observed.name !== product.name ||
      observed.description !== product.description ||
      !recordsEqual(observed.metadata, product.metadata) ||
      observed.trialInterval !== "day" ||
      observed.trialDays !== product.trialDays ||
      observed.visibility !== "public" ||
      observed.isArchived ||
      replacePrice
    ) {
      actions.push({ id: observed.id, key: product.key, kind: "update_product", product, replacePrice });
    }
    const benefitId = observedBenefits.get(product.benefitKey)?.id;
    if (!benefitId || observed.benefitIds.length !== 1 || observed.benefitIds[0] !== benefitId) {
      actions.push({
        benefitKey: product.benefitKey,
        id: observed.id,
        key: product.key,
        kind: "set_product_benefit",
      });
    }
  }
  return actions;
}

function toPriceInput(price: DesiredPrice): ProductPriceFixedCreate | ProductPriceSeatBasedCreate {
  if (price.kind === "fixed") {
    return { amountType: "fixed", priceAmount: price.amount, priceCurrency: "usd" };
  }
  return {
    amountType: "seat_based",
    priceCurrency: "usd",
    seatTiers: {
      seatTierType: "volume",
      tiers: [{ maxSeats: price.maximumSeats, minSeats: price.minimumSeats, pricePerSeat: price.amount }],
    },
  };
}

function toProductCreate(product: DesiredProduct, organizationId: string): ProductCreateRecurring {
  return {
    description: product.description,
    metadata: product.metadata,
    name: product.name,
    organizationId,
    prices: [toPriceInput(product.price)],
    recurringInterval: product.recurringInterval,
    recurringIntervalCount: 1,
    trialInterval: "day",
    trialIntervalCount: product.trialDays,
    visibility: "public",
  };
}

function toProductUpdate(product: DesiredProduct, replacePrice: boolean): ProductUpdate {
  return {
    description: product.description,
    isArchived: false,
    metadata: product.metadata,
    name: product.name,
    ...(replacePrice ? { prices: [toPriceInput(product.price)] } : {}),
    trialInterval: "day",
    trialIntervalCount: product.trialDays,
    visibility: "public",
  };
}

function toObservedPrice(product: Awaited<ReturnType<Polar["products"]["get"]>>): DesiredPrice {
  const prices = product.prices.filter((price) => "isArchived" in price && !price.isArchived);
  if (prices.length !== 1) throw new Error(`Polar product ${product.id} must have one active price`);
  const price = prices[0];
  if (price.amountType === "fixed") return { amount: price.priceAmount, kind: "fixed" };
  if (price.amountType === "seat_based") {
    const tiers = price.seatTiers.tiers;
    if (tiers.length !== 1 || tiers[0].maxSeats === null || tiers[0].maxSeats === undefined) {
      return {
        amount: tiers[0]?.pricePerSeat ?? 0,
        kind: "seat_based",
        maximumSeats: tiers[0]?.maxSeats ?? Number.POSITIVE_INFINITY,
        minimumSeats: tiers[0]?.minSeats ?? 0,
      };
    }
    return {
      amount: tiers[0].pricePerSeat,
      kind: "seat_based",
      maximumSeats: tiers[0].maxSeats,
      minimumSeats: tiers[0].minSeats,
    };
  }
  throw new Error(`Polar product ${product.id} has an unsupported price`);
}

async function readPolarCatalog(polar: Polar, organizationId: string): Promise<ObservedPolarCatalog> {
  const observed: ObservedPolarCatalog = { benefits: [], products: [] };
  for await (const page of await polar.benefits.list({ limit: 100, organizationId })) {
    observed.benefits.push(
      ...page.result.items.map((benefit) => ({
        description: benefit.description,
        id: benefit.id,
        key: String(benefit.metadata.catalog_key ?? benefit.description) as BenefitKey,
        metadata: benefit.metadata,
        type: benefit.type,
      }))
    );
  }
  for await (const page of await polar.products.list({ isArchived: false, limit: 100, organizationId })) {
    observed.products.push(
      ...page.result.items.map((product) => ({
        benefitIds: product.benefits.map(({ id }) => id),
        benefitKey: product.metadata.plan_key === "TEAM" ? "convenio-team" : "convenio-pro",
        description: product.description ?? "",
        id: product.id,
        isArchived: product.isArchived,
        key: String(product.metadata.catalog_key ?? "") as ProductKey,
        metadata: product.metadata,
        name: product.name,
        price: toObservedPrice(product),
        recurringInterval: product.recurringInterval === "year" ? "year" : "month",
        recurringIntervalCount: product.recurringIntervalCount,
        trialDays: product.trialIntervalCount ?? 0,
        trialInterval: product.trialInterval,
        visibility: product.visibility,
      }))
    );
  }
  return observed;
}

async function applyPolarCatalogPlan({
  actions,
  catalog,
  organizationId,
  polar,
}: {
  actions: CatalogAction[];
  catalog: ObservedPolarCatalog;
  organizationId: string;
  polar: Polar;
}): Promise<void> {
  const benefitIds = new Map<BenefitKey, string>();
  const productIds = new Map<ProductKey, string>();
  for (const benefit of DESIRED_POLAR_CATALOG.benefits) {
    const observed = findBenefit(catalog, benefit);
    if (observed) benefitIds.set(benefit.key, observed.id);
  }
  for (const product of DESIRED_POLAR_CATALOG.products) {
    const observed = findProduct(catalog, product);
    if (observed) productIds.set(product.key, observed.id);
  }

  for (const action of actions) {
    if (action.kind === "create_benefit") {
      const created = await polar.benefits.create({
        description: action.benefit.description,
        metadata: action.benefit.metadata,
        organizationId,
        properties: { note: null },
        type: "custom",
      });
      benefitIds.set(action.key, created.id);
    } else if (action.kind === "update_benefit") {
      await polar.benefits.update({
        id: action.id,
        requestBody: {
          description: action.benefit.description,
          metadata: action.benefit.metadata,
          properties: { note: null },
          type: "custom",
        },
      });
    } else if (action.kind === "create_product") {
      const created = await polar.products.create(toProductCreate(action.product, organizationId));
      productIds.set(action.key, created.id);
    } else if (action.kind === "update_product") {
      await polar.products.update({
        id: action.id,
        productUpdate: toProductUpdate(action.product, action.replacePrice),
      });
    } else {
      const productId = action.id ?? productIds.get(action.key);
      const benefitId = benefitIds.get(action.benefitKey);
      if (!productId || !benefitId) throw new Error(`Unable to resolve Polar IDs for ${action.key}`);
      await polar.products.updateBenefits({
        id: productId,
        productBenefitsUpdate: { benefits: [benefitId] },
      });
    }
  }
}

function requireEnvironment(key: string): string {
  const value = process.env[key]?.trim();
  if (!value) throw new Error(`${key} is required`);
  return value;
}

function printCatalogIds(catalog: ObservedPolarCatalog): void {
  const benefitEnvironment = {
    "convenio-pro": "POLAR_PRO_BENEFIT_ID",
    "convenio-team": "POLAR_TEAM_BENEFIT_ID",
  };
  const productEnvironment = {
    "convenio-pro-monthly": "POLAR_PRO_MONTHLY_PRODUCT_ID",
    "convenio-pro-annual": "POLAR_PRO_ANNUAL_PRODUCT_ID",
    "convenio-team-monthly": "POLAR_TEAM_MONTHLY_PRODUCT_ID",
    "convenio-team-annual": "POLAR_TEAM_ANNUAL_PRODUCT_ID",
  };
  for (const desired of DESIRED_POLAR_CATALOG.benefits) {
    const observed = findBenefit(catalog, desired);
    if (observed) process.stdout.write(`${benefitEnvironment[desired.key]}=${observed.id}\n`);
  }
  for (const desired of DESIRED_POLAR_CATALOG.products) {
    const observed = findProduct(catalog, desired);
    if (observed) process.stdout.write(`${productEnvironment[desired.key]}=${observed.id}\n`);
  }
}

async function main(): Promise<void> {
  const apply = process.argv.includes("--apply");
  const dryRun = process.argv.includes("--dry-run");
  if (apply === dryRun) throw new Error("Pass exactly one of --dry-run or --apply");
  if ((process.env.POLAR_SERVER ?? "sandbox") !== "sandbox") {
    throw new Error("Polar catalog provisioning is locked to sandbox");
  }
  const organizationId = requireEnvironment("POLAR_ORGANIZATION_ID");
  const polar = new Polar({ accessToken: requireEnvironment("POLAR_ACCESS_TOKEN"), server: "sandbox" });
  const catalog = await readPolarCatalog(polar, organizationId);
  const actions = planPolarCatalog(catalog);
  if (!apply) {
    for (const action of actions) process.stdout.write(`${action.kind}:${action.key}\n`);
    if (actions.length === 0) process.stdout.write("No changes required.\n");
    return;
  }
  await applyPolarCatalogPlan({ actions, catalog, organizationId, polar });
  printCatalogIds(await readPolarCatalog(polar, organizationId));
}

if (process.argv[1]?.endsWith("provision-polar-sandbox.ts")) {
  main().catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}

export { DESIRED_POLAR_CATALOG, planPolarCatalog };
export type { CatalogAction, ObservedPolarCatalog };
