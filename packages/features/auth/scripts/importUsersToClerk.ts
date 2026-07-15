type ImportMode = "apply" | "dry-run";
type LocalUserForClerkImport = {
  backupCodes: string | null;
  clerkUserId: string | null;
  createdDate: Date;
  email: string;
  emailVerified: Date | null;
  id: number;
  locked: boolean;
  name: string | null;
  password: { hash: string } | null;
  twoFactorEnabled: boolean;
  twoFactorSecret: string | null;
  username: string | null;
};

type ClerkUserCreateInput = {
  backupCodes?: string[];
  banned?: boolean;
  createdAt: Date;
  emailAddress: string[];
  externalId: string;
  firstName?: string;
  lastName?: string;
  passwordDigest?: string;
  passwordHasher?: "bcrypt";
  skipLegalChecks: true;
  skipPasswordRequirement?: true;
  totpSecret?: string;
  username?: string;
};

type ClerkUserReference = { id: string };
type ImportDependencies = {
  createClerkUser: (params: ClerkUserCreateInput) => Promise<ClerkUserReference>;
  decrypt: (value: string) => string;
  findByEmail: (email: string) => Promise<ClerkUserReference[]>;
  findByExternalId: (externalId: string) => Promise<ClerkUserReference[]>;
  mapLocalUser: (userId: number, clerkUserId: string) => Promise<void>;
};

type ImportResult = {
  action: "already-mapped" | "created" | "mapped" | "would-create" | "would-map";
  userId: number;
};

class ClerkImportError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}

function parseImportMode(args: string[]): ImportMode {
  const dryRun = args.includes("--dry-run");
  const apply = args.includes("--apply");
  if (dryRun === apply) throw new Error("Exactly one of --dry-run or --apply is required");
  if (apply) return "apply";
  return "dry-run";
}

function getNameParts(name: string | null): { firstName?: string; lastName?: string } {
  const parts = name?.trim().split(/\s+/).filter(Boolean) ?? [];
  const firstName = parts.shift();
  const lastName = parts.join(" ") || undefined;
  return { firstName, lastName };
}

function getMigratableUsername(username: string | null): string | undefined {
  if (!username || !/^[a-zA-Z0-9_-]{4,64}$/.test(username)) return undefined;
  return username;
}

function getBackupCodes(value: string): string[] {
  const parsed: unknown = JSON.parse(value);
  if (!Array.isArray(parsed)) throw new ClerkImportError("MFA_DECRYPT_FAILED");
  return parsed.filter((code): code is string => typeof code === "string" && code.length > 0);
}

function buildClerkUserParams(
  user: LocalUserForClerkImport,
  decrypt: (value: string) => string
): ClerkUserCreateInput {
  if (!user.emailVerified) throw new ClerkImportError("EMAIL_UNVERIFIED");

  const params: ClerkUserCreateInput = {
    ...getNameParts(user.name),
    banned: user.locked || undefined,
    createdAt: user.createdDate,
    emailAddress: [user.email],
    externalId: String(user.id),
    skipLegalChecks: true,
  };
  const username = getMigratableUsername(user.username);
  if (username) params.username = username;

  if (user.password) {
    if (!/^\$2[aby]\$/.test(user.password.hash)) {
      throw new ClerkImportError("UNSUPPORTED_PASSWORD_HASH");
    }
    params.passwordDigest = user.password.hash;
    params.passwordHasher = "bcrypt";
  } else {
    params.skipPasswordRequirement = true;
  }

  if (user.twoFactorEnabled) {
    if (!user.twoFactorSecret || !user.backupCodes) throw new ClerkImportError("MFA_DATA_MISSING");
    try {
      params.totpSecret = decrypt(user.twoFactorSecret);
      params.backupCodes = getBackupCodes(decrypt(user.backupCodes));
    } catch (error) {
      if (error instanceof ClerkImportError) throw error;
      throw new ClerkImportError("MFA_DECRYPT_FAILED");
    }
  }

  return params;
}

function getUniqueMatch(matches: ClerkUserReference[], code: string): ClerkUserReference | null {
  if (matches.length > 1) throw new ClerkImportError(code);
  return matches[0] ?? null;
}

async function migrateUserToClerk(
  user: LocalUserForClerkImport,
  mode: ImportMode,
  dependencies: ImportDependencies
): Promise<ImportResult> {
  if (user.clerkUserId) return { action: "already-mapped", userId: user.id };

  const externalMatch = getUniqueMatch(
    await dependencies.findByExternalId(String(user.id)),
    "AMBIGUOUS_EXTERNAL_ID"
  );
  let emailMatches: ClerkUserReference[] = [];
  if (user.emailVerified) emailMatches = await dependencies.findByEmail(user.email);
  const emailMatch = getUniqueMatch(emailMatches, "AMBIGUOUS_EMAIL");
  if (externalMatch && emailMatch && externalMatch.id !== emailMatch.id) {
    throw new ClerkImportError("IDENTIFIERS_CONFLICT");
  }

  const existing = externalMatch ?? emailMatch;
  if (existing) {
    if (mode === "dry-run") return { action: "would-map", userId: user.id };
    await dependencies.mapLocalUser(user.id, existing.id);
    return { action: "mapped", userId: user.id };
  }

  const params = buildClerkUserParams(user, dependencies.decrypt);
  if (mode === "dry-run") return { action: "would-create", userId: user.id };

  const created = await dependencies.createClerkUser(params);
  await dependencies.mapLocalUser(user.id, created.id);
  return { action: "created", userId: user.id };
}

function formatImportFailure(failure: { code?: unknown; userId: number; [key: string]: unknown }): {
  code: string;
  userId: number;
} {
  let code = "UNKNOWN_IMPORT_FAILURE";
  if (typeof failure.code === "string") code = failure.code;
  return {
    code,
    userId: failure.userId,
  };
}

export { buildClerkUserParams, formatImportFailure, migrateUserToClerk, parseImportMode };
export type { ClerkUserCreateInput, ImportDependencies, ImportMode, ImportResult, LocalUserForClerkImport };
