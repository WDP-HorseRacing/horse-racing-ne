/**
 * Payload của domain event BILLING_SURCHARGE_ADDED_EVENT
 *
 * - eventId: UUID của khoản phụ phí
 */
export interface SurchargeAddedEvent {
  eventId: string;
  horseId: string;
  description: string;
  startDate: string;
  endDate: string;
}
