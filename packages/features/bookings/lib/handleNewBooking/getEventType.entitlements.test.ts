import { describe, expect, it, vi } from "vitest";
import { type GetEventTypeDependencies, getEventTypeWithoutReporting } from "./getEventType";
import type { NewBookingEventType } from "./getEventTypesFromDB";

function setup(teamId: number | null) {
  const eventType = {
    bookingFields: [],
    parent: null,
    team: teamId ? { parentId: null } : null,
    teamId,
  } as unknown as NewBookingEventType;
  const dependencies: GetEventTypeDependencies = {
    getDefaultEvent: vi.fn(),
    getEventTypesFromDB: vi.fn().mockResolvedValue(eventType),
    teamEventEntitlements: { assertActive: vi.fn().mockResolvedValue(undefined) },
  };
  return { dependencies, eventType };
}

describe("getEventType team entitlements", () => {
  it("checks the organization plan before returning a Team event", async () => {
    const test = setup(41);

    await getEventTypeWithoutReporting({ eventTypeId: 7 }, test.dependencies);

    expect(test.dependencies.teamEventEntitlements.assertActive).toHaveBeenCalledWith(41);
  });

  it("does not return an expired Team event when the guard rejects", async () => {
    const test = setup(41);
    vi.mocked(test.dependencies.teamEventEntitlements.assertActive).mockRejectedValue(
      new Error("plan inactive")
    );

    await expect(getEventTypeWithoutReporting({ eventTypeId: 7 }, test.dependencies)).rejects.toThrow(
      "plan inactive"
    );
  });
});
