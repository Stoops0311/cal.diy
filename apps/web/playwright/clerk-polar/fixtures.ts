import { randomBytes } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const E2E_METADATA_KEY = "convenioE2ERunTag";
const E2E_RUN_TAG_PATTERN = /^convenio-e2e-\d{8}T\d{6}Z-[a-z0-9]{6,16}$/;

type FixtureKind =
  | "clerk_user"
  | "clerk_organization"
  | "clerk_membership"
  | "polar_customer"
  | "polar_subscription"
  | "local_user"
  | "local_organization"
  | "local_projection";

type FixtureReference = { id: string; kind: FixtureKind; parentId?: string };
type FixtureManifest = {
  createdAt: string;
  objects: FixtureReference[];
  runTag: string;
};
type OwnedFixture = { metadata: unknown };
type FixtureCleanupAdapter = {
  close?(): Promise<void>;
  load(reference: FixtureReference): Promise<OwnedFixture | null>;
  remove(reference: FixtureReference): Promise<void>;
};

class E2EFixtureError extends Error {
  readonly code: "E2E_INVALID_RUN_TAG" | "E2E_TAG_MISMATCH";

  constructor(code: "E2E_INVALID_RUN_TAG" | "E2E_TAG_MISMATCH", message: string) {
    super(message);
    this.code = code;
    this.name = "E2EFixtureError";
  }
}

function assertE2ERunTag(runTag: string): void {
  if (!E2E_RUN_TAG_PATTERN.test(runTag)) {
    throw new E2EFixtureError("E2E_INVALID_RUN_TAG", "invalid E2E run tag");
  }
}

function createE2ERunTag(
  now = new Date(),
  suffix: () => string = () => randomBytes(4).toString("hex")
): string {
  const timestamp = now
    .toISOString()
    .replace(/\.\d{3}Z$/, "Z")
    .replace(/[-:]/g, "");
  const normalizedSuffix = suffix()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .slice(0, 16);
  const runTag = `convenio-e2e-${timestamp}-${normalizedSuffix}`;
  assertE2ERunTag(runTag);
  return runTag;
}

function taggedMetadata(runTag: string): Record<typeof E2E_METADATA_KEY, string> {
  assertE2ERunTag(runTag);
  return { [E2E_METADATA_KEY]: runTag };
}

function ownsRunTag(metadata: unknown, runTag: string): boolean {
  return (
    typeof metadata === "object" &&
    metadata !== null &&
    E2E_METADATA_KEY in metadata &&
    (metadata as Record<string, unknown>)[E2E_METADATA_KEY] === runTag
  );
}

const cleanupPriority: Record<FixtureKind, number> = {
  polar_subscription: 10,
  polar_customer: 20,
  clerk_membership: 30,
  clerk_organization: 40,
  clerk_user: 50,
  local_projection: 60,
  local_organization: 70,
  local_user: 80,
};

async function cleanupTaggedFixtures(
  manifest: FixtureManifest,
  adapter: FixtureCleanupAdapter
): Promise<{ removed: number; skipped: number }> {
  assertE2ERunTag(manifest.runTag);
  const references = [...manifest.objects].sort(
    (left, right) => cleanupPriority[left.kind] - cleanupPriority[right.kind]
  );
  let removed = 0;
  let skipped = 0;

  try {
    for (const reference of references) {
      const current = await adapter.load(reference);
      if (!current) {
        skipped += 1;
        continue;
      }
      if (!ownsRunTag(current.metadata, manifest.runTag)) {
        throw new E2EFixtureError(
          "E2E_TAG_MISMATCH",
          `refusing to remove ${reference.kind} without the exact run tag`
        );
      }
      await adapter.remove(reference);
      removed += 1;
    }
  } finally {
    await adapter.close?.();
  }

  return { removed, skipped };
}

function manifestPath(runTag: string, root = process.cwd()): string {
  assertE2ERunTag(runTag);
  return path.join(root, "test-results", "clerk-polar", "manifests", `${runTag}.json`);
}

async function writeFixtureManifest(manifest: FixtureManifest, root = process.cwd()): Promise<string> {
  assertE2ERunTag(manifest.runTag);
  const destination = manifestPath(manifest.runTag, root);
  await mkdir(path.dirname(destination), { recursive: true });
  const temporary = `${destination}.tmp`;
  await writeFile(temporary, `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o600 });
  await rename(temporary, destination);
  return destination;
}

async function readFixtureManifest(runTag: string, root = process.cwd()): Promise<FixtureManifest | null> {
  try {
    const parsed = JSON.parse(await readFile(manifestPath(runTag, root), "utf8")) as FixtureManifest;
    if (parsed.runTag !== runTag || !Array.isArray(parsed.objects)) {
      throw new E2EFixtureError("E2E_TAG_MISMATCH", "fixture manifest ownership mismatch");
    }
    return parsed;
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") return null;
    throw error;
  }
}

function createFixtureManifest(runTag: string, createdAt = new Date()): FixtureManifest {
  assertE2ERunTag(runTag);
  return { createdAt: createdAt.toISOString(), objects: [], runTag };
}

async function registerFixture(
  manifest: FixtureManifest,
  reference: FixtureReference,
  root = process.cwd()
): Promise<void> {
  if (!manifest.objects.some(({ id, kind }) => id === reference.id && kind === reference.kind)) {
    manifest.objects.push(reference);
    await writeFixtureManifest(manifest, root);
  }
}

export {
  E2E_METADATA_KEY,
  E2E_RUN_TAG_PATTERN,
  E2EFixtureError,
  assertE2ERunTag,
  cleanupTaggedFixtures,
  createE2ERunTag,
  createFixtureManifest,
  manifestPath,
  readFixtureManifest,
  registerFixture,
  taggedMetadata,
  writeFixtureManifest,
};
export type { FixtureCleanupAdapter, FixtureKind, FixtureManifest, FixtureReference, OwnedFixture };
