import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';
import {
  isSocketOriginAllowed,
  resolveSocketAllowedOrigins,
} from './socket-allowed-origins';

@WebSocketGateway({
  namespace: '/',
  path: '/socket',
  cors: {
    origin: (
      origin: string | undefined,
      callback: (err: Error | null, allow?: boolean) => void,
    ) => {
      const allowed = resolveSocketAllowedOrigins();

      if (allowed.length === 0 && process.env.NODE_ENV === 'production') {
        return callback(
          new Error(
            'SOCKET_ALLOWED_ORIGINS or PUBLIC_BASE_URL/PUBLIC_PROXY_PORT must be set in production',
          ),
        );
      }

      if (isSocketOriginAllowed(origin, allowed)) {
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
