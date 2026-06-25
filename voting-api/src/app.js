const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const config = require('./config');
const routes = require('./routes');
const { errorHandler, notFoundHandler } = require('./middleware/errorHandler');
const logger = require('./utils/logger');
const { getDb } = require('./db');
const { seed } = require('./data/seed');

function createApp() {
  const app = express();

  app.use(helmet());
  app.use(express.json({ limit: '10kb' }));

  const corsOptions =
    config.corsOrigin === '*'
      ? { origin: true }
      : { origin: config.corsOrigin.split(',').map((o) => o.trim()) };
  app.use(cors(corsOptions));

  app.use((req, res, next) => {
    logger.debug('Incoming request', { method: req.method, path: req.path });
    next();
  });

  app.get('/health', (req, res) => {
    try {
      getDb().prepare('SELECT 1').get();
      res.json({
        success: true,
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: Math.floor(process.uptime()),
        environment: config.nodeEnv,
        blockchain: config.blockchain.provider
      });
    } catch {
      res.status(503).json({
        success: false,
        status: 'unhealthy',
        message: 'The voting system is temporarily unavailable.',
        timestamp: new Date().toISOString()
      });
    }
  });

  app.use('/api', routes);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

function bootstrap() {
  getDb();
  const voterCount = getDb().prepare('SELECT COUNT(*) AS c FROM voters').get().c;
  if (voterCount === 0) {
    logger.info('Empty database detected — running seed');
    seed();
  }
}

module.exports = { createApp, bootstrap };
