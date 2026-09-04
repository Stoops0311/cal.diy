import type { BookingHandlerInput } from "@calcom/features/bookings/lib/dto/types";
import { vi } from "vitest";

vi.mock("@calcom/features/eventtypes/services/TeamEventEntitlementService", () => ({
  TeamEventEntitlementService: class {
    async assertActive(): Promise<void> {}
  },
}));

async function handler(input: BookingHandlerInput) {
  const { getRegularBookingService } = await import(
    "@calcom/features/bookings/di/RegularBookingService.container"
  );
  const regularBookingService = getRegularBookingService();
  const { bookingData, ...bookingMeta } = input;
  return regularBookingService.createBooking({
    bookingData,
    bookingMeta,
  });
}

export function getNewBookingHandler() {
  return handler;
}
