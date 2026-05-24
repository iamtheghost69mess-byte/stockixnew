import winston from 'winston';

const transports = [
  new winston.transports.Console({ level: 'info' }),
];

export default winston.createLogger({
  transports: transports,
});
