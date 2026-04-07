import winston from 'winston';

const isDev = process.env.NODE_ENV !== 'production';

// Production: JSON format for log aggregation
// Development: colored, human-readable pretty-print
export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL ?? 'info',
  format: isDev
    ? winston.format.combine(
        winston.format.colorize(),
        winston.format.timestamp(),
        winston.format.printf(({ timestamp, level, message, ...meta }) => {
          const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
          return `${timestamp as string} [${level}] ${message as string}${metaStr}`;
        }),
      )
    : winston.format.combine(
        winston.format.timestamp(),
        winston.format.json(),
      ),
  defaultMeta: { service: 'crawler' },
  transports: [new winston.transports.Console()],
});

// Usage: always include context fields { url, sourceId, jobId }
// Example: logger.info('Crawl job started', { url, sourceId, jobId });
// Do NOT pass Error objects directly — they serialize poorly in winston.
// Use: logger.error('Job failed', { url, sourceId, jobId, err: err.message, stack: err.stack });
