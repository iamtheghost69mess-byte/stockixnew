import './env'; // Boot validation — must be first
import './bootstrap-decrypt-env';
import './before';
import * as Sentry from '@sentry/node';
import { json, urlencoded } from 'express';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { ClsMiddleware } from 'nestjs-cls';
import * as path from 'path';
import './utils/moment-mysql';
import { AppModule } from './modules/App/App.module';
import { NestExpressApplication } from '@nestjs/platform-express';
import {
  isHttpOriginAllowed,
  resolveHttpAllowedOrigins,
} from './common/http/http-allowed-origins';
import { StructuredNestLogger } from './common/logging/structured-nest-logger.service';
import { logger } from '@stockix-finance/shared/structured-logger';

global.__public_dirname = path.join(__dirname, '..', 'public');
global.__static_dirname = path.join(__dirname, '../static');
global.__views_dirname = path.join(global.__static_dirname, '/views');
global.__images_dirname = path.join(global.__static_dirname, '/images');

process.on('unhandledRejection', (reason, promise) => {
  // ORIGINAL: console.error(JSON.stringify({ level: 'error', type: 'unhandled_rejection', ... }));
  logger.error('unhandled_rejection', reason instanceof Error ? reason : undefined, {
    type: 'unhandled_rejection',
    reason: reason instanceof Error ? reason.message : String(reason),
    promise: String(promise),
  });
});

process.on('uncaughtException', (error) => {
  // ORIGINAL: console.error(JSON.stringify({ level: 'error', type: 'uncaught_exception', ... }));
  logger.error('uncaught_exception', error, {
    type: 'uncaught_exception',
    message: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
  });
  process.exit(1);
});

const sentryDsn = process.env.SENTRY_DSN?.trim();
if (sentryDsn) {
  Sentry.init({
    dsn: sentryDsn,
    environment: process.env.SENTRY_ENVIRONMENT ?? process.env.NODE_ENV ?? 'production',
    tracesSampleRate: 0.1,
  });
}

async function bootstrap() {
  // ORIGINAL: const app = await NestFactory.create<NestExpressApplication>(AppModule, { rawBody: true });
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    rawBody: true,
    bufferLogs: true,
  });
  app.useLogger(app.get(StructuredNestLogger));
  app.set('query parser', 'extended');
  app.setGlobalPrefix('/api');

  const corsOrigins = resolveHttpAllowedOrigins();
  if (corsOrigins.length === 0 && process.env.NODE_ENV === 'production') {
    console.warn(
      JSON.stringify({
        level: 'warn',
        type: 'cors_config',
        message:
          'No HTTP CORS origins configured — set CORS_ALLOWED_ORIGINS or PUBLIC_BASE_URL',
      }),
    );
  }
  app.enableCors({
    origin: (
      origin: string | undefined,
      callback: (err: Error | null, allow?: boolean) => void,
    ) => {
      if (!origin || isHttpOriginAllowed(origin, corsOrigins)) {
        callback(null, true);
        return;
      }
      callback(new Error(`CORS: origin ${origin} not allowed`));
    },
    credentials: true,
    methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'organization-id',
      'Accept-Language',
    ],
  });

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const helmet = require('helmet') as typeof import('helmet');
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
          styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://cdnjs.cloudflare.com"],
          imgSrc: ["'self'", 'data:', 'https:', 'blob:'],
          connectSrc: ["'self'", "http://*.localhost", "http://127.0.0.1:*", "http://localhost:*"],
          fontSrc: ["'self'", 'data:', "https://fonts.gstatic.com"],
        },
      },
    }),
  );
  app.use(json({ limit: process.env.REQUEST_BODY_LIMIT ?? '2mb' }));
  app.use(
    urlencoded({ extended: true, limit: process.env.REQUEST_BODY_LIMIT ?? '2mb' }),
  );

  // create and mount the middleware manually here
  app.use(new ClsMiddleware({}).use);

  const config = new DocumentBuilder()
    .setTitle('Stockix')
    .setDescription('Financial accounting software')
    .setVersion('1.0')
    .build();

  const documentFactory = () => SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('swagger', app, documentFactory);

  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
