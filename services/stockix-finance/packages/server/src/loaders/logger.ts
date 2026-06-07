import winston from 'winston';

const transports = [
  new winston.transports.Console({ level: process.env.LOG_LEVEL ?? 'info' }),
];

export default winston.createLogger({
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json(),
  ),
  defaultMeta: { service: 'stockix-finance' },
  transports,
});
