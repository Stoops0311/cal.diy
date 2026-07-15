import { assertEntitled } from "@calcom/features/billing/lib/entitlements";
import {
  EntitlementService,
  type EvaluatedEntitlements,
} from "@calcom/features/billing/services/EntitlementService";
import { ErrorCode } from "@calcom/lib/errorCodes";
import { ErrorWithCode } from "@calcom/lib/errors";

class TeamEventEntitlementService {
  constructor(
    private readonly entitlements: Pick<EntitlementService, "forOrganization"> = new EntitlementService()
  ) {}

  private async forOrganization(teamId: number): Promise<EvaluatedEntitlements | null> {
    try {
      return await this.entitlements.forOrganization(teamId);
    } catch (error) {
      if (error instanceof ErrorWithCode && error.code === ErrorCode.NotFound) return null;
      throw error;
    }
  }

  async isActive(teamId: number | null): Promise<boolean> {
    if (teamId === null) return true;
    return (await this.forOrganization(teamId))?.canCreateTeamEvents ?? false;
  }

  async assertActive(teamId: number | null): Promise<void> {
    if (teamId === null) return;
    const entitlements = await this.forOrganization(teamId);
    if (!entitlements) {
      throw new ErrorWithCode(ErrorCode.EntitlementRequired, "This capability requires a paid plan", {
        capability: "canCreateTeamEvents",
      });
    }
    assertEntitled(entitlements, "canCreateTeamEvents");
  }
}

export { TeamEventEntitlementService };
