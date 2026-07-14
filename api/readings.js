export const API_SCHEMA_VERSION = 1;
export const DEFAULT_HISTORY_LIMIT = 300;
export const MAX_HISTORY_LIMIT = 1000;
export const DEFAULT_STALE_AFTER_SECONDS = 30;
const ISO_INSTANT_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/;

export class ApiValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ApiValidationError';
  }
}

export function configuredMeterId() {
  return process.env.METER_ID?.trim() || 'dtz541-demo';
}

function finiteOrNull(value) {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function stringOrFallback(value, fallback) {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

export function toIsoTimestamp(value) {
  if (value === null || value === undefined) {
    return null;
  }

  let date;
  if (typeof value?.toDate === 'function') {
    date = value.toDate();
  } else if (value instanceof Date) {
    date = value;
  } else if (typeof value === 'object') {
    const seconds = value._seconds ?? value.seconds;
    const nanoseconds = value._nanoseconds ?? value.nanoseconds ?? 0;
    if (Number.isFinite(Number(seconds)) && Number.isFinite(Number(nanoseconds))) {
      date = new Date((Number(seconds) * 1000) + (Number(nanoseconds) / 1e6));
    }
  } else {
    date = new Date(value);
  }

  return date && !Number.isNaN(date.getTime()) ? date.toISOString() : null;
}

function normalizePhases(source) {
  return {
    l1: finiteOrNull(source?.l1),
    l2: finiteOrNull(source?.l2),
    l3: finiteOrNull(source?.l3),
  };
}

function nonEmptyObjectOrNull(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  return Object.keys(value).length > 0 ? value : null;
}

function availableFields(reading) {
  const fields = [];
  const scalarFields = [
    'powerW',
    'energyImportTotalKwh',
    'energyExportTotalKwh',
    'frequencyHz',
  ];

  for (const field of scalarFields) {
    if (reading[field] !== null) {
      fields.push(field);
    }
  }

  for (const field of ['phasePowerW', 'voltageV', 'currentA']) {
    if (Object.values(reading[field]).some((value) => value !== null)) {
      fields.push(field);
    }
  }

  if (reading.rawObis !== null) {
    fields.push('rawObis');
  }

  return fields;
}

function freshnessFor(timestamp, nowMs, staleAfterSeconds) {
  if (!timestamp) {
    return {
      state: 'unknown',
      ageSeconds: null,
      staleAfterSeconds,
    };
  }

  const timestampMs = Date.parse(timestamp);
  if (!Number.isFinite(timestampMs)) {
    return {
      state: 'unknown',
      ageSeconds: null,
      staleAfterSeconds,
    };
  }

  const ageSeconds = Math.max(0, Math.floor((nowMs - timestampMs) / 1000));
  return {
    state: ageSeconds <= staleAfterSeconds ? 'fresh' : 'stale',
    ageSeconds,
    staleAfterSeconds,
  };
}

export function normalizeStoredReading(document, options = {}) {
  const data = typeof document?.data === 'function'
    ? document.data()
    : (document?.data ?? document ?? {});
  const sampleId = document?.id ?? data.id ?? null;
  const timestamp = toIsoTimestamp(data.meterTimestamp ?? data.timestamp);
  const receivedAt = toIsoTimestamp(data.receivedAt ?? data.timestamp);
  const fallbackMeterId = options.meterId || configuredMeterId();

  const reading = {
    schemaVersion: API_SCHEMA_VERSION,
    sampleId: sampleId === null || sampleId === undefined ? null : String(sampleId),
    meterId: stringOrFallback(data.meterId, fallbackMeterId),
    timestamp,
    receivedAt,
    powerW: finiteOrNull(data.powerW ?? data.power),
    energyImportTotalKwh: finiteOrNull(
      data.energyImportTotalKwh ?? data.importKwh ?? data.total_import_kwh,
    ),
    energyExportTotalKwh: finiteOrNull(
      data.energyExportTotalKwh ?? data.exportKwh ?? data.total_export_kwh,
    ),
    phasePowerW: normalizePhases(data.phasePowerW),
    voltageV: normalizePhases(data.voltageV),
    currentA: normalizePhases(data.currentA),
    frequencyHz: finiteOrNull(data.frequencyHz),
    rawObis: nonEmptyObjectOrNull(data.rawObis),
  };

  const available = availableFields(reading);
  const requiredAvailable = [
    'powerW',
    'energyImportTotalKwh',
    'energyExportTotalKwh',
  ].filter((field) => reading[field] !== null).length;
  const source = stringOrFallback(data.source, 'legacy');

  reading.quality = {
    source,
    meterDataset: stringOrFallback(data.meterDataset, 'unknown'),
    status: !timestamp || requiredAvailable === 0
      ? 'invalid'
      : (requiredAvailable === 3 ? 'ok' : 'partial'),
    isSimulated: source === 'simulator',
    available,
  };
  reading.freshness = freshnessFor(
    timestamp,
    options.nowMs ?? Date.now(),
    options.staleAfterSeconds ?? DEFAULT_STALE_AFTER_SECONDS,
  );

  return reading;
}

function singleQueryValue(query, key) {
  const value = query?.[key];
  if (Array.isArray(value)) {
    throw new ApiValidationError(`${key} must be supplied once`);
  }
  return value;
}

function parseOptionalDate(query, key) {
  const raw = singleQueryValue(query, key);
  if (raw === undefined || raw === null || raw === '') {
    return null;
  }
  if (typeof raw !== 'string' || !ISO_INSTANT_PATTERN.test(raw)) {
    throw new ApiValidationError(`${key} must be an ISO-8601 timestamp`);
  }

  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) {
    throw new ApiValidationError(`${key} must be an ISO-8601 timestamp`);
  }
  return date;
}

export function parseHistoryQuery(query = {}) {
  const from = parseOptionalDate(query, 'from');
  const to = parseOptionalDate(query, 'to');
  if (from && to && from > to) {
    throw new ApiValidationError('from must not be later than to');
  }

  const rawLimit = singleQueryValue(query, 'limit');
  let limit = DEFAULT_HISTORY_LIMIT;
  if (rawLimit !== undefined && rawLimit !== null && rawLimit !== '') {
    if (typeof rawLimit !== 'string' || !/^\d+$/.test(rawLimit)) {
      throw new ApiValidationError('limit must be a whole number');
    }
    limit = Number(rawLimit);
    if (limit < 1 || limit > MAX_HISTORY_LIMIT) {
      throw new ApiValidationError(`limit must be between 1 and ${MAX_HISTORY_LIMIT}`);
    }
  }

  const rawOrder = singleQueryValue(query, 'order');
  const order = rawOrder === undefined || rawOrder === null || rawOrder === ''
    ? 'desc'
    : rawOrder;
  if (order !== 'asc' && order !== 'desc') {
    throw new ApiValidationError('order must be asc or desc');
  }

  return { from, to, limit, order };
}

function calculateRegisterDelta(readings, field) {
  const values = readings
    .map((reading) => ({
      timestampMs: Date.parse(reading.timestamp),
      value: reading[field],
    }))
    .filter((entry) => Number.isFinite(entry.timestampMs) && Number.isFinite(entry.value))
    .sort((left, right) => left.timestampMs - right.timestampMs);

  if (values.length < 2) {
    return { deltaKwh: null, resetCount: 0, intervalCount: 0 };
  }

  let deltaKwh = 0;
  let resetCount = 0;
  let intervalCount = 0;

  for (let index = 1; index < values.length; index += 1) {
    const difference = values[index].value - values[index - 1].value;
    if (difference < 0) {
      resetCount += 1;
      continue;
    }
    deltaKwh += difference;
    intervalCount += 1;
  }

  return {
    deltaKwh: intervalCount > 0 ? Number(deltaKwh.toFixed(9)) : null,
    resetCount,
    intervalCount,
  };
}

export function calculateHistorySummary(readings) {
  const timestamps = readings
    .map((reading) => reading.timestamp)
    .filter((timestamp) => Number.isFinite(Date.parse(timestamp)))
    .sort((left, right) => Date.parse(left) - Date.parse(right));
  const imported = calculateRegisterDelta(readings, 'energyImportTotalKwh');
  const exported = calculateRegisterDelta(readings, 'energyExportTotalKwh');

  return {
    sampleCount: readings.length,
    periodStart: timestamps[0] ?? null,
    periodEnd: timestamps.at(-1) ?? null,
    energyImportDeltaKwh: imported.deltaKwh,
    energyExportDeltaKwh: exported.deltaKwh,
    importResetCount: imported.resetCount,
    exportResetCount: exported.resetCount,
    isComplete: imported.deltaKwh !== null
      && exported.deltaKwh !== null
      && imported.resetCount === 0
      && exported.resetCount === 0,
  };
}

function phaseAvailability(reading, field) {
  return {
    l1: reading?.[field]?.l1 !== null && reading?.[field]?.l1 !== undefined,
    l2: reading?.[field]?.l2 !== null && reading?.[field]?.l2 !== undefined,
    l3: reading?.[field]?.l3 !== null && reading?.[field]?.l3 !== undefined,
  };
}

function anyPhaseAvailable(phases) {
  return Object.values(phases).some(Boolean);
}

function measurementAvailable(value) {
  return value !== null && value !== undefined;
}

export function createCapabilities(meterId = configuredMeterId(), latestReading = null) {
  const observed = latestReading !== null && latestReading !== undefined;
  const phasePowerPhases = phaseAvailability(latestReading, 'phasePowerW');
  const voltagePhases = phaseAvailability(latestReading, 'voltageV');
  const currentPhases = phaseAvailability(latestReading, 'currentA');
  const defaultBaseAvailability = !observed;

  return {
    schemaVersion: API_SCHEMA_VERSION,
    meterId,
    observation: {
      source: observed ? 'latest-reading' : 'pipeline-default',
      sampleId: latestReading?.sampleId ?? null,
      timestamp: latestReading?.timestamp ?? null,
      meterDataset: latestReading?.quality?.meterDataset ?? 'unknown',
    },
    connection: {
      mode: 'rest-polling',
      recommendedLatestPollSeconds: 3,
      websocket: false,
      serverSentEvents: false,
    },
    endpoints: {
      latest: '/api/v1/readings/latest',
      history: '/api/v1/readings',
      capabilities: '/api/v1/capabilities',
      legacy: '/api/data',
    },
    fields: {
      powerW: {
        available: defaultBaseAvailability || measurementAvailable(latestReading?.powerW),
        unit: 'W',
      },
      energyImportTotalKwh: {
        available: defaultBaseAvailability
          || measurementAvailable(latestReading?.energyImportTotalKwh),
        unit: 'kWh',
        cumulative: true,
      },
      energyExportTotalKwh: {
        available: defaultBaseAvailability
          || measurementAvailable(latestReading?.energyExportTotalKwh),
        unit: 'kWh',
        cumulative: true,
      },
      phasePowerW: {
        available: anyPhaseAvailable(phasePowerPhases),
        unit: 'W',
        phases: phasePowerPhases,
      },
      voltageV: {
        available: anyPhaseAvailable(voltagePhases),
        unit: 'V',
        phases: voltagePhases,
      },
      currentA: {
        available: anyPhaseAvailable(currentPhases),
        unit: 'A',
        phases: currentPhases,
      },
      frequencyHz: {
        available: measurementAvailable(latestReading?.frequencyHz),
        unit: 'Hz',
      },
      rawObis: {
        available: measurementAvailable(latestReading?.rawObis),
      },
    },
    history: {
      available: true,
      defaultLimit: DEFAULT_HISTORY_LIMIT,
      maxLimit: MAX_HISTORY_LIMIT,
      energyCalculation: 'cumulative-register-delta',
    },
  };
}
