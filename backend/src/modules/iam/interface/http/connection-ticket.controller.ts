import { Body, Controller, Post } from '@nestjs/common';
import { ConnectionTicketService } from '../../application/connection-ticket.service';
import type { AuthenticatedPrincipal } from '../../domain/principal';
import { CurrentUser } from './current-user.decorator';
import { ConnectionTicketDto } from './dto/auth.dto';

@Controller('auth/connection-tickets')
export class ConnectionTicketController {
  constructor(private readonly connectionTickets: ConnectionTicketService) {}

  @Post()
  create(@CurrentUser() principal: AuthenticatedPrincipal, @Body() dto: ConnectionTicketDto) {
    const ticket = this.connectionTickets.issue(principal, dto.audience);
    return { ticket };
  }
}
