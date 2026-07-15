import { verifyToken } from "@clerk/backend";
import { UnauthorizedException } from "@nestjs/common";
import type { ConfigService } from "@nestjs/config";
import { createRequest } from "node-mocks-http";
import { ClerkStrategy } from "./clerk.strategy";
import type { UsersService } from "@/modules/users/services/users.service";
import type { UsersRepository, UserWithProfile } from "@/modules/users/users.repository";

jest.mock("@clerk/backend", () => ({ verifyToken: jest.fn() }));

const verifyTokenMock = jest.mocked(verifyToken);

function makeUser(overrides: Partial<UserWithProfile> = {}): UserWithProfile {
  return {
    id: 73,
    locked: false,
    role: "USER",
    ...overrides,
  } as UserWithProfile;
}

describe("ClerkStrategy", () => {
  const findByClerkUserId = jest.fn();
  const findByIdWithProfile = jest.fn();
  const getUserMainOrgId = jest.fn();
  const configValues: Record<string, unknown> = {
    "clerk.authorizedParties": ["http://localhost:3000"],
    "clerk.jwtKey": "test-jwt-key",
    "clerk.secretKey": "test-secret-key",
  };
  const config = {
    get: jest.fn((key: string) => configValues[key]),
  } as unknown as ConfigService;
  const repository = {
    findByClerkUserId,
    findByIdWithProfile,
  } as unknown as UsersRepository;
  const usersService = { getUserMainOrgId } as unknown as UsersService;
  const strategy = new ClerkStrategy(repository, usersService, config);

  beforeEach(() => {
    jest.clearAllMocks();
    getUserMainOrgId.mockReturnValue(19);
  });

  it("resolves a verified bearer token to the mapped local user", async () => {
    const user = makeUser();
    verifyTokenMock.mockResolvedValue({ sub: "user_clerk" });
    findByClerkUserId.mockResolvedValue({ id: user.id, locked: false });
    findByIdWithProfile.mockResolvedValue(user);
    const request = createRequest({ headers: { authorization: "Bearer clerk-token" } });

    await expect(strategy.validate(request)).resolves.toMatchObject({ id: 73 });
    expect(verifyTokenMock).toHaveBeenCalledWith("clerk-token", {
      authorizedParties: ["http://localhost:3000"],
      jwtKey: "test-jwt-key",
      secretKey: "test-secret-key",
    });
    expect((request as typeof request & { organizationId?: number | null }).organizationId).toBe(19);
  });

  it("accepts a Clerk session cookie", async () => {
    const user = makeUser();
    verifyTokenMock.mockResolvedValue({ sub: "user_cookie" });
    findByClerkUserId.mockResolvedValue({ id: user.id, locked: false });
    findByIdWithProfile.mockResolvedValue(user);
    const request = createRequest({ cookies: { __session: "cookie-token" } });

    await expect(strategy.validate(request)).resolves.toMatchObject({ id: 73 });
    expect(verifyTokenMock).toHaveBeenCalledWith("cookie-token", expect.any(Object));
  });

  it("rejects a valid token for a locked local user", async () => {
    verifyTokenMock.mockResolvedValue({ sub: "user_locked" });
    findByClerkUserId.mockResolvedValue({ id: 74, locked: true });
    const request = createRequest({ headers: { authorization: "Bearer clerk-token" } });

    await expect(strategy.validate(request)).rejects.toBeInstanceOf(UnauthorizedException);
    expect(findByIdWithProfile).not.toHaveBeenCalled();
  });

  it("rejects invalid tokens and missing local mappings", async () => {
    const request = createRequest({ headers: { authorization: "Bearer clerk-token" } });
    verifyTokenMock.mockRejectedValueOnce(new Error("invalid signature"));
    await expect(strategy.validate(request)).rejects.toBeInstanceOf(UnauthorizedException);

    verifyTokenMock.mockResolvedValueOnce({ sub: "user_missing" });
    findByClerkUserId.mockResolvedValueOnce(null);
    await expect(strategy.validate(request)).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
