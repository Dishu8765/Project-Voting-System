const { createApp, bootstrap } = require('./app');
const config = require('./config');
const logger = require('./utils/logger');
const { closeDb } = require('./db');

bootstrap();

const app = createApp();

const server = app.listen(config.port, () => {
  logger.info('Secure Vote API started', {
    port: config.port,
    environment: config.nodeEnv,
    blockchain: config.blockchain.provider,
    timestamp: new Date().toISOString()
  });
});

function shutdown(signal) {
  logger.info(`Received ${signal} — shutting down`);
  server.close(() => {
    closeDb();
    process.exit(0);
  });
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

module.exports = server;
