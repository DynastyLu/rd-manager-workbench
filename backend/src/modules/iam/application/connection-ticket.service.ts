import { HttpStatus, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { AppError } from '../../../shared/errors/app-error';
import { ErrorCodes } from '../../../shared/errors/error-codes';
import { AuthenticatedPrincipal } from '../domain/principal';

export type ConnectionTicketAudience = 'knowledge-sse' | 'notification-socket';

interface TicketEntry {
  principal: AuthenticatedPrincipal;
  audience: ConnectionTicketAudience;
  expiresAt: Date;
}

const TICKET_TTL_MS = 60_000;

@Injectable()
export class ConnectionTicketService {
  private readonly tickets = new Map<string, TicketEntry>();

  issue(principal: AuthenticatedPrincipal, audience: ConnectionTicketAudience): string {
    const ticket = randomUUID();
    const expiresAt = new Date(Date.now() + TICKET_TTL_MS);
    this.tickets.set(ticket, { principal, audience, expiresAt });
    setTimeout(() => this.tickets.delete(ticket), TICKET_TTL_MS);
    return ticket;
  }

  async consume(ticket: string, audience: ConnectionTicketAudience): Promise<AuthenticatedPrincipal> {
    const entry = this.tickets.get(ticket);
    if (!entry || entry.audience !== audience || entry.expiresAt.getTime() <= Date.now()) {
      throw new AppError({
        code: ErrorCodes.AUTH_CONNECTION_TICKET_INVALID,
        message: 'Connection ticket is invalid, expired or does not match the requested audience',
        statusCode: HttpStatus.UNAUTHORIZED,
      });
    }
    this.tickets.delete(ticket);
    return entry.principal;
  }
}
