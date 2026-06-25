const winston = require('winston');
const path = require('path');
const fs = require('fs');
const config = require('../config');

const logsDir = path.join(process.cwd(), 'logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

const formats = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.printf(({ timestamp, level, message, stack, ...meta }) => {
    const extra = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
    const base = `${timestamp} [${level.toUpperCase()}] ${message}${extra}`;
    return stack ? `${base}\n${stack}` : base;
  })
);

const logger = winston.createLogger({
  level: config.nodeEnv === 'production' ? 'info' : 'debug',
  format: formats,
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({
      filename: path.join(logsDir, 'voting-api.log'),
      maxsize: 5 * 1024 * 1024,
      maxFiles: 5
    })
  ]
});

module.exports = logger;
