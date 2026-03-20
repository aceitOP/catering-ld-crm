const { URL } = require('url');

const API_BASE = process.env.SYSTEM_TEST_API_URL || 'http://localhost:4000';
const FRONTEND_BASE = process.env.SYSTEM_TEST_FRONTEND_URL;
const INCLUDE_FRONTEND =
  process.env.SYSTEM_TEST_INCLUDE_FRONTEND === 'true' ||
  Boolean(FRONTEND_BASE);

const tests = [
  {
    name: 'Backend health check',
    url: new URL('/api/health', API_BASE).toString(),
    method: 'GET',
    validate: async (res) => {
      if (res.status !== 200) {
        throw new Error(`expected 200, got ${res.status}`);
      }
      const payload = await res.json();
      if (payload.status !== 'ok') {
        throw new Error(`unexpected status payload: ${payload.status}`);
      }
    },
  },
];

if (INCLUDE_FRONTEND) {
  tests.push({
    name: 'Frontend root response',
    url: new URL('/', FRONTEND_BASE).toString(),
    method: 'GET',
    validate: async (res) => {
      if (res.status < 200 || res.status >= 400) {
        throw new Error(`frontend returned ${res.status}`);
      }
      if (!res.headers.get('content-type')?.includes('html')) {
        throw new Error('frontend root did not return HTML');
      }
    },
  });
}

const run = async () => {
  console.log('Running system-level smoke tests');

  const failures = [];

  for (const test of tests) {
    process.stdout.write(`• ${test.name} ... `);
    try {
      const response = await fetch(test.url, { method: test.method });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      if (test.validate) {
        await test.validate(response);
      }
      console.log('ok');
    } catch (err) {
      failures.push({ test, error: err });
      console.log('failed');
      console.error(`  ${err.message}`);
    }
  }

  if (failures.length) {
    console.error('\nSystem test summary: failures detected');
    failures.forEach((f) => console.error(`- ${f.test.name}: ${f.error.message}`));
    process.exit(1);
  }

  console.log('\nSystem tests passed');
  process.exit(0);
};

run().catch((err) => {
  console.error('Unexpected error during system test:', err);
  process.exit(1);
});
