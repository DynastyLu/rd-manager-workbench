import { Notification } from '@prisma/client';
import { OnGatewayConnection, WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { AuthService } from '../../iam/application/auth.service';

@WebSocketGateway({ namespace: '/notifications', cors: { origin: true } })
export class NotificationsGateway implements OnGatewayConnection {
  @WebSocketServer()
  server!: Server;

  constructor(private readonly authService: AuthService) {}

  async handleConnection(client: Socket) {
    const token = client.handshake.auth?.token;
    if (typeof token !== 'string' || token.length === 0) {
      client.disconnect(true);
      return;
    }

    try {
      const principal = await this.authService.authenticateBearer(`Bearer ${token}`);
      await client.join(`user:${principal.userId}`);
    } catch {
      client.disconnect(true);
    }
  }

  publish(notification: Notification) {
    this.server?.emit('notification.created', notification);
  }

  emitPermissionsChanged(userId: string) {
    this.server?.to(`user:${userId}`).emit('auth.permissions.changed', { userId });
  }

  emitSessionRevoked(userId: string) {
    this.server?.to(`user:${userId}`).emit('auth.session.revoked', { userId });
    void this.server?.in(`user:${userId}`).disconnectSockets(true);
  }
}
