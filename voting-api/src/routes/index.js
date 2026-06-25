const express = require('express');
const authRoutes = require('./auth.routes');
const voteRoutes = require('./vote.routes');
const tallyRoutes = require('./tally.routes');
const auditRoutes = require('./audit.routes');
const adminRoutes = require('./admin.routes');
const blockchainRoutes = require('./blockchain.routes');

const router = express.Router();

router.use('/auth', authRoutes);
router.use('/votes', voteRoutes);
router.use('/tally', tallyRoutes);
router.use('/audit', auditRoutes);
router.use('/admin', adminRoutes);
router.use('/blockchain', blockchainRoutes);

module.exports = router;
