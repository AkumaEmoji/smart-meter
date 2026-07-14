import { timingSafeEqual } from 'node:crypto';

const POWER_OBIS = '1-0:16.7.0*255';
const IMPORT_OBIS = '1-0:1.8.0*255';
const EXPORT_OBIS = '1-0:2.8.0*255';
const INGEST_SOURCES = new Set(['api', 'meter', 'simulator', 'manual']);

const hasOwn = (object, key) => Object.prototype.hasOwnProperty.call(object, key);

export class IngestionValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'IngestionValidationError';
  }
}

function readObisValue(source, code) {
  const entry = source?.[code];

  if (entry && typeof entry === 'object') {
    return entry.values?.[0]?.value ?? entry.value;
  }

  return entry;
}

function toFiniteNumber(value, fieldName) {
  if (typeof value === 'string' && value.trim() === '') {
    throw new IngestionValidationError(`${fieldName} must not be empty`);
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new IngestionValidationError(`${fieldName} must be a finite number`);
  }

  return parsed;
}

function parseKnownShape(source) {
  const hasObisShape = [POWER_OBIS, IMPORT_OBIS, EXPORT_OBIS]
    .some((code) => hasOwn(source, code));
  const hasParsedShape = ['power', 'importKwh', 'exportKwh']
    .some((field) => hasOwn(source, field));

  if (!hasObisShape && !hasParsedShape) {
    throw new IngestionValidationError('Unsupported reading payload shape');
  }

  const values = hasObisShape
    ? {
        power: readObisValue(source, POWER_OBIS),
        importKwh: readObisValue(source, IMPORT_OBIS),
        exportKwh: readObisValue(source, EXPORT_OBIS),
      }
    : {
        power: source.power,
        importKwh: source.importKwh,
        exportKwh: source.exportKwh,
      };

  const reading = {
    power: toFiniteNumber(values.power, 'power'),
    importKwh: toFiniteNumber(values.importKwh, 'importKwh'),
    exportKwh: toFiniteNumber(values.exportKwh, 'exportKwh'),
  };

  if (reading.importKwh < 0 || reading.exportKwh < 0) {
    throw new IngestionValidationError('Energy totals must not be negative');
  }

  return reading;
}

export function parseIngestionBody(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new IngestionValidationError('Request body must be a JSON object');
  }

  if (!hasOwn(body, 'raw_data')) {
    return parseKnownShape(body);
  }

  let rawData = body.raw_data;
  if (typeof rawData === 'string') {
    try {
      rawData = JSON.parse(rawData);
    } catch {
      throw new IngestionValidationError('raw_data must contain valid JSON');
    }
  }

  if (!rawData || typeof rawData !== 'object' || Array.isArray(rawData)) {
    throw new IngestionValidationError('raw_data must be a JSON object');
  }

  return parseKnownShape(rawData);
}

export function parseIngestionMetadata(body, defaults = {}) {
  const defaultMeterId = defaults.meterId || 'dtz541-demo';
  const defaultSource = defaults.source || 'api';
  const meterId = body?.meterId ?? defaultMeterId;
  const source = body?.source ?? defaultSource;

  if (
    typeof meterId !== 'string'
    || !/^[A-Za-z0-9._:-]{1,64}$/.test(meterId.trim())
  ) {
    throw new IngestionValidationError(
      'meterId must be 1-64 letters, numbers, dots, underscores, colons, or hyphens',
    );
  }

  if (typeof source !== 'string' || !INGEST_SOURCES.has(source.trim())) {
    throw new IngestionValidationError(
      `source must be one of: ${[...INGEST_SOURCES].join(', ')}`,
    );
  }

  return {
    meterId: meterId.trim(),
    source: source.trim(),
  };
}

export function hasValidBearerToken(headers, expectedToken) {
  if (typeof expectedToken !== 'string' || expectedToken.length === 0) {
    return false;
  }

  const authorization = headers?.authorization ?? headers?.Authorization;
  if (typeof authorization !== 'string' || !authorization.startsWith('Bearer ')) {
    return false;
  }

  const suppliedToken = authorization.slice('Bearer '.length).trim();
  const supplied = Buffer.from(suppliedToken);
  const expected = Buffer.from(expectedToken);

  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}
