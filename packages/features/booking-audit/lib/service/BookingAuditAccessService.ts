import { assertEntitled } from "@calcom/features/billing/lib/entitlements";
import { EntitlementService } from "@calcom/features/billing/services/EntitlementService";
import type { BookingRepository } from "@calcom/features/bookings/repositories/BookingRepository";
import type { MembershipRepository } from "@calcom/features/membership/repositories/MembershipRepository";

export enum BookingAuditErrorCode {
  ORGANIZATION_ID_REQUIRED = "ORGANIZATION_ID_REQUIRED",
  BOOKING_NOT_FOUND_OR_PERMISSION_DENIED = "BOOKING_NOT_FOUND_OR_PERMISSION_DENIED",
  BOOKING_HAS_NO_OWNER = "BOOKING_HAS_NO_OWNER",
  OWNER_NOT_IN_ORGANIZATION = "OWNER_NOT_IN_ORGANIZATION",
  PERMISSION_DENIED = "PERMISSION_DENIED",
}

export class BookingAuditPermissionError extends Error {
  constructor(public readonly code: BookingAuditErrorCode) {
    super(code);
    this.name = "BookingAuditPermissionError";
  }
}

interface BookingAuditAccessServiceDeps {
  bookingRepository: BookingRepository;
  entitlements?: Pick<EntitlementService, "forUser">;
  membershipRepository: MembershipRepository;
}

/**
 * BookingAuditAccessService - Service for checking access permissions to booking audit logs.
 * Access requires both a Team entitlement and ownership of the booking.
 */
export class BookingAuditAccessService {
  private readonly bookingRepository: BookingRepository;
  private readonly entitlements: Pick<EntitlementService, "forUser">;
  private readonly membershipRepository: MembershipRepository;

  constructor(deps: BookingAuditAccessServiceDeps) {
    this.bookingRepository = deps.bookingRepository;
    this.entitlements = deps.entitlements ?? new EntitlementService();
    this.membershipRepository = deps.membershipRepository;
  }

  /**
   * Check if user has permission to view audit logs for a booking.
   * The booking owner can view audit logs when their account has the Team capability.
   */
  async assertPermissions({
    bookingUid,
    userId,
  }: {
    bookingUid: string;
    userId: number;
    organizationId: number | null;
  }): Promise<void> {
    assertEntitled(await this.entitlements.forUser(userId), "canReadBookingAudit");

    const booking = await this.bookingRepository.findByUidIncludeEventType({ bookingUid });
    if (!booking) {
      throw new BookingAuditPermissionError(BookingAuditErrorCode.BOOKING_NOT_FOUND_OR_PERMISSION_DENIED);
    }

    const bookingOwnerId = booking.userId;

    if (!bookingOwnerId) {
      throw new BookingAuditPermissionError(BookingAuditErrorCode.BOOKING_HAS_NO_OWNER);
    }

    // Ownership remains mandatory after the plan capability check.
    if (bookingOwnerId === userId) {
      return;
    }

    throw new BookingAuditPermissionError(BookingAuditErrorCode.PERMISSION_DENIED);
  }
}
