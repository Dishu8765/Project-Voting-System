const crypto = require('crypto');

function sha256(data) {
  return crypto.createHash('sha256').update(data).digest('hex');
}

function hashVotePayload({ candidateId, voterToken, nonce, timestamp }) {
  const payload = JSON.stringify({ candidateId, voterToken, nonce, timestamp });
  return sha256(payload);
}

function hashVoterSecret(voterId, dateOfBirth) {
  return sha256(`${voterId}:${dateOfBirth}`);
}

function generateNonce() {
  return crypto.randomBytes(16).toString('hex');
}

function generateConfirmationCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const segment = () =>
    Array.from({ length: 4 }, () => chars[crypto.randomInt(0, chars.length)]).join('');
  return `${segment()}-${segment()}-${segment()}`;
}

function generateTransactionHash() {
  return '0x' + crypto.randomBytes(32).toString('hex');
}

module.exports = {
  sha256,
  hashVotePayload,
  hashVoterSecret,
  generateNonce,
  generateConfirmationCode,
  generateTransactionHash
};
