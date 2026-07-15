import { assertWithinLimit } from "@calcom/features/billing/lib/entitlements";
import { EntitlementService } from "@calcom/features/billing/services/EntitlementService";

type CalendarConnectionInput = {
  categories: readonly string[];
  userId: number;
};

class CalendarConnectionEntitlementService {
  constructor(
    private readonly entitlements: Pick<EntitlementService, "forUser"> = new EntitlementService()
  ) {}

  async assertCanConnectApp(input: CalendarConnectionInput): Promise<void> {
    if (!input.categories.includes("calendar")) return;
    const entitlements = await this.entitlements.forUser(input.userId);
    assertWithinLimit(entitlements, "connectedCalendars", entitlements.usage.connectedCalendars);
  }
}

export { CalendarConnectionEntitlementService };
