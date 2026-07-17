export interface DomainEvent<TPayload = unknown> {
  eventId: string;
  eventName: string;
  occurredAt: Date;
  payload: TPayload;
}
