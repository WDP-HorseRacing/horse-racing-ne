/**
 * Một event đã được relay nhận để giao.
 */
export interface ClaimedOutboxEvent {
  id: string;
  eventName: string;
  payload: unknown;
  attempts: number;
}
