const { getDb } = require('../db');

function getTally() {
  const db = getDb();

  const totalVotes = db.prepare(`SELECT COUNT(*) AS count FROM votes`).get().count;

  const byCandidate = db
    .prepare(
      `SELECT c.id, c.name, c.party, c.office, COUNT(v.id) AS vote_count
       FROM candidates c
       LEFT JOIN votes v ON v.candidate_id = c.id
       WHERE c.active = 1
       GROUP BY c.id
       ORDER BY vote_count DESC, c.name ASC`
    )
    .all();

  const registeredVoters = db.prepare(`SELECT COUNT(*) AS count FROM voters`).get().count;
  const votedCount = db.prepare(`SELECT COUNT(*) AS count FROM voters WHERE has_voted = 1`).get().count;

  return {
    electionStatus: 'open',
    totalVotesCast: totalVotes,
    registeredVoters,
    turnoutPercent: registeredVoters > 0 ? Math.round((votedCount / registeredVoters) * 100) : 0,
    results: byCandidate.map((row) => ({
      candidateId: row.id,
      name: row.name,
      party: row.party,
      office: row.office,
      votes: row.vote_count
    })),
    lastUpdated: new Date().toISOString()
  };
}

module.exports = { getTally };
