-- ============================================================
-- voting-db/seed.sql
-- Sample data for development and testing
-- Safe to re-run: uses ON CONFLICT DO NOTHING
-- ============================================================

-- ============================================================
-- CONSTITUENCIES (3 records)
-- ============================================================

INSERT INTO constituencies (id, name, description) VALUES
  ('a1000000-0000-0000-0000-000000000001', 'North District',
   'Northern urban constituency covering the city centre'),
  ('a1000000-0000-0000-0000-000000000002', 'South District',
   'Southern suburban constituency including residential zones'),
  ('a1000000-0000-0000-0000-000000000003', 'East District',
   'Eastern rural constituency with mixed agricultural and light industry')
ON CONFLICT DO NOTHING;

-- ============================================================
-- ELECTIONS (1 active election)
-- ============================================================

INSERT INTO elections (id, name, description, start_date, end_date, status, constituency_id) VALUES
  (
    'b2000000-0000-0000-0000-000000000001',
    '2025 North District Mayoral Election',
    'Annual mayoral election for the North District constituency',
    '2025-01-01 08:00:00+00',
    '2025-12-31 20:00:00+00',
    'ACTIVE',
    'a1000000-0000-0000-0000-000000000001'
  )
ON CONFLICT DO NOTHING;

-- ============================================================
-- VOTERS (5 records, all REGISTERED)
-- ============================================================

INSERT INTO voters (id, name, email, fingerprint_hash, status) VALUES
  ('c3000000-0000-0000-0000-000000000001', 'Jane Smith',
   'jane.smith@example.com',
   'fp_hash_a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6',
   'REGISTERED'),
  ('c3000000-0000-0000-0000-000000000002', 'Robert Johnson',
   'robert.johnson@example.com',
   'fp_hash_b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1',
   'REGISTERED'),
  ('c3000000-0000-0000-0000-000000000003', 'Maria Garcia',
   'maria.garcia@example.com',
   'fp_hash_c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2',
   'REGISTERED'),
  ('c3000000-0000-0000-0000-000000000004', 'James Wilson',
   'james.wilson@example.com',
   'fp_hash_d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3',
   'REGISTERED'),
  ('c3000000-0000-0000-0000-000000000005', 'Patricia Brown',
   'patricia.brown@example.com',
   'fp_hash_e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4',
   'REGISTERED')
ON CONFLICT DO NOTHING;

-- ============================================================
-- CANDIDATES (3 records for the active election)
-- ============================================================

INSERT INTO candidates (id, name, party, position, election_id, active) VALUES
  ('d4000000-0000-0000-0000-000000000001', 'Eleanor Whitfield', 'Independent',
   'Mayor', 'b2000000-0000-0000-0000-000000000001', TRUE),
  ('d4000000-0000-0000-0000-000000000002', 'Marcus Chen', 'Community Alliance',
   'Mayor', 'b2000000-0000-0000-0000-000000000001', TRUE),
  ('d4000000-0000-0000-0000-000000000003', 'Sofia Ramirez', 'Forward Together',
   'Mayor', 'b2000000-0000-0000-0000-000000000001', TRUE)
ON CONFLICT DO NOTHING;

-- ============================================================
-- AUDIT LOG (sample entries)
-- ============================================================

INSERT INTO audit_log (id, action, actor_id, ip_address, details, success) VALUES
  (
    'e5000000-0000-0000-0000-000000000001',
    'LOGIN_ATTEMPT',
    'c3000000-0000-0000-0000-000000000001',
    '203.0.113.42',
    '{"voter_id": "c3000000-0000-0000-0000-000000000001", "method": "fingerprint"}'::jsonb,
    TRUE
  ),
  (
    'e5000000-0000-0000-0000-000000000002',
    'VOTE_SUBMITTED',
    'c3000000-0000-0000-0000-000000000001',
    '203.0.113.42',
    '{"election_id": "b2000000-0000-0000-0000-000000000001", "nullifier_hash_prefix": "0xabc123"}'::jsonb,
    TRUE
  ),
  (
    'e5000000-0000-0000-0000-000000000003',
    'BLOCKCHAIN_COMMIT',
    'c3000000-0000-0000-0000-000000000001',
    '203.0.113.42',
    '{"tx_hash": "0xdeadbeef000000000000000000000000000000000000000000000000deadbeef", "block_number": 4200001}'::jsonb,
    TRUE
  ),
  (
    'e5000000-0000-0000-0000-000000000004',
    'LOGIN_ATTEMPT',
    NULL,
    '198.51.100.77',
    '{"reason": "unknown_voter_id", "attempted_id": "VOTER999"}'::jsonb,
    FALSE
  )
ON CONFLICT DO NOTHING;
