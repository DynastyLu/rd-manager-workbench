import { WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import { Server } from 'socket.io';

export const KNOWLEDGE_SOCKET_OPTIONS = {
  namespace: '/knowledge',
  cors: { origin: true },
  maxHttpBufferSize: 1 * 1024 * 1024,
} as const;

export interface ExtensionTokenEvent {
  runId: string;
  token: string;
  index: number;
}

export interface ExtensionErrorEvent {
  runId: string;
  error: string;
  code?: string;
}

export interface ExtensionStreamDoneEvent {
  runId: string;
  citations?: Array<{
    documentId: string;
    title: string;
    chunkIndex: number;
    text: string;
  }>;
  fullContent: string;
}

export interface ExtensionStreamStartedEvent {
  runId: string;
  sessionId: string;
  question: string;
}

@WebSocketGateway(KNOWLEDGE_SOCKET_OPTIONS)
export class KnowledgeGateway {
  @WebSocketServer()
  server!: Server;

  /** Forward a streaming token from the Electron extension to the frontend */
  publishToken(event: ExtensionTokenEvent) {
    this.server?.emit('extension.token', event);
  }

  /** Forward an error from the Electron extension to the frontend */
  publishError(event: ExtensionErrorEvent) {
    this.server?.emit('extension.error', event);
  }

  /** Notify frontend that streaming has completed */
  publishStreamDone(event: ExtensionStreamDoneEvent) {
    this.server?.emit('extension.stream.done', event);
  }

  /** Notify frontend that streaming has started */
  publishStreamStarted(event: ExtensionStreamStartedEvent) {
    this.server?.emit('extension.stream.started', event);
  }
}
