import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';

@WebSocketGateway({
  namespace: '/',
  path: '/socket',
  cors: {
    origin: (
      origin: string | undefined,
      callback: (err: Error | null, allow?: boolean) => void,
    ) => {
      const rawOrigins = process.env.SOCKET_ALLOWED_ORIGINS;

      const defaultOrigins =
        process.env.NODE_ENV !== 'production'
          ? 'http://localhost:3000,http://localhost:3001'
          : '';

      if (!rawOrigins && process.env.NODE_ENV === 'production') {
        return callback(
          new Error('SOCKET_ALLOWED_ORIGINS must be set in production'),
        );
      }

      const allowed = (rawOrigins || defaultOrigins)
        .split(',')
        .map((o: string) => o.trim())
        .filter(Boolean);

      if (!origin || allowed.some((a: string) => origin.startsWith(a))) {
        callback(null, true);
      } else {
        callback(new Error(`WebSocket CORS: origin ${origin} not allowed`));
      }
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

  emitNewTransactionsData() {
    this.server.emit('NEW_TRANSACTIONS_DATA');
    this.logger.log('Emitted NEW_TRANSACTIONS_DATA event');
  }

  emitSubscriptionChanged() {
    this.server.emit('SUBSCRIPTION_CHANGED');
    this.logger.log('Emitted SUBSCRIPTION_CHANGED event');
  }
}
