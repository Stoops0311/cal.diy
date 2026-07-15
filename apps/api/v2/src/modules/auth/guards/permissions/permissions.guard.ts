import { X_CAL_CLIENT_ID } from "@calcom/platform-constants";
import { hasPermissions } from "@calcom/platform-utils";
import type { PlatformOAuthClient } from "@calcom/prisma/client";
import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { AuthMethods } from "@/lib/enums/auth-methods";
import { Permissions } from "@/modules/auth/decorators/permissions/permissions.decorator";
import { OAuthClientRepository } from "@/modules/oauth-clients/oauth-client.repository";
import { OAuthClientsOutputService } from "@/modules/oauth-clients/services/oauth-clients/oauth-clients-output.service";
import { TokensRepository } from "@/modules/tokens/tokens.repository";

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private tokensRepository: TokensRepository,
    private readonly oAuthClientRepository: OAuthClientRepository,
    private readonly oAuthClientsOutputService: OAuthClientsOutputService
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredPermissions = this.reflector.get(Permissions, context.getHandler());

    if (!requiredPermissions?.length || !Object.keys(requiredPermissions)?.length) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const bearerToken = request.get("Authorization")?.replace("Bearer ", "");
    const oAuthClientId = request.params?.clientId || request.get(X_CAL_CLIENT_ID);

    if (
      request.authMethod === AuthMethods.NEXT_AUTH ||
      request.authMethod === AuthMethods.CLERK ||
      request.authMethod === AuthMethods.API_KEY ||
      request.authMethod === AuthMethods.THIRD_PARTY_ACCESS_TOKEN
    ) {
      return true;
    }

    if (!bearerToken && !oAuthClientId) {
      throw new ForbiddenException(
        "PermissionsGuard - no authentication provided. Provide either authorization bearer token containing managed user access token or oAuth client id in 'x-cal-client-id' header."
      );
    }

    const oAuthClient = bearerToken
      ? await this.getOAuthClientByAccessToken(bearerToken)
      : await this.getOAuthClientById(oAuthClientId);

    const hasRequiredPermissions = hasPermissions(oAuthClient.permissions, [...requiredPermissions]);

    if (!hasRequiredPermissions) {
      throw new ForbiddenException(
        `PermissionsGuard - oAuth client with id=${
          oAuthClient.id
        } does not have the required permissions=${requiredPermissions
          .map((permission) => this.oAuthClientsOutputService.transformOAuthClientPermission(permission))
          .join(
            ", "
          )}. Go to platform dashboard settings and add the required permissions to the oAuth client.`
      );
    }

    return true;
  }

  async getOAuthClientByAccessToken(
    accessToken: string
  ): Promise<Pick<PlatformOAuthClient, "id" | "permissions">> {
    const oAuthClient = await this.tokensRepository.getAccessTokenClient(accessToken);
    if (!oAuthClient) {
      throw new ForbiddenException(
        `PermissionsGuard - no oAuth client found for access token=${accessToken}`
      );
    }
    return oAuthClient;
  }

  async getOAuthClientById(id: string): Promise<Pick<PlatformOAuthClient, "id" | "permissions">> {
    const oAuthClient = await this.oAuthClientRepository.getOAuthClient(id);
    if (!oAuthClient) {
      throw new ForbiddenException(`PermissionsGuard - no oAuth client found for client id=${id}`);
    }
    return oAuthClient;
  }
}
