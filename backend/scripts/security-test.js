const { URL } = require('url');

const API_BASE = process.env.SECURITY_TEST_API_URL || 'http://localhost:4000';
const EMAIL = process.env.SECURITY_TEST_EMAIL || 'pomykal@aceit.cz';
const PASSWORD = process.env.SECURITY_TEST_PASSWORD || 'Demo1234!';
const EXPECT_ROLE = process.env.SECURITY_TEST_EXPECT_ROLE || '';

const buildUrl = (path) => new URL(path, API_BASE).toString();
const normalizedEmail = EMAIL.toLowerCase();

const logStep = async (description, fn) => {
  process.stdout.write(`• ${description} ... `);
  await fn();
  console.log('ok');
};

const ensureStatus = (res, expected, label) => {
  if (res.status !== expected) {
    throw new Error(`${label} expected status ${expected} but got ${res.status}`);
  }
};

const run = async () => {
  console.log('Running security smoke tests (auth guard + admin API)');
  let token;

  await logStep('Protect /api/auth/me without token', async () => {
    const res = await fetch(buildUrl('/api/auth/me'));
    if (res.status < 400 || res.status >= 500) {
      throw new Error(`unexpected status ${res.status}`);
    }
  });

  await logStep('Login with valid credentials', async () => {
    const res = await fetch(buildUrl('/api/auth/login'), {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json',
      },
      body: JSON.stringify({ email: EMAIL, heslo: PASSWORD }),
    });
    ensureStatus(res, 200, 'Login');
    const payload = await res.json();
    if (!payload.token) throw new Error('token missing in login response');
    if (!payload.uzivatel || payload.uzivatel.email.toLowerCase() !== normalizedEmail) {
      throw new Error('unexpected user returned from login');
    }
    if (EXPECT_ROLE && payload.uzivatel.role !== EXPECT_ROLE) {
      throw new Error(`expected role ${EXPECT_ROLE} but got ${payload.uzivatel.role}`);
    }
    token = payload.token;
  });

  await logStep('Access /api/auth/me with token', async () => {
    const res = await fetch(buildUrl('/api/auth/me'), {
      headers: { Authorization: `Bearer ${token}`, accept: 'application/json' },
    });
    ensureStatus(res, 200, '/api/auth/me');
    const body = await res.json();
    if (body.email?.toLowerCase() !== normalizedEmail) {
      throw new Error('response identity does not match test email');
    }
    if (EXPECT_ROLE && body.role !== EXPECT_ROLE) {
      throw new Error(`/api/auth/me expected role ${EXPECT_ROLE} but got ${body.role}`);
    }
  });

  await logStep('Admin-only /api/uzivatele responds', async () => {
    const res = await fetch(buildUrl('/api/uzivatele'), {
      headers: { Authorization: `Bearer ${token}`, accept: 'application/json' },
    });
    ensureStatus(res, 200, '/api/uzivatele');
    const body = await res.json();
    if (!Array.isArray(body.data)) {
      throw new Error('expected data array');
    }
  });

  console.log('\nSecurity tests passed');
};

run().catch((err) => {
  console.error('\nSecurity tests failed:', err.message);
  process.exit(1);
});
