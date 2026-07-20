import { WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import { Server } from 'socket.io';

const LOCAL_EXTENSION_ORIGINS = new Set([
  'http://127.0.0.1:4312',
  'http://localhost:4312',
]);

export function allowLocalExtensionOrigin(
  origin: string | undefined,
  callback: (error: Error | null, allowed?: boolean) => void,
) {
  if (!origin || LOCAL_EXTENSION_ORIGINS.has(origin)) {
    callback(null, true);
    return;
  }
  callback(new Error('EXTENSION_SOCKET_ORIGIN_REJECTED'), false);
}

export const EXTENSIONS_SOCKET_OPTIONS = {
  namespace: '/extensions',
  cors: { origin: allowLocalExtensionOrigin },
  maxHttpBufferSize: 2 * 1024 * 1024,
} as const;

export interface ExtensionRunRequestedEvent {
  runId: string;
  deliveryId?: string;
  profile: {
    id: string;
    kind: 'SMS' | 'AI' | 'CALENDAR' | 'CLOUD_DRIVE';
    provider: string;
    enabled: boolean;
    publicConfig: unknown;
    credentialRef?: string | null;
    permissions: string[];
  };
  operation: string;
  inputSha256: string;
  completionToken: string;
  payload: Record<string, unknown>;
}

@WebSocketGateway(EXTENSIONS_SOCKET_OPTIONS)
export class ExtensionsGateway {
  @WebSocketServer()
  server!: Server;

  publishRunRequested(event: ExtensionRunRequestedEvent) {
    this.server?.emit('extension.run.requested', event);
  }
}
