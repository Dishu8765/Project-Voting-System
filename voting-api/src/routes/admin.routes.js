'use strict';
/**
 * admin.routes.js — Routes for the Admin Dashboard.
 *
 * POST   /api/admin/login         — Admin login (returns JWT)
 * GET    /api/admin/tally         — Full tally with percentages [protected]
 * GET    /api/admin/audit-log     — Full audit log [protected]
 * POST   /api/admin/finalize      — Finalize election [protected]
 * GET    /api/admin/verify/:txHash — Verify vote by tx hash [protected]
 */

const express = require('express');
const jwt = require('jsonwebtoken');
const { body, param, query, validationResult } = require('express-validator');
const adminService = require('../services/admin.service');
const config = require('../config');

const router = express.Router();

// ── Admin JWT Middleware ────────────────────────────────────────────────────

function authenticateAdmin(req, res, next) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token) {
    return res.status(401).json({
      success: false,
      message: 'Admin authentication required. Please log in.'
    });
  }

  try {
    const payload = jwt.verify(token, config.adminJwt.secret);
    if (payload.role !== 'admin') throw new Error('Not an admin token');
    req.admin = payload;
    next();
  } catch {
    res.status(401).json({
      success: false,
      message: 'Session expired or invalid. Please log in again.'
    });
  }
}

function validate(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: errors.array()[0].msg,
      errors: errors.array()
    });
  }
  next();
}

// ── Routes ─────────────────────────────────────────────────────────────────

/**
 * POST /api/admin/login
 * Body: { username, password }
 */
router.post(
  '/login',
  [
    body('username').trim().notEmpty().withMessage('Username is required.'),
    body('password').notEmpty().withMessage('Password is required.')
  ],
  validate,
  async (req, res, next) => {
    try {
      const result = await adminService.loginAdmin(req.body);
      res.json({ success: true, message: 'Login successful.', data: result });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * GET /api/admin/tally
 * Returns full candidate tally with vote counts and percentages.
 */
router.get('/tally', authenticateAdmin, (req, res, next) => {
  try {
    const tally = adminService.getFullTally();
    res.json({ success: true, data: tally });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/admin/audit-log?limit=200&offset=0
 * Returns paginated list of all blockchain-recorded votes.
 */
router.get(
  '/audit-log',
  authenticateAdmin,
  [
    query('limit').optional().isInt({ min: 1, max: 1000 }).toInt(),
    query('offset').optional().isInt({ min: 0 }).toInt()
  ],
  validate,
  (req, res, next) => {
    try {
      const log = adminService.getAuditLog({
        limit: req.query.limit || 200,
        offset: req.query.offset || 0
      });
      res.json({ success: true, data: log });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * POST /api/admin/finalize
 * Marks the election as finalized. Irreversible.
 */
router.post('/finalize', authenticateAdmin, (req, res, next) => {
  try {
    const result = adminService.finalizeElection();
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/admin/verify/:txHash
 * Verify a voter receipt by transaction hash (admin view shows candidate name).
 */
router.get(
  '/verify/:txHash',
  authenticateAdmin,
  [
    param('txHash')
      .trim()
      .matches(/^0x[0-9a-fA-F]{64}$/)
      .withMessage('Invalid transaction hash format.')
  ],
  validate,
  async (req, res, next) => {
    try {
      const result = await adminService.verifyByTxHash(req.params.txHash);
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }
);

module.exports = router;
