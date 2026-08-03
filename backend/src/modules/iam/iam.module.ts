import { Global, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { ThrottlerModule } from '@nestjs/throttler';
import { NotificationsModule } from '../workbench/notifications/notifications.module';
import { AuthService } from './application/auth.service';
import { AuthorizationService } from './application/authorization.service';
import { BootstrapService } from './application/bootstrap.service';
import { ConnectionTicketService } from './application/connection-ticket.service';
import { DataScopeService } from './application/data-scope.service';
import { PasswordService } from './application/password.service';
import { RolesService } from './application/roles.service';
import { SecurityAuditService } from './application/security-audit.service';
import { TokenService } from './application/token.service';
import { UsersService } from './application/users.service';
import { OwnershipMigrationService } from './application/ownership-migration.service';
import { AdminAuditsController } from './interface/http/admin-audits.controller';
import { AdminOwnershipMigrationController } from './interface/http/admin-ownership.controller';
import { AdminPermissionsController } from './interface/http/admin-permissions.controller';
import { AdminRolesController } from './interface/http/admin-roles.controller';
import { AdminUsersController } from './interface/http/admin-users.controller';
import { AuthController } from './interface/http/auth.controller';
import { AuthenticationGuard } from './interface/http/authentication.guard';
import { ConnectionTicketController } from './interface/http/connection-ticket.controller';
import { PermissionGuard } from './interface/http/permission.guard';

@Global()
@Module({
  imports: [
    JwtModule.register({}),
    ThrottlerModule.forRoot([
      {
        name: 'ip',
        ttl: 60_000,
        limit: 200,
        getTracker: (request) => request.ip,
      },
      {
        name: 'identifier',
        ttl: 60_000,
        limit: 200,
        getTracker: (request) =>
          typeof (request.body?.identifier ?? request.body?.username) === 'string'
            ? (request.body.identifier ?? request.body.username).trim().toLowerCase()
            : request.ip,
      },
    ]),
    NotificationsModule,
  ],
  controllers: [
    AuthController,
    AdminPermissionsController,
    AdminRolesController,
    AdminUsersController,
    AdminAuditsController,
    ConnectionTicketController,
    AdminOwnershipMigrationController,
  ],
  providers: [
    AuthService,
    AuthorizationService,
    BootstrapService,
    ConnectionTicketService,
    DataScopeService,
    OwnershipMigrationService,
    PasswordService,
    RolesService,
    SecurityAuditService,
    TokenService,
    UsersService,
    {
      provide: APP_GUARD,
      useClass: AuthenticationGuard,
    },
    {
      provide: APP_GUARD,
      useClass: PermissionGuard,
    },
  ],
  exports: [AuthService, AuthorizationService, ConnectionTicketService, DataScopeService, PasswordService, RolesService, SecurityAuditService, TokenService],
})
export class IamModule {}
