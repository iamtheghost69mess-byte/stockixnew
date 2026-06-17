import { registerAs } from '@nestjs/config';

export default registerAs('jwt', () => {
  // APP_JWT_SECRET is preferred; JWT_SECRET is the legacy name used by the
  // tenant-stack docker-compose. Accept both so rolling deploys don't break.
  const secret = process.env.APP_JWT_SECRET || process.env.JWT_SECRET;
  if (!secret) {
    throw new Error(
      'A JWT signing secret is required. Set APP_JWT_SECRET (preferred) or JWT_SECRET. ' +
      'Refusing to start without one.',
    );
  }
  return { secret };
});
