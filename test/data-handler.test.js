import { generateKeyPairSync } from 'node:crypto';
import test from 'node:test';
import assert from 'node:assert/strict';

const { privateKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  publicKeyEncoding: { type: 'spki', format: 'pem' },
});

process.env.FIREBASE_PROJECT_ID = 'meterlens-test';
process.env.FIREBASE_CLIENT_EMAIL = 'meterlens-test@example.invalid';
process.env.FIREBASE_PRIVATE_KEY = privateKey;
process.env.SMART_METER_INGEST_TOKEN = 'test-ingestion-token';

const { default: handler } = await import('../api/data.js');
const { db } = await import('../api/firebase.js');

function createResponse() {
  const state = { status: null, body: null, headers: {} };

  return {
    state,
    status(statusCode) {
      state.status = statusCode;
      return this;
    },
    json(body) {
      state.body = body;
      return this;
    },
    setHeader(name, value) {
      state.headers[name] = value;
    },
  };
}

test('POST rejects a missing ingestion token before touching Firestore', async () => {
  const response = createResponse();
  await handler({ method: 'POST', headers: {}, body: {} }, response);

  assert.equal(response.state.status, 401);
  assert.deepEqual(response.state.body, { error: 'Unauthorized' });
});

test('POST rejects an invalid reading before touching Firestore', async () => {
  const response = createResponse();
  await handler({
    method: 'POST',
    headers: { authorization: 'Bearer test-ingestion-token' },
    body: { power: 100 },
  }, response);

  assert.equal(response.state.status, 400);
  assert.match(response.state.body.error, /finite number/);
});

test('unsupported methods return 405 and an Allow header', async () => {
  const response = createResponse();
  await handler({ method: 'DELETE', headers: {} }, response);

  assert.equal(response.state.status, 405);
  assert.equal(response.state.headers.Allow, 'GET, POST');
});

test('legacy GET reads at most twenty documents and reuses its cache', async (t) => {
  let limit;
  let fetches = 0;
  const query = {
    orderBy: () => query,
    limit: (value) => { limit = value; return query; },
    get: async () => {
      fetches++;
      return { docs: Array.from({ length: limit }, (_, i) => ({
        id: String(i), data: () => ({ power: i }),
      })) };
    },
  };
  t.mock.method(db, 'collection', () => query);
  for (let i = 0; i < 2; i++) {
    const response = createResponse();
    await handler({ method: 'GET' }, response);
    assert.equal(response.state.status, 200);
    assert.equal(response.state.body.length, 20);
  }
  assert.equal(limit, 20);
  assert.equal(fetches, 1);
});
