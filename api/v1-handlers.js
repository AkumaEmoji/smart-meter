import {
  API_SCHEMA_VERSION,
  ApiValidationError,
  calculateHistorySummary,
  configuredMeterId,
  createCapabilities,
  normalizeStoredReading,
  parseHistoryQuery,
} from './readings.js';

function rejectMethod(res, allowed = 'GET') {
  res.setHeader('Allow', allowed);
  return res.status(405).json({ error: 'Method not allowed' });
}

function disableCaching(res) {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
}

export function createLatestHandler({ fetchLatestReading, meterId = configuredMeterId() }) {
  return async function latestHandler(req, res) {
    if (req.method !== 'GET') {
      return rejectMethod(res);
    }

    disableCaching(res);
    try {
      const document = await fetchLatestReading();
      if (!document) {
        return res.status(404).json({ error: 'No meter readings found' });
      }

      return res.status(200).json(normalizeStoredReading(document, { meterId }));
    } catch (error) {
      console.error('Latest reading API error:', error.message);
      return res.status(500).json({ error: 'Internal server error' });
    }
  };
}

export function createHistoryHandler({ fetchReadingHistory, meterId = configuredMeterId() }) {
  return async function historyHandler(req, res) {
    if (req.method !== 'GET') {
      return rejectMethod(res);
    }

    disableCaching(res);
    try {
      const options = parseHistoryQuery(req.query);
      const documents = await fetchReadingHistory(options);
      const readings = documents.map((document) => normalizeStoredReading(document, { meterId }));

      return res.status(200).json({
        schemaVersion: API_SCHEMA_VERSION,
        meterId,
        query: {
          from: options.from?.toISOString() ?? null,
          to: options.to?.toISOString() ?? null,
          limit: options.limit,
          order: options.order,
        },
        count: readings.length,
        readings,
        summary: calculateHistorySummary(readings),
      });
    } catch (error) {
      if (error instanceof ApiValidationError) {
        return res.status(400).json({ error: error.message });
      }
      console.error('Reading history API error:', error.message);
      return res.status(500).json({ error: 'Internal server error' });
    }
  };
}

export function createCapabilitiesHandler({
  fetchLatestReading = null,
  meterId = configuredMeterId(),
} = {}) {
  return async function capabilitiesHandler(req, res) {
    if (req.method !== 'GET') {
      return rejectMethod(res);
    }

    disableCaching(res);
    try {
      let latestReading = null;
      if (typeof fetchLatestReading === 'function') {
        const document = await fetchLatestReading();
        if (document) {
          latestReading = normalizeStoredReading(document, { meterId });
        }
      }

      return res.status(200).json(createCapabilities(meterId, latestReading));
    } catch (error) {
      console.error('Capabilities API error:', error.message);
      return res.status(500).json({ error: 'Internal server error' });
    }
  };
}
