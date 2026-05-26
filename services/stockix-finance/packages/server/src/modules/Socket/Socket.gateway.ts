import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';

function resolveSocketAllowedOrigins(): string[] {
  const raw =
    process.env.SOCKET_ALLOWED_ORIGINS?.trim()
    || process.env.PUBLIC_BASE_URL?.trim()
    || 'http://localhost:3000';
  return raw.split(',').map((o) => o.trim()).filter(Boolean);
}

@WebSocketGateway({
  namespace: '/',
  path: '/socket',
  cors: {
    origin: (
      origin: string | undefined,
      callback: (err: Error | null, allow?: boolean) => void,
    ) => {
      const allowed = resolveSocketAllowedOrigins();
      if (!origin || allowed.some((entry) => origin === entry || origin.startsWith(entry))) {
        callback(null, true);
        return;
      }
      callback(new Error(`WebSocket CORS: ${origin} not allowed`));
    },
    credentials: true,
    methods: ['GET', 'POST'],
  },
})
export class SocketGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private logger: Logger = new Logger('SocketGateway');

  afterInit(server: Server) {
    this.logger.log('Socket.IO Gateway initialized');
  }

  handleConnection(client: Socket, ...args: any[]) {
    this.logger.log(`Client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`);
  }

  // Method to emit NEW_TRANSACTIONS_DATA event
  emitNewTransactionsData() {
    this.server.emit('NEW_TRANSACTIONS_DATA');
    this.logger.log('Emitted NEW_TRANSACTIONS_DATA event');
  }

  // Method to emit SUBSCRIPTION_CHANGED event
  emitSubscriptionChanged() {
    this.server.emit('SUBSCRIPTION_CHANGED');
    this.logger.log('Emitted SUBSCRIPTION_CHANGED event');
  }
}


