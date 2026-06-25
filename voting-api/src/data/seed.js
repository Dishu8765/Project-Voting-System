const { getDb } = require('../db');
const { hashVoterSecret } = require('../utils/crypto');
const logger = require('../utils/logger');

const CANDIDATES = [
  { id: 'c1', name: 'Eleanor Whitfield', party: 'Independent', office: 'Mayor' },
  { id: 'c2', name: 'Marcus Chen', party: 'Community Alliance', office: 'Mayor' },
  { id: 'c3', name: 'Sofia Ramirez', party: 'Forward Together', office: 'Mayor' }
];

const VOTERS = [
  { voterId: 'VOTER001', fullName: 'Jane Smith', dateOfBirth: '1975-03-15' },
  { voterId: 'VOTER002', fullName: 'Robert Johnson', dateOfBirth: '1982-07-22' },
  { voterId: 'VOTER003', fullName: 'Maria Garcia', dateOfBirth: '1990-11-08' },
  { voterId: 'VOTER004', fullName: 'James Wilson', dateOfBirth: '1968-01-30' },
  { voterId: 'VOTER005', fullName: 'Patricia Brown', dateOfBirth: '1955-09-12' }
];

function seed() {
  const db = getDb();

  const insertCandidate = db.prepare(`
    INSERT OR IGNORE INTO candidates (id, name, party, office, active)
    VALUES (@id, @name, @party, @office, 1)
  `);

  const insertVoter = db.prepare(`
    INSERT OR IGNORE INTO voters (voter_id, full_name, dob_hash, has_voted)
    VALUES (@voterId, @fullName, @dobHash, 0)
  `);

  const seedAll = db.transaction(() => {
    CANDIDATES.forEach((c) => insertCandidate.run(c));

    VOTERS.forEach((v) => {
      insertVoter.run({
        voterId: v.voterId,
        fullName: v.fullName,
        dobHash: hashVoterSecret(v.voterId, v.dateOfBirth)
      });
    });
  });

  seedAll();
  logger.info('Database seeded', {
    candidates: CANDIDATES.length,
    voters: VOTERS.length
  });

  console.log('Seed complete.');
  console.log('Test voters (use any for login):');
  VOTERS.forEach((v) => {
    console.log(`  ${v.voterId} | ${v.fullName} | ${v.dateOfBirth}`);
  });
}

if (require.main === module) {
  seed();
}

module.exports = { seed, CANDIDATES, VOTERS };
