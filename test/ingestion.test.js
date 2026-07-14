import test from 'node:test';
import assert from 'node:assert/strict';

import {
  hasValidBearerToken,
  IngestionValidationError,
  parseIngestionBody,
  parseIngestionMetadata,
} from '../api/ingestion.js';

test('parses the current flat ingestion payload without treating zero as missing', () => {
  assert.deepEqual(parseIngestionBody({
    power: 0,
    importKwh: '1240.52',
    exportKwh: 0,
  }), {
    power: 0,
    importKwh: 1240.52,
    exportKwh: 0,
  });
});

test('parses the nested OBIS payload used by the existing endpoint', () => {
  assert.deepEqual(parseIngestionBody({
    '1-0:16.7.0*255': { values: [{ value: 742 }] },
    '1-0:1.8.0*255': { values: [{ value: 1240.52 }] },
    '1-0:2.8.0*255': { values: [{ value: 4.13 }] },
  }), {
    power: 742,
    importKwh: 1240.52,
    exportKwh: 4.13,
  });
});

test('parses a JSON string supplied through raw_data', () => {
  const rawData = JSON.stringify({
    power: 91,
    importKwh: 10,
    exportKwh: 2,
  });

  assert.equal(parseIngestionBody({ raw_data: rawData }).power, 91);
});

test('rejects missing fields, invalid values, and negative energy totals', () => {
  const invalidBodies = [
    {},
    { power: 1, importKwh: 2 },
    { power: 'not-a-number', importKwh: 2, exportKwh: 0 },
    { power: 1, importKwh: -2, exportKwh: 0 },
    { raw_data: '{invalid json' },
  ];

  for (const body of invalidBodies) {
    assert.throws(() => parseIngestionBody(body), IngestionValidationError);
  }
});

test('requires an exact Bearer token', () => {
  assert.equal(hasValidBearerToken({ authorization: 'Bearer secret' }, 'secret'), true);
  assert.equal(hasValidBearerToken({ authorization: 'Bearer wrong' }, 'secret'), false);
  assert.equal(hasValidBearerToken({}, 'secret'), false);
  assert.equal(hasValidBearerToken({ authorization: 'Bearer secret' }, ''), false);
});

test('validates ingestion meter and source metadata', () => {
  assert.deepEqual(parseIngestionMetadata({
    meterId: 'dtz541-lab:1',
    source: 'simulator',
  }), {
    meterId: 'dtz541-lab:1',
    source: 'simulator',
  });

  assert.throws(
    () => parseIngestionMetadata({ meterId: 'meter with spaces' }),
    IngestionValidationError,
  );
  assert.throws(
    () => parseIngestionMetadata({ source: 'unknown-source' }),
    IngestionValidationError,
  );
});
