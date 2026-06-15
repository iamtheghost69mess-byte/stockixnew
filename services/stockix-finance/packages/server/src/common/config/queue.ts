import { registerAs } from '@nestjs/config';

export default registerAs('queue', () => {
  const host = process.env.QUEUE_HOST || process.env.REDIS_HOST;
  if (!host) {
    throw new Error('QUEUE_HOST or REDIS_HOST environment variable is missing.');
  }
  return {
    host,
    port: parseInt(process.env.QUEUE_PORT ?? process.env.REDIS_PORT ?? '', 10) || 6379,
    password: process.env.REDIS_PASSWORD || undefined,
    db: parseInt(process.env.REDIS_DB ?? '', 10) || 0,
  };
});
