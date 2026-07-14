import test from 'node:test';
import assert from 'node:assert/strict';

import {
  ApiValidationError,
  calculateHistorySummary,
  createCapabilities,
  normalizeStoredReading,
  parseHistoryQuery,
  toIsoTimestamp,
} from '../api/readings.js';

test('normalizes Firestore timestamps and preserves real zero values', () => {
  const reading = normalizeStoredReading({
    id: 'sample-1',
    power: 0,
    importKwh: 0.1993,
    exportKwh: 0,
    timestamp: { _seconds: 1780591288, _nanoseconds: 47000000 },
  }, {
    meterId: 'test-meter',
    nowMs: Date.parse('2026-06-04T16:42:00.000Z'),
  });

  assert.equal(toIsoTimestamp({ _seconds: 1780591288, _nanoseconds: 47000000 }), '2026-06-04T16:41:28.047Z');
  assert.equal(reading.schemaVersion, 1);
  assert.equal(reading.sampleId, 'sample-1');
  assert.equal(reading.meterId, 'test-meter');
  assert.equal(reading.powerW, 0);
  assert.equal(reading.energyImportTotalKwh, 0.1993);
  assert.equal(reading.energyExportTotalKwh, 0);
  assert.deepEqual(reading.phasePowerW, { l1: null, l2: null, l3: null });
  assert.equal(reading.quality.status, 'ok');
  assert.equal(reading.quality.source, 'legacy');
  assert.equal(reading.quality.meterDataset, 'unknown');
  assert.equal(reading.freshness.state, 'stale');
});

test('maps absent and invalid optional measurements to null, never fabricated zeroes', () => {
  const reading = normalizeStoredReading({
    id: 'partial',
    power: 'bad-value',
    importKwh: 1,
    timestamp: '2026-07-14T10:00:00.000Z',
  }, { meterId: 'test-meter' });

  assert.equal(reading.powerW, null);
  assert.equal(reading.energyExportTotalKwh, null);
  assert.equal(reading.frequencyHz, null);
  assert.equal(reading.rawObis, null);
  assert.equal(reading.quality.status, 'partial');
});

test('validates history range, limit, and order', () => {
  assert.deepEqual(parseHistoryQuery({
    from: '2026-07-01T00:00:00Z',
    to: '2026-07-14T00:00:00Z',
    limit: '25',
    order: 'asc',
  }), {
    from: new Date('2026-07-01T00:00:00Z'),
    to: new Date('2026-07-14T00:00:00Z'),
    limit: 25,
    order: 'asc',
  });

  const invalidQueries = [
    { from: 'not-a-date' },
    { from: '2026-07-14' },
    { from: '2026-07-15T00:00:00Z', to: '2026-07-14T00:00:00Z' },
    { limit: '0' },
    { limit: '1.5' },
    { limit: '1001' },
    { order: 'sideways' },
  ];

  for (const query of invalidQueries) {
    assert.throws(() => parseHistoryQuery(query), ApiValidationError);
  }
});

test('calculates historical energy from cumulative-register deltas', () => {
  const summary = calculateHistorySummary([
    {
      timestamp: '2026-07-14T10:20:00.000Z',
      energyImportTotalKwh: 100.5,
      energyExportTotalKwh: 5.1,
    },
    {
      timestamp: '2026-07-14T10:00:00.000Z',
      energyImportTotalKwh: 100,
      energyExportTotalKwh: 5,
    },
    {
      timestamp: '2026-07-14T10:10:00.000Z',
      energyImportTotalKwh: 100.2,
      energyExportTotalKwh: 5,
    },
  ]);

  assert.equal(summary.energyImportDeltaKwh, 0.5);
  assert.equal(summary.energyExportDeltaKwh, 0.1);
  assert.equal(summary.periodStart, '2026-07-14T10:00:00.000Z');
  assert.equal(summary.periodEnd, '2026-07-14T10:20:00.000Z');
  assert.equal(summary.isComplete, true);
});

test('flags register resets instead of returning a negative consumption value', () => {
  const summary = calculateHistorySummary([
    {
      timestamp: '2026-07-14T10:00:00.000Z',
      energyImportTotalKwh: 100,
      energyExportTotalKwh: 5,
    },
    {
      timestamp: '2026-07-14T10:10:00.000Z',
      energyImportTotalKwh: 1,
      energyExportTotalKwh: 0,
    },
  ]);

  assert.equal(summary.energyImportDeltaKwh, null);
  assert.equal(summary.energyExportDeltaKwh, null);
  assert.equal(summary.importResetCount, 1);
  assert.equal(summary.exportResetCount, 1);
  assert.equal(summary.isComplete, false);
});

test('capabilities only advertise fields currently exposed by the pipeline', () => {
  const capabilities = createCapabilities('test-meter');

  assert.equal(capabilities.fields.powerW.available, true);
  assert.equal(capabilities.fields.phasePowerW.available, false);
  assert.equal(capabilities.fields.rawObis.available, false);
  assert.equal(capabilities.connection.websocket, false);
  assert.equal(capabilities.history.energyCalculation, 'cumulative-register-delta');
});

test('capabilities reflect optional fields observed in the latest real reading', () => {
  const latestReading = normalizeStoredReading({
    id: 'rich-sample',
    meterId: 'test-meter',
    source: 'meter',
    meterDataset: 'manufacturer-specific',
    power: 742,
    importKwh: 1240.52,
    exportKwh: 4.13,
    phasePowerW: { l1: 210, l2: 388, l3: 144 },
    voltageV: { l1: 230.1, l2: 229.8, l3: 231 },
    currentA: { l1: 0.91, l2: 1.69, l3: 0.62 },
    frequencyHz: 50.01,
    rawObis: { '1-0:16.7.0*255': { value: 742, unit: 'W' } },
    timestamp: '2026-07-15T10:00:00.000Z',
  });
  const capabilities = createCapabilities('test-meter', latestReading);

  assert.equal(capabilities.observation.source, 'latest-reading');
  assert.equal(capabilities.observation.meterDataset, 'manufacturer-specific');
  assert.equal(capabilities.fields.phasePowerW.available, true);
  assert.deepEqual(capabilities.fields.phasePowerW.phases, {
    l1: true,
    l2: true,
    l3: true,
  });
  assert.equal(capabilities.fields.frequencyHz.available, true);
  assert.equal(capabilities.fields.rawObis.available, true);
});
