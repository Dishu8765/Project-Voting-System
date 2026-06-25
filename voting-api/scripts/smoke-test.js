const http = require('http');

const BASE = process.env.API_URL || 'http://localhost:3000';

function request(path, options = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE);
    const payload = options.body ? JSON.stringify(options.body) : null;
    const req = http.request(
      {
        hostname: url.hostname,
        port: url.port,
        path: url.pathname + url.search,
        method: options.method || 'GET',
        headers: {
          'Content-Type': 'application/json',
          ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
          ...options.headers
        }
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode, json: JSON.parse(data) });
          } catch {
            resolve({ status: res.statusCode, json: data });
          }
        });
      }
    );
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function run() {
  const health = await request('/health');
  console.log('Health:', health.status, health.json.status);

  const login = await request('/api/auth/login', {
    method: 'POST',
    body: {
      voterId: 'VOTER003',
      fullName: 'Maria Garcia',
      dateOfBirth: '1990-11-08'
    }
  });
  console.log('Login:', login.status, login.json.message);

  const vote = await request('/api/votes', {
    method: 'POST',
    headers: { Authorization: `Bearer ${login.json.data.token}` },
    body: { candidateId: 'c2' }
  });
  console.log('Vote:', vote.status, vote.json.message);
  if (!vote.json.success) console.log('Vote error:', JSON.stringify(vote.json));

  const tally = await request('/api/tally');
  console.log('Tally total:', tally.json.data?.totalVotesCast);

  if (vote.json.data?.confirmationCode) {
    const verify = await request(`/api/audit/verify/code/${vote.json.data.confirmationCode}`);
    console.log('Verify:', verify.status, verify.json.data?.message);
  }

  const audit = await request('/api/audit/summary');
  console.log('Audit in sync:', audit.json.data?.ledgerInSync);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
