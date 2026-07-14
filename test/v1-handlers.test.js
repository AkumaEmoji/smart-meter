import { readFileSync } from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createCapabilitiesHandler,
  createHistoryHandler,
  createLatestHandler,
} from '../api/v1-handlers.js';

const capturedFixture = JSON.parse(readFileSync(
  new URL('./fixtures/deployed-legacy-reading.json', import.meta.url),
  'utf8',
));

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

test('latest endpoint returns the normalized captured legacy shape without caching', async () => {
  const handler = createLatestHandler({
    fetchLatestReading: async () => capturedFixture.reading,
    meterId: 'test-meter',
  });
  const response = createResponse();

  await handler({ method: 'GET' }, response);

  assert.equal(response.state.status, 200);
  assert.equal(response.state.headers['Cache-Control'], 'no-store, max-age=0');
  assert.equal(response.state.body.sampleId, 'redacted-firestore-document-id');
  assert.equal(response.state.body.timestamp, '2026-06-04T16:41:28.047Z');
  assert.equal(response.state.body.powerW, 0);
});

test('latest endpoint distinguishes an empty database', async () => {
  const handler = createLatestHandler({
    fetchLatestReading: async () => null,
    meterId: 'test-meter',
  });
  const response = createResponse();

  await handler({ method: 'GET' }, response);

  assert.equal(response.state.status, 404);
  assert.deepEqual(response.state.body, { error: 'No meter readings found' });
});

test('history endpoint validates its query and returns a bounded ordered envelope', async () => {
  let receivedOptions;
  const documents = [
    {
      id: 'older',
      power: 100,
      importKwh: 12,
      exportKwh: 1,
      timestamp: '2026-07-14T10:00:00.000Z',
    },
    {
      id: 'newer',
      power: 125,
      importKwh: 12.25,
      exportKwh: 1.05,
      timestamp: '2026-07-14T10:10:00.000Z',
    },
  ];
  const handler = createHistoryHandler({
    fetchReadingHistory: async (options) => {
      receivedOptions = options;
      return documents;
    },
    meterId: 'test-meter',
  });
  const response = createResponse();

  await handler({
    method: 'GET',
    query: { limit: '2', order: 'asc' },
  }, response);

  assert.equal(response.state.status, 200);
  assert.equal(receivedOptions.limit, 2);
  assert.equal(receivedOptions.order, 'asc');
  assert.equal(response.state.body.count, 2);
  assert.equal(response.state.body.readings[0].sampleId, 'older');
  assert.equal(response.state.body.summary.energyImportDeltaKwh, 0.25);
  assert.equal(response.state.body.summary.energyExportDeltaKwh, 0.05);
});

test('history endpoint rejects bad query parameters before querying Firestore', async () => {
  let fetchCalled = false;
  const handler = createHistoryHandler({
    fetchReadingHistory: async () => {
      fetchCalled = true;
      return [];
    },
    meterId: 'test-meter',
  });
  const response = createResponse();

  await handler({ method: 'GET', query: { limit: '5000' } }, response);

  assert.equal(response.state.status, 400);
  assert.equal(fetchCalled, false);
});

test('capabilities endpoint exposes field availability from its latest reading', async () => {
  const handler = createCapabilitiesHandler({
    meterId: 'test-meter',
    fetchLatestReading: async () => ({
      id: 'latest-capability-sample',
      power: 29,
      importKwh: 0.204,
      exportKwh: 0,
      source: 'meter',
      meterDataset: 'complete',
      rawObis: { '1-0:16.7.0*255': { value: 29, unit: 'W' } },
      timestamp: '2026-07-15T10:00:00.000Z',
    }),
  });
  const response = createResponse();

  await handler({ method: 'GET' }, response);

  assert.equal(response.state.status, 200);
  assert.equal(response.state.headers['Cache-Control'], 'no-store, max-age=0');
  assert.equal(response.state.body.meterId, 'test-meter');
  assert.equal(response.state.body.fields.powerW.available, true);
  assert.equal(response.state.body.fields.phasePowerW.available, false);
  assert.equal(response.state.body.fields.rawObis.available, true);
  assert.equal(response.state.body.observation.meterDataset, 'complete');
  assert.equal(response.state.body.connection.websocket, false);
});
