import { verifyToken } from "@clerk/backend";
import { Injectable, InternalServerErrorException, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PassportStrategy } from "@nestjs/passport";
import type { Request } from "express";
import { BaseStrategy } from "@/lib/passport/strategies/types";
import { UsersService } from "@/modules/users/services/users.service";
import type { UserWithProfile } from "@/modules/users/users.repository";
import { UsersRepository } from "@/modules/users/users.repository";

type ClerkAuthRequest = Request & { organizationId?: number | null };

@Injectable()
export class ClerkStrategy extends PassportStrategy(BaseStrategy, "clerk") {
  constructor(
    private readonly userRepository: UsersRepository,
    private readonly usersService: UsersService,
    private readonly config: ConfigService
  ) {
    super();
  }

  async authenticate(request: ClerkAuthRequest): Promise<void> {
    try {
      this.success(await this.validate(request));
    } catch (error) {
      if (error instanceof Error) {
        this.error(error);
        return;
      }
      this.error(new InternalServerErrorException("ClerkStrategy - Authentication failed."));
    }
  }

  async validate(request: ClerkAuthRequest): Promise<UserWithProfile> {
    const token = this.getSessionToken(request);
    if (!token) throw new UnauthorizedException("ClerkStrategy - Authentication token is missing.");

    try {
      const jwtKey = this.config.get<string>("clerk.jwtKey");
      const secretKey = this.config.get<string>("clerk.secretKey");
      if (!jwtKey && !secretKey) {
        throw new Error("Clerk token verification is not configured");
      }

      const payload = await verifyToken(token, {
        authorizedParties: this.config.get<string[]>("clerk.authorizedParties"),
        jwtKey: jwtKey || undefined,
        secretKey: secretKey || undefined,
      });
      if (!payload.sub) throw new Error("Clerk token subject is missing");

      const mapping = await this.userRepository.findByClerkUserId(payload.sub);
      if (!mapping || mapping.locked) throw new Error("Clerk user is not authorized locally");

      const user = await this.userRepository.findByIdWithProfile(mapping.id);
      if (!user || user.locked) throw new Error("Clerk user is not authorized locally");

      request.organizationId = (this.usersService.getUserMainOrgId(user) as number | null) ?? null;
      return user;
    } catch {
      throw new UnauthorizedException("ClerkStrategy - Authentication token is invalid.");
    }
  }

  private getSessionToken(request: Request): string | null {
    const authorization = request.get("Authorization");
    const bearer = authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
    if (bearer) return bearer;

    const cookie = request.cookies?.__session;
    if (typeof cookie !== "string" || cookie.length === 0) return null;
    return cookie;
  }
}
