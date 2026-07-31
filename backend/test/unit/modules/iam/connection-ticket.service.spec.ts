import { HttpStatus } from '@nestjs/common';
import { ErrorCodes } from '../../../../src/shared/errors/error-codes';
import { ConnectionTicketService } from '../../../../src/modules/iam/application/connection-ticket.service';
import { AuthenticatedPrincipal } from '../../../../src/modules/iam/domain/principal';

const now = new Date('2026-07-30T08:00:00.000Z');

const principal: AuthenticatedPrincipal = {
  userId: 'user-1',
  employeeId: 'employee-1',
  username: 'alice',
  sessionId: 'session-1',
  mustChangePassword: false,
  roleCodes: ['EMPLOYEE'],
  permissions: [{ code: 'document.read', dataScope: 'ALL', scopeConfig: null }],
  permissionVersion: 1,
};

function fixture() {
  const service = new ConnectionTicketService();
  return { service };
}

describe('ConnectionTicketService', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(now);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('issues a one-time ticket that can be consumed for the requested audience', async () => {
    const { service } = fixture();

    const ticket = service.issue(principal, 'knowledge-sse');

    expect(ticket).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
    await expect(service.consume(ticket, 'knowledge-sse')).resolves.toMatchObject({
      userId: principal.userId,
    });
  });

  it('rejects consuming the same ticket twice', async () => {
    const { service } = fixture();
    const ticket = service.issue(principal, 'knowledge-sse');

    await expect(service.consume(ticket, 'knowledge-sse')).resolves.toMatchObject({
      userId: principal.userId,
    });
    await expect(service.consume(ticket, 'knowledge-sse')).rejects.toMatchObject({
      code: ErrorCodes.AUTH_CONNECTION_TICKET_INVALID,
      statusCode: HttpStatus.UNAUTHORIZED,
    });
  });

  it('rejects a ticket consumed for the wrong audience', async () => {
    const { service } = fixture();
    const ticket = service.issue(principal, 'knowledge-sse');

    await expect(service.consume(ticket, 'notification-socket')).rejects.toMatchObject({
      code: ErrorCodes.AUTH_CONNECTION_TICKET_INVALID,
    });
  });

  it('rejects an expired ticket', async () => {
    const { service } = fixture();
    const ticket = service.issue(principal, 'knowledge-sse');

    jest.advanceTimersByTime(60_001);

    await expect(service.consume(ticket, 'knowledge-sse')).rejects.toMatchObject({
      code: ErrorCodes.AUTH_CONNECTION_TICKET_INVALID,
    });
  });
});
