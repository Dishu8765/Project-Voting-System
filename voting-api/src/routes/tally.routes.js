const express = require('express');
const tallyService = require('../services/tally.service');

const router = express.Router();

/**
 * GET /api/tally
 * Return current vote counts per candidate.
 */
router.get('/', (req, res, next) => {
  try {
    const tally = tallyService.getTally();
    res.json({ success: true, data: tally });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
