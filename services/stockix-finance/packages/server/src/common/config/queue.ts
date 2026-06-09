import { registerAs } from '@nestjs/config';

export default registerAs('queue', () => ({
  host: process.env.QUEUE_HOST || 'localhost',
  port: parseInt(process.env.QUEUE_PORT, 10) || 6379,
  password: process.env.QUEUE_PASSWORD || process.env.REDIS_PASSWORD || undefined,
}));
