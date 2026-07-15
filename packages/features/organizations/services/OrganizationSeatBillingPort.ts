interface OrganizationSeatBillingPort {
  syncAcceptedSeats(input: { desiredSeats: number; organizationId: number }): Promise<void>;
}

export type { OrganizationSeatBillingPort };
