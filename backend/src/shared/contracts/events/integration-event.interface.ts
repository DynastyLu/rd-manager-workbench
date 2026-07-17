export interface IntegrationEvent<TPayload = unknown> {
  eventId: string;
  eventName: string;
  occurredAt: string;
  payload: TPayload;
}
