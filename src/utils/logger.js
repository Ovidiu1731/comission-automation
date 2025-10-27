/**
 * Winston logger configuration for structured logging
 */
import winston from 'winston';

// Custom format for structured JSON logging
const jsonFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.errors({ stack: true }),
  winston.format.json()
);

// Simple format for development
const simpleFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.printf(({ timestamp, level, message, ...data }) => {
    let msg = `${timestamp} [${level}]: ${message}`;
    if (Object.keys(data).length > 0) {
      msg += ` ${JSON.stringify(data)}`;
    }
    return msg;
  })
);

// Create logger instance
export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: process.env.NODE_ENV === 'production' ? jsonFormat : simpleFormat,
  defaultMeta: {
    service: 'commission-automation'
  },
  transports: [
    new winston.transports.Console({
      stderrLevels: ['error']
    })
  ]
});

// Add file transport in production
if (process.env.NODE_ENV === 'production') {
  logger.add(new winston.transports.File({
    filename: 'error.log',
    level: 'error'
  }));
  logger.add(new winston.transports.File({
    filename: 'combined.log'
  }));
}

