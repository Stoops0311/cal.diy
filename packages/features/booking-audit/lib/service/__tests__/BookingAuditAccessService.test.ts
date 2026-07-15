import { getEntitlements } from "@calcom/features/billing/lib/entitlements";
import { BillingStatus, PlanKey, type PlanKeyType } from "@calcom/features/billing/lib/plans";
import type { EntitlementService } from "@calcom/features/billing/services/EntitlementService";
import { BookingRepository } from "@calcom/features/bookings/repositories/BookingRepository";
import { MembershipRepository } from "@calcom/features/membership/repositories/MembershipRepository";
import { ErrorCode } from "@calcom/lib/errorCodes";
import { beforeEach, describe, expect, it, type Mock, vi } from "vitest";
import {
  BookingAuditAccessService,
  BookingAuditErrorCode,
  BookingAuditPermissionError,
} from "../BookingAuditAccessService";

vi.mock("@calcom/features/bookings/repositories/BookingRepository");
vi.mock("@calcom/features/membership/repositories/MembershipRepository");

const DB = {
  bookings: {} as Record<
    string,
    {
      uid: string;
      userId: number | null;
      eventType: {
        teamId: number | null;
        parent: { teamId: number } | null;
        hosts: never[];
        users: never[];
      };
      user: { id: number; email: string };
      attendees: never[];
    }
  >,
};

const createMockBooking = (overrides: { bookingUid: string; userId?: number | null }) => {
  const userId = overrides.userId === undefined ? 456 : overrides.userId;
  const booking = {
    uid: overrides.bookingUid,
    userId,
    eventType: {
      teamId: null,
      parent: null,
      hosts: [] as never[],
      users: [] as never[],
    },
    user: {
      id: typeof userId === "number" ? userId : 456,
      email: "test@example.com",
    },
    attendees: [] as never[],
  };
  DB.bookings[booking.uid] = booking;
  return booking;
};

const mockBookingRepository: {
  findByUidIncludeEventType: Mock<BookingRepository["findByUidIncludeEventType"]>;
} = {
  findByUidIncludeEventType: vi.fn().mockImplementation(({ bookingUid }) => {
    return Promise.resolve(DB.bookings[bookingUid] ?? null);
  }),
};

const mockMembershipRepository: {
  hasMembership: Mock<MembershipRepository["hasMembership"]>;
} = {
  hasMembership: vi.fn().mockResolvedValue(false),
};

function evaluated(plan: PlanKeyType) {
  const subscription =
    plan === PlanKey.FREE
      ? null
      : {
          cancelAtPeriodEnd: false,
          currentPeriodEnd: new Date("2026-08-15T12:00:00.000Z"),
          plan,
          status: BillingStatus.ACTIVE,
        };
  return {
    ...getEntitlements(subscription),
    usage: { acceptedOrganizationMembers: 0, activePersonalEventTypes: 0, connectedCalendars: 0 },
  };
}

describe("BookingAuditAccessService", () => {
  let service: BookingAuditAccessService;
  let mockEntitlements: { forUser: Mock<EntitlementService["forUser"]> };

  beforeEach(() => {
    vi.clearAllMocks();
    DB.bookings = {};

    vi.mocked(BookingRepository).mockImplementation(function () {
      return mockBookingRepository as unknown as BookingRepository;
    });
    vi.mocked(MembershipRepository).mockImplementation(function () {
      return mockMembershipRepository as unknown as MembershipRepository;
    });

    mockEntitlements = {
      forUser: vi.fn().mockResolvedValue(evaluated(PlanKey.TEAM)),
    };

    service = new BookingAuditAccessService({
      bookingRepository: mockBookingRepository as unknown as BookingRepository,
      entitlements: mockEntitlements,
      membershipRepository: mockMembershipRepository as unknown as MembershipRepository,
    });
  });

  describe("assertPermissions", () => {
    it.each([
      PlanKey.FREE,
      PlanKey.PRO,
    ])("should reject %s users before reading booking data", async (plan) => {
      mockEntitlements.forUser.mockResolvedValue(evaluated(plan));

      await expect(
        service.assertPermissions({ bookingUid: "test-booking-uid", userId: 123, organizationId: null })
      ).rejects.toMatchObject({ code: ErrorCode.EntitlementRequired });
      expect(mockBookingRepository.findByUidIncludeEventType).not.toHaveBeenCalled();
    });

    it("should grant access when the user is the booking owner", async () => {
      const bookingUid = "test-booking-uid";
      const userId = 123;
      createMockBooking({ bookingUid, userId });

      await expect(
        service.assertPermissions({ bookingUid, userId, organizationId: null })
      ).resolves.not.toThrow();
    });

    it("should throw PERMISSION_DENIED when user is not the booking owner", async () => {
      const bookingUid = "test-booking-uid";
      createMockBooking({ bookingUid, userId: 456 });

      await expect(
        service.assertPermissions({ bookingUid, userId: 123, organizationId: null })
      ).rejects.toThrow(BookingAuditPermissionError);
      await expect(
        service.assertPermissions({ bookingUid, userId: 123, organizationId: null })
      ).rejects.toThrow(BookingAuditErrorCode.PERMISSION_DENIED);
    });

    it("should throw BOOKING_NOT_FOUND_OR_PERMISSION_DENIED when booking does not exist", async () => {
      await expect(
        service.assertPermissions({ bookingUid: "non-existent", userId: 123, organizationId: null })
      ).rejects.toThrow(BookingAuditPermissionError);
      await expect(
        service.assertPermissions({ bookingUid: "non-existent", userId: 123, organizationId: null })
      ).rejects.toThrow(BookingAuditErrorCode.BOOKING_NOT_FOUND_OR_PERMISSION_DENIED);
    });

    it("should throw BOOKING_HAS_NO_OWNER when booking has no userId", async () => {
      const bookingUid = "test-booking-uid";
      createMockBooking({ bookingUid, userId: null });

      await expect(
        service.assertPermissions({ bookingUid, userId: 123, organizationId: null })
      ).rejects.toThrow(BookingAuditPermissionError);
      await expect(
        service.assertPermissions({ bookingUid, userId: 123, organizationId: null })
      ).rejects.toThrow(BookingAuditErrorCode.BOOKING_HAS_NO_OWNER);
    });
  });
});
