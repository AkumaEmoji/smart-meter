import { readFileSync } from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

import meterObis from '../meter-obis.cjs';

const { canonicalObisCode, extractMeterReading, serializeObisResult } = meterObis;

const realCompleteCapture = JSON.parse(readFileSync(
  new URL('./fixtures/dtz541-complete-info-capture.json', import.meta.url),
  'utf8',
));

function createEntry(code, value, unit) {
  return {
    idToString: () => code,
    getValues: () => [{ value, unit }],
  };
}

test('maps the complete INFO dataset and preserves genuine zeroes', () => {
  const result = extractMeterReading({
    power: createEntry('1-0:16.7.0*255', 0, 'W'),
    import: createEntry('1-0:1.8.0*255', 0.204, 'kWh'),
    export: createEntry('1-0:2.8.0*255', 0, 'kWh'),
    identity: createEntry('1-0:96.1.0*255', 'meter-identity', null),
  });

  assert.equal(result.reading.power, 0);
  assert.equal(result.reading.importKwh, 0.204);
  assert.equal(result.reading.exportKwh, 0);
  assert.equal(result.meterDataset, 'complete');
  assert.deepEqual(result.reading.phasePowerW, { l1: null, l2: null, l3: null });
  assert.equal(result.reading.rawObis['1-0:16.7.0*255'].value, 0);
  assert.equal(result.reading.rawObis['1-0:96.1.0*255'], undefined);
});

test('replays the sanitized real DTZ541 complete INFO capture', () => {
  const result = extractMeterReading(realCompleteCapture.obis);

  assert.equal(result.meterDataset, realCompleteCapture.expectedDataset);
  assert.equal(result.reading.power, 29);
  assert.equal(result.reading.importKwh, 0.2204);
  assert.equal(result.reading.exportKwh, 0);
  assert.deepEqual(result.reading.phasePowerW, { l1: null, l2: null, l3: null });
  assert.equal(result.reading.rawObis['1-0:96.1.0*255'], undefined);
  assert.deepEqual(result.warnings, []);
});

test('maps configured manufacturer-specific phase, electrical, and frequency fields', () => {
  const result = extractMeterReading({
    power: createEntry('1-0:16.7.0*255', 742, 'W'),
    import: createEntry('1-0:1.8.0*255', 1240.52, 'kWh'),
    export: createEntry('1-0:2.8.0*255', 4.13, 'kWh'),
    l1Power: createEntry('1-0:36.7.0*255', 210, 'W'),
    l2Power: createEntry('1-0:56.7.0*255', 388, 'W'),
    l3Power: createEntry('1-0:76.7.0*255', 144, 'W'),
    l1Voltage: createEntry('1-0:32.7.0*255', 230.1, 'V'),
    l2Voltage: createEntry('1-0:52.7.0*255', 229.8, 'V'),
    l3Voltage: createEntry('1-0:72.7.0*255', 231, 'V'),
    l1Current: createEntry('1-0:31.7.0*255', 0.91, 'A'),
    l2Current: createEntry('1-0:51.7.0*255', 1.69, 'A'),
    l3Current: createEntry('1-0:71.7.0*255', 0.62, 'A'),
    frequency: createEntry('1-0:14.7.0*255', 50.01, 'Hz'),
  });

  assert.equal(result.meterDataset, 'manufacturer-specific');
  assert.deepEqual(result.reading.phasePowerW, { l1: 210, l2: 388, l3: 144 });
  assert.deepEqual(result.reading.voltageV, { l1: 230.1, l2: 229.8, l3: 231 });
  assert.deepEqual(result.reading.currentA, { l1: 0.91, l2: 1.69, l3: 0.62 });
  assert.equal(result.reading.frequencyHz, 50.01);
  assert.deepEqual(result.warnings, []);
});

test('rejects mismatched units and invalid cumulative totals instead of fabricating values', () => {
  const result = extractMeterReading({
    power: createEntry('1-0:16.7.0*0', 29, 'kW'),
    import: createEntry('1-0:1.8.0*0', -1, 'kWh'),
    export: createEntry('1-0:2.8.0*0', 0, 'kWh'),
  });

  assert.equal(canonicalObisCode('1-0:16.7.0*0'), '1-0:16.7.0');
  assert.equal(result.reading.power, null);
  assert.equal(result.reading.importKwh, null);
  assert.equal(result.reading.exportKwh, 0);
  assert.equal(result.meterDataset, 'reduced');
  assert.equal(result.warnings.length, 2);
});

test('serializes every observed entry for local capture without changing its value', () => {
  const serialized = serializeObisResult({
    one: createEntry('1-0:16.7.0*255', -21, 'W'),
    two: createEntry('1-0:96.1.0*255', 'ABC123', null),
  });

  assert.deepEqual(serialized['1-0:16.7.0*255'], [{ value: -21, unit: 'W' }]);
  assert.deepEqual(serialized['1-0:96.1.0*255'], [{ value: 'ABC123', unit: null }]);
});
