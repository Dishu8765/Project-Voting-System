require('dotenv').config();

const config = {
  port: parseInt(process.env.PORT, 10) || 3000,
  nodeEnv: process.env.NODE_ENV || 'development',
  databaseUrl: process.env.DATABASE_URL || './data/voting.db',
  jwt: {
    secret: process.env.JWT_SECRET || 'dev-fallback-secret-not-for-production',
    expiresIn: process.env.JWT_EXPIRES_IN || '30m'
  },
  adminJwt: {
    secret: process.env.ADMIN_JWT_SECRET || 'admin-dev-fallback-secret',
    expiresIn: process.env.ADMIN_JWT_EXPIRES_IN || '8h'
  },
  blockchain: {
    provider: process.env.BLOCKCHAIN_PROVIDER || 'simulated',
    nodeUrl: process.env.BLOCKCHAIN_NODE_URL || 'http://localhost:8545',
    chainId: parseInt(process.env.BLOCKCHAIN_CHAIN_ID, 10) || 1337,
    contractAddress: process.env.CONTRACT_ADDRESS || null
  },
  rateLimit: {
    authWindowMs: parseInt(process.env.AUTH_RATE_LIMIT_WINDOW_MS, 10) || 15 * 60 * 1000,
    authMax: parseInt(process.env.AUTH_RATE_LIMIT_MAX, 10) || 10
  },
  corsOrigin: process.env.CORS_ORIGIN || '*'
};

if (config.nodeEnv === 'production' && config.jwt.secret === 'dev-fallback-secret-not-for-production') {
  console.warn('WARNING: JWT_SECRET is not set. Set a strong secret before running in production.');
}

module.exports = config;
