import { Notification } from '@prisma/client';
import { WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import { Server } from 'socket.io';

@WebSocketGateway({ namespace: '/notifications', cors: { origin: true } })
export class NotificationsGateway {
  @WebSocketServer()
  server!: Server;

  publish(notification: Notification) {
    this.server?.emit('notification.created', notification);
  }
}
