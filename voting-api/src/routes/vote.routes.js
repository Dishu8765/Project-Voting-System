const express = require('express');
const { submitVoteRules } = require('../middleware/validators');
const { validate } = require('../middleware/errorHandler');
const { authenticate } = require('../middleware/auth');
const voteService = require('../services/vote.service');

const router = express.Router();

/**
 * GET /api/votes/candidates
 * List active candidates on the ballot.
 */
router.get('/candidates', (req, res, next) => {
  try {
    const candidates = voteService.listActiveCandidates();
    res.json({ success: true, data: { candidates } });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/votes
 * Submit a vote. Stores only a cryptographic hash on the blockchain.
 */
router.post('/', authenticate, ...submitVoteRules, validate, async (req, res, next) => {
  try {
    const { candidateId } = req.body;
    const voterId = req.voter.voterId;

    const prepared = voteService.submitVote({ voterId, candidateId });
    const result = await voteService.recordVoteOnChainAndDb({
      voterId,
      candidateId,
      voteHash: prepared.voteHash,
      confirmationCode: prepared.confirmationCode,
      candidate: prepared.candidate
    });

    res.status(201).json({
      success: true,
      message: 'Your vote has been recorded and secured on the blockchain.',
      data: result
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
