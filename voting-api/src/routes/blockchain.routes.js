'use strict';
/**
 * blockchain.routes.js — Blockchain status endpoint.
 *
 * GET /api/blockchain/status
 *   Returns: connection status, block number, contract address, account count.
 */

const express = require('express');
const blockchain = require('../services/blockchain');

const router = express.Router();

/**
 * GET /api/blockchain/status
 * Public endpoint — returns current Ganache/blockchain connection info.
 */
router.get('/status', async (req, res, next) => {
  try {
    const status = await blockchain.getStatus();
    res.json({ success: true, data: status });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
